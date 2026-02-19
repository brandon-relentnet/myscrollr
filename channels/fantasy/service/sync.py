"""
Yahoo Fantasy sync engine.

Mirrors the former Rust service's sync loop (lib.rs start_active_sync /
sync_user_data) but uses the yahoofantasy Python library for API calls.
Adds matchup and roster syncing (Rust never populated those tables).

Data changes flow through: Postgres -> Sequin -> Redis Pub/Sub -> Go SSE -> Frontend
"""

from __future__ import annotations

import asyncio
import logging
import os
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any

import asyncpg

import database as db
from serializers import (
    serialize_league,
    serialize_matchups,
    serialize_roster,
    serialize_standings,
)

log = logging.getLogger("yahoo-sync")

# Supported game codes (must match Rust's categorisation)
_GAME_CODES = ("nfl", "nba", "nhl", "mlb")

# Delay between individual Yahoo API calls to avoid rate-limiting (ms in Rust was 500)
_API_DELAY_SECS = 0.5


# ---------------------------------------------------------------------------
# Per-user sync
# ---------------------------------------------------------------------------

async def sync_user(
    user: db.YahooUser,
    pool: asyncpg.Pool,
    client_id: str,
    client_secret: str,
) -> None:
    """
    Sync all data for a single Yahoo user:
      1. Fetch leagues (all game codes for current + recent seasons)
      2. Upsert league metadata
      3. Fetch standings for active leagues
      4. Fetch matchups for active leagues (NEW)
      5. Fetch rosters for user's teams in active leagues (NEW)
      6. Update last_sync timestamp
    """
    log.info("Syncing data for user %s ...", user.guid)

    try:
        from yahoofantasy import Context
    except ImportError:
        log.error("yahoofantasy library not installed — cannot sync")
        return

    # Create a per-user yahoofantasy context.
    # The library handles token refresh internally.
    # persist_key isolates file-based cache per user so users don't share stale data.
    ctx = Context(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=user.refresh_token,
        persist_key=user.guid,
    )

    # ------------------------------------------------------------------
    # 1. Fetch leagues across all supported game codes / seasons
    # ------------------------------------------------------------------
    all_leagues: list[tuple[Any, str]] = []  # (league_obj, game_code)

    current_year = datetime.now().year
    # Fetch current year and previous year (covers in-progress seasons
    # like NBA 2025 running Oct 2025 – Apr 2026)
    seasons = [current_year, current_year - 1]

    for game_code in _GAME_CODES:
        for season in seasons:
            try:
                leagues = ctx.get_leagues(game_code, season)
                for league in leagues:
                    all_leagues.append((league, game_code))
            except Exception as exc:
                # Some game/season combos just don't exist for a user
                log.debug(
                    "No %s leagues for user %s season %d: %s",
                    game_code, user.guid, season, exc,
                )

    log.info("Found %d leagues for user %s", len(all_leagues), user.guid)

    # ------------------------------------------------------------------
    # 2. Upsert league metadata
    # ------------------------------------------------------------------
    for league_obj, game_code in all_leagues:
        league_data = serialize_league(league_obj, game_code)
        league_key = league_data["league_key"]

        await db.upsert_yahoo_league(
            pool,
            guid=user.guid,
            league_key=league_key,
            name=league_data["name"],
            game_code=game_code,
            season=str(league_data["season"]),
            data=league_data,
        )
        await db.upsert_yahoo_user_league(pool, user.guid, league_key)

    # ------------------------------------------------------------------
    # 3. Standings for active (not finished) leagues
    # ------------------------------------------------------------------
    active_leagues = [
        (lo, gc) for lo, gc in all_leagues
        if not serialize_league(lo, gc)["is_finished"]
    ]
    skipped = len(all_leagues) - len(active_leagues)
    if skipped > 0:
        log.info("Skipping standings for %d finished leagues", skipped)

    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")
        await asyncio.sleep(_API_DELAY_SECS)

        try:
            standings_objs = league_obj.standings()
            standings_data = serialize_standings(standings_objs)
            await db.upsert_yahoo_standings(pool, league_key, standings_data)
            log.info("Synced standings for league %s", league_key)
        except Exception as exc:
            log.warning(
                "Failed to fetch standings for league %s: %s", league_key, exc
            )

    # ------------------------------------------------------------------
    # 4. Matchups for active leagues (NEW — Rust never did this)
    # ------------------------------------------------------------------
    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")
        await asyncio.sleep(_API_DELAY_SECS)

        try:
            weeks = league_obj.weeks()
            # We need team keys for this user's teams in this league
            team_keys = _get_user_team_keys(league_obj, user.guid)

            for team_key in team_keys:
                matchup_data = serialize_matchups(weeks, team_key)
                if matchup_data:
                    await db.upsert_yahoo_matchups(pool, team_key, matchup_data)
                    log.info(
                        "Synced %d matchups for team %s",
                        len(matchup_data), team_key,
                    )
        except Exception as exc:
            log.warning(
                "Failed to fetch matchups for league %s: %s", league_key, exc
            )

    # ------------------------------------------------------------------
    # 5. Rosters for user's teams in active leagues (NEW)
    # ------------------------------------------------------------------
    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")

        try:
            teams = _get_user_teams(league_obj, user.guid)
            for team_obj in teams:
                team_key = getattr(team_obj, "team_key", "")
                await asyncio.sleep(_API_DELAY_SECS)

                try:
                    roster_obj = team_obj.roster()
                    roster_data = serialize_roster(roster_obj)
                    await db.upsert_yahoo_roster(
                        pool, team_key, league_key, roster_data
                    )
                    log.info("Synced roster for team %s", team_key)
                except Exception as exc:
                    log.warning(
                        "Failed to fetch roster for team %s: %s",
                        team_key, exc,
                    )
        except Exception as exc:
            log.warning(
                "Failed to get teams for league %s: %s", league_key, exc
            )

    # ------------------------------------------------------------------
    # 6. Capture refreshed token if the library refreshed it
    # ------------------------------------------------------------------
    new_refresh = getattr(ctx, "_refresh_token", None)
    if new_refresh and new_refresh != user.refresh_token:
        log.info("Refresh token was updated for user %s, persisting...", user.guid)
        await db.upsert_yahoo_user(
            pool, user.guid, user.logto_sub, new_refresh
        )

    # ------------------------------------------------------------------
    # 7. Mark sync complete
    # ------------------------------------------------------------------
    await db.update_user_sync_time(pool, user.guid)
    log.info("Sync complete for user %s", user.guid)


# ---------------------------------------------------------------------------
# Fast league discovery (no DB writes — returns metadata only)
# ---------------------------------------------------------------------------

async def discover_leagues(
    user: db.YahooUser,
    client_id: str,
    client_secret: str,
) -> list[dict[str, Any]]:
    """
    Discover all Yahoo Fantasy leagues for a user across all game codes
    and recent seasons.  Returns serialized league metadata WITHOUT
    persisting anything to the database.

    Uses a ThreadPoolExecutor to parallelise the 8 blocking Yahoo API
    calls (4 game codes x 2 seasons), cutting wall-clock time from
    ~8-12s to ~2-3s.
    """
    try:
        from yahoofantasy import Context
    except ImportError:
        log.error("yahoofantasy library not installed — cannot discover leagues")
        return []

    ctx = Context(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=user.refresh_token,
        persist_key=user.guid,
    )

    current_year = datetime.now().year
    seasons = [current_year, current_year - 1]

    # Build the list of (game_code, season) combos to fetch
    combos = [(gc, s) for gc in _GAME_CODES for s in seasons]

    def _fetch_combo(game_code: str, season: int) -> list[tuple[Any, str]]:
        """Blocking call — runs inside a thread."""
        try:
            leagues = ctx.get_leagues(game_code, season)
            return [(league, game_code) for league in leagues]
        except Exception as exc:
            log.debug(
                "discover: no %s leagues for user %s season %d: %s",
                game_code, user.guid, season, exc,
            )
            return []

    loop = asyncio.get_running_loop()
    all_leagues: list[tuple[Any, str]] = []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [
            loop.run_in_executor(executor, _fetch_combo, gc, s)
            for gc, s in combos
        ]
        results = await asyncio.gather(*futures, return_exceptions=True)

    for result in results:
        if isinstance(result, BaseException):
            log.warning("discover: thread raised: %s", result)
            continue
        all_leagues.extend(result)  # type: ignore[arg-type]

    log.info("Discovered %d leagues for user %s", len(all_leagues), user.guid)

    # Serialize without DB writes
    serialized: list[dict[str, Any]] = []
    for league_obj, game_code in all_leagues:
        try:
            serialized.append(serialize_league(league_obj, game_code))
        except Exception as exc:
            log.warning("discover: failed to serialize league: %s", exc)

    return serialized


# ---------------------------------------------------------------------------
# Single-league import (fetches + persists one league's full data)
# ---------------------------------------------------------------------------

async def import_single_league(
    user: db.YahooUser,
    pool: asyncpg.Pool,
    client_id: str,
    client_secret: str,
    league_key: str,
    game_code: str,
    season: int,
) -> dict[str, Any]:
    """
    Import a single league: fetches league metadata, standings, matchups,
    and rosters from Yahoo, then persists everything to the database.

    Returns a dict with the imported league data and standings for
    immediate frontend rendering.
    """
    try:
        from yahoofantasy import Context
    except ImportError:
        raise RuntimeError("yahoofantasy library not installed")

    ctx = Context(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=user.refresh_token,
        persist_key=user.guid,
    )

    # Fetch leagues for this specific game_code + season
    # (yahoofantasy file persistence may cache this from the discover call)
    leagues = ctx.get_leagues(game_code, season)

    # Find the specific league by league_key
    target_league = None
    for league in leagues:
        if getattr(league, "league_key", "") == league_key:
            target_league = league
            break

    if target_league is None:
        raise ValueError(f"League {league_key} not found in {game_code}/{season}")

    # Serialize and persist league metadata
    league_data = serialize_league(target_league, game_code)
    await db.upsert_yahoo_league(
        pool,
        guid=user.guid,
        league_key=league_key,
        name=league_data["name"],
        game_code=game_code,
        season=str(league_data["season"]),
        data=league_data,
    )
    await db.upsert_yahoo_user_league(pool, user.guid, league_key)

    result: dict[str, Any] = {"league": league_data, "standings": None}

    # For active leagues, also fetch standings, matchups, and rosters
    if not league_data["is_finished"]:
        # Standings
        try:
            await asyncio.sleep(_API_DELAY_SECS)
            standings_objs = target_league.standings()
            standings_data = serialize_standings(standings_objs)
            await db.upsert_yahoo_standings(pool, league_key, standings_data)
            result["standings"] = standings_data
            log.info("import: synced standings for %s", league_key)
        except Exception as exc:
            log.warning("import: failed standings for %s: %s", league_key, exc)

        # Matchups
        try:
            await asyncio.sleep(_API_DELAY_SECS)
            weeks = target_league.weeks()
            team_keys = _get_user_team_keys(target_league, user.guid)
            for team_key in team_keys:
                matchup_data = serialize_matchups(weeks, team_key)
                if matchup_data:
                    await db.upsert_yahoo_matchups(pool, team_key, matchup_data)
                    log.info("import: synced %d matchups for %s", len(matchup_data), team_key)
        except Exception as exc:
            log.warning("import: failed matchups for %s: %s", league_key, exc)

        # Rosters
        try:
            teams = _get_user_teams(target_league, user.guid)
            for team_obj in teams:
                team_key = getattr(team_obj, "team_key", "")
                await asyncio.sleep(_API_DELAY_SECS)
                try:
                    roster_obj = team_obj.roster()
                    roster_data = serialize_roster(roster_obj)
                    await db.upsert_yahoo_roster(pool, team_key, league_key, roster_data)
                    log.info("import: synced roster for %s", team_key)
                except Exception as exc:
                    log.warning("import: failed roster for %s: %s", team_key, exc)
        except Exception as exc:
            log.warning("import: failed to get teams for %s: %s", league_key, exc)
    else:
        log.info("import: league %s is finished, skipping standings/matchups/rosters", league_key)

    # Capture refreshed token if the library refreshed it
    new_refresh = getattr(ctx, "_refresh_token", None)
    if new_refresh and new_refresh != user.refresh_token:
        log.info("import: refresh token updated for user %s, persisting...", user.guid)
        await db.upsert_yahoo_user(pool, user.guid, user.logto_sub, new_refresh)

    # Update last_sync
    await db.update_user_sync_time(pool, user.guid)
    log.info("import: complete for league %s (user %s)", league_key, user.guid)

    return result


# ---------------------------------------------------------------------------
# Helpers to find user's own teams in a league
# ---------------------------------------------------------------------------

def _get_user_team_keys(league: Any, guid: str) -> list[str]:
    """Return team_keys owned by the given Yahoo GUID in a league."""
    teams = _get_user_teams(league, guid)
    return [getattr(t, "team_key", "") for t in teams if getattr(t, "team_key", "")]


def _get_user_teams(league: Any, guid: str) -> list:
    """
    Return Team objects owned by the given user in a league.

    yahoofantasy doesn't directly expose ownership, so we use
    league.teams() and check the manager GUID.  Fallback: return
    all teams if we can't determine ownership (better to over-fetch
    than miss data).
    """
    try:
        teams = league.teams()
    except Exception:
        return []

    if not teams:
        return []

    # Try to filter by manager guid
    user_teams = []
    for team in teams:
        managers = getattr(team, "managers", None)
        if managers is None:
            managers = getattr(team, "manager", None)

        if managers is None:
            continue

        if not isinstance(managers, list):
            managers = [managers]

        for mgr in managers:
            mgr_guid = getattr(mgr, "guid", None)
            if mgr_guid and str(mgr_guid) == guid:
                user_teams.append(team)
                break

    # If we couldn't identify any, return all teams — the serializer
    # filters matchups by team_key anyway, so it's safe
    if not user_teams:
        return list(teams)

    return user_teams


# ---------------------------------------------------------------------------
# Sync loop (called from main.py)
# ---------------------------------------------------------------------------

async def run_sync_loop(
    pool: asyncpg.Pool,
    shutdown_event: asyncio.Event,
) -> None:
    """
    Main sync loop.  Fetches all users and syncs each one, then sleeps
    for SYNC_INTERVAL_SECS (default 120s).

    The entire function body is wrapped in try/except so that if this
    coroutine is running inside asyncio.create_task(), any unexpected
    crash is logged instead of silently swallowed.
    """
    try:
        client_id = os.environ["YAHOO_CLIENT_ID"]
        client_secret = os.environ["YAHOO_CLIENT_SECRET"]
    except KeyError as exc:
        log.error("Sync loop cannot start — missing env var: %s", exc)
        return

    raw_interval = os.environ.get("SYNC_INTERVAL_SECS", "").strip()
    try:
        interval = int(raw_interval) if raw_interval else 120
    except ValueError:
        log.warning(
            "SYNC_INTERVAL_SECS=%r is not a valid integer, defaulting to 120s",
            raw_interval,
        )
        interval = 120

    log.info(
        "Yahoo sync loop starting (interval=%ds, client_id=%s...)",
        interval, client_id[:8] if client_id else "<empty>",
    )

    try:
        while not shutdown_event.is_set():
            try:
                users = await db.get_all_yahoo_users(pool)
                log.info("Syncing %d Yahoo users...", len(users))

                for user in users:
                    if shutdown_event.is_set():
                        break
                    try:
                        await sync_user(user, pool, client_id, client_secret)
                    except Exception as exc:
                        log.error(
                            "Failed to sync user %s: %s", user.guid, exc,
                            exc_info=True,
                        )

            except Exception as exc:
                log.error(
                    "Failed to fetch users from DB: %s", exc, exc_info=True,
                )

            # Sleep in small increments so we can respond to shutdown quickly
            for _ in range(interval):
                if shutdown_event.is_set():
                    break
                await asyncio.sleep(1)

    except Exception as exc:
        log.error(
            "Sync loop crashed with unhandled exception: %s", exc,
            exc_info=True,
        )
        raise  # Re-raise so the task's done_callback also sees it

    log.info("Yahoo sync loop shut down")
