"""
Yahoo Fantasy sync engine.

Rewritten to:
  - Sync league-wide matchups (all teams, not just user's)
  - Sync ALL teams' rosters (dashboard shows every team)
  - Store team_key/team_name in yahoo_user_leagues
  - Use new (league_key, week) matchup schema
  - Only sync current_week ± 1 for matchups (not all weeks)

Data changes flow: Postgres -> Sequin -> Redis Pub/Sub -> Go SSE -> Frontend
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
    serialize_roster,
    serialize_standings,
    serialize_week_matchups,
    _safe_str,
    _safe_int,
    _as_list,
)

log = logging.getLogger("yahoo-sync")

# Supported game codes
_GAME_CODES = ("nfl", "nba", "nhl", "mlb")

# Delay between Yahoo API calls to avoid rate-limiting
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
      2. Upsert league metadata + user_leagues with team_key
      3. Fetch standings for active leagues
      4. Fetch matchups for active leagues (ALL matchups, league-wide)
      5. Fetch rosters for ALL teams in active leagues
      6. Capture refreshed token
      7. Update last_sync timestamp
    """
    log.info("Syncing data for user %s ...", user.guid)

    try:
        from yahoofantasy import Context
    except ImportError:
        log.error("yahoofantasy library not installed — cannot sync")
        return

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
    seasons = [current_year, current_year - 1]

    for game_code in _GAME_CODES:
        for season in seasons:
            try:
                leagues = ctx.get_leagues(game_code, season)
                for league in leagues:
                    all_leagues.append((league, game_code))
            except Exception as exc:
                log.debug(
                    "No %s leagues for user %s season %d: %s",
                    game_code, user.guid, season, exc,
                )

    log.info("Found %d leagues for user %s", len(all_leagues), user.guid)

    # ------------------------------------------------------------------
    # 2. Upsert league metadata + identify user's team in each league
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

        # Find the user's team in this league and store it
        team_key, team_name = _find_user_team(league_obj, user.guid)
        await db.upsert_yahoo_user_league(
            pool, user.guid, league_key,
            team_key=team_key,
            team_name=team_name,
        )

    # ------------------------------------------------------------------
    # 3. Filter to active (not finished) leagues
    # ------------------------------------------------------------------
    active_leagues = [
        (lo, gc) for lo, gc in all_leagues
        if not serialize_league(lo, gc)["is_finished"]
    ]
    skipped = len(all_leagues) - len(active_leagues)
    if skipped > 0:
        log.info("Skipping %d finished leagues", skipped)

    # ------------------------------------------------------------------
    # 4. Standings for active leagues
    # ------------------------------------------------------------------
    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")
        await asyncio.sleep(_API_DELAY_SECS)

        try:
            standings_objs = league_obj.standings()
            standings_data = serialize_standings(standings_objs)
            await db.upsert_yahoo_standings(pool, league_key, standings_data)
            log.info("Synced standings for league %s (%d teams)", league_key, len(standings_data))
        except Exception as exc:
            log.warning("Failed standings for league %s: %s", league_key, exc)

    # ------------------------------------------------------------------
    # 5. Matchups for active leagues — ALL matchups, league-wide
    #    Only sync current_week and current_week-1 (completed) to limit
    #    API calls.  Full history isn't needed for the dashboard/feed.
    # ------------------------------------------------------------------
    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")
        await asyncio.sleep(_API_DELAY_SECS)

        try:
            current_week = _safe_int(league_obj, "current_week", 0)
            if current_week <= 0:
                log.debug("No current_week for league %s, skipping matchups", league_key)
                continue

            # Sync current week + previous week
            weeks_to_sync = [current_week]
            if current_week > 1:
                weeks_to_sync.append(current_week - 1)

            for week_num in weeks_to_sync:
                await asyncio.sleep(_API_DELAY_SECS)
                try:
                    week_obj = _get_week(league_obj, week_num)
                    if week_obj is None:
                        continue

                    wk, matchup_data = serialize_week_matchups(week_obj)
                    if wk <= 0:
                        wk = week_num  # fallback to the requested week

                    if matchup_data:
                        await db.upsert_yahoo_matchups(pool, league_key, wk, matchup_data)
                        log.info(
                            "Synced %d matchups for league %s week %d",
                            len(matchup_data), league_key, wk,
                        )
                except Exception as exc:
                    log.warning(
                        "Failed matchups for league %s week %d: %s",
                        league_key, week_num, exc,
                    )
        except Exception as exc:
            log.warning("Failed matchups for league %s: %s", league_key, exc)

    # ------------------------------------------------------------------
    # 6. Rosters for ALL teams in active leagues
    #    (Dashboard needs to show every team's roster, not just the user's)
    # ------------------------------------------------------------------
    for league_obj, game_code in active_leagues:
        league_key = getattr(league_obj, "league_key", "")

        try:
            teams = _get_all_teams(league_obj)
            for team_obj in teams:
                team_key = getattr(team_obj, "team_key", "")
                team_name = _safe_str(team_obj, "name")
                await asyncio.sleep(_API_DELAY_SECS)

                try:
                    roster_obj = team_obj.roster()
                    roster_data = serialize_roster(
                        roster_obj,
                        team_key=team_key,
                        team_name=team_name,
                    )
                    await db.upsert_yahoo_roster(pool, team_key, league_key, roster_data)
                    log.info("Synced roster for team %s (%s)", team_key, team_name)
                except Exception as exc:
                    log.warning("Failed roster for team %s: %s", team_key, exc)
        except Exception as exc:
            log.warning("Failed to get teams for league %s: %s", league_key, exc)

    # ------------------------------------------------------------------
    # 7. Capture refreshed token if the library refreshed it
    # ------------------------------------------------------------------
    new_refresh = getattr(ctx, "_refresh_token", None)
    if new_refresh and new_refresh != user.refresh_token:
        log.info("Refresh token updated for user %s, persisting...", user.guid)
        await db.upsert_yahoo_user(pool, user.guid, user.logto_sub, new_refresh)

    # ------------------------------------------------------------------
    # 8. Mark sync complete
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

    leagues = ctx.get_leagues(game_code, season)

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

    # Store user's team_key
    team_key, team_name = _find_user_team(target_league, user.guid)
    await db.upsert_yahoo_user_league(
        pool, user.guid, league_key,
        team_key=team_key,
        team_name=team_name,
    )

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

        # Matchups — all matchups for current week (league-wide)
        try:
            current_week = _safe_int(target_league, "current_week", 0)
            if current_week > 0:
                weeks_to_sync = [current_week]
                if current_week > 1:
                    weeks_to_sync.append(current_week - 1)

                for week_num in weeks_to_sync:
                    await asyncio.sleep(_API_DELAY_SECS)
                    try:
                        week_obj = _get_week(target_league, week_num)
                        if week_obj is None:
                            continue

                        wk, matchup_data = serialize_week_matchups(week_obj)
                        if wk <= 0:
                            wk = week_num

                        if matchup_data:
                            await db.upsert_yahoo_matchups(pool, league_key, wk, matchup_data)
                            log.info(
                                "import: synced %d matchups for %s week %d",
                                len(matchup_data), league_key, wk,
                            )
                    except Exception as exc:
                        log.warning(
                            "import: failed matchups for %s week %d: %s",
                            league_key, week_num, exc,
                        )
        except Exception as exc:
            log.warning("import: failed matchups for %s: %s", league_key, exc)

        # Rosters — ALL teams (dashboard needs full league visibility)
        try:
            teams = _get_all_teams(target_league)
            for team_obj in teams:
                tk = getattr(team_obj, "team_key", "")
                tn = _safe_str(team_obj, "name")
                await asyncio.sleep(_API_DELAY_SECS)
                try:
                    roster_obj = team_obj.roster()
                    roster_data = serialize_roster(
                        roster_obj,
                        team_key=tk,
                        team_name=tn,
                    )
                    await db.upsert_yahoo_roster(pool, tk, league_key, roster_data)
                    log.info("import: synced roster for %s", tk)
                except Exception as exc:
                    log.warning("import: failed roster for %s: %s", tk, exc)
        except Exception as exc:
            log.warning("import: failed to get teams for %s: %s", league_key, exc)
    else:
        log.info("import: league %s is finished, skipping standings/matchups/rosters", league_key)

    # Capture refreshed token if the library refreshed it
    new_refresh = getattr(ctx, "_refresh_token", None)
    if new_refresh and new_refresh != user.refresh_token:
        log.info("import: refresh token updated for user %s, persisting...", user.guid)
        await db.upsert_yahoo_user(pool, user.guid, user.logto_sub, new_refresh)

    await db.update_user_sync_time(pool, user.guid)
    log.info("import: complete for league %s (user %s)", league_key, user.guid)

    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_user_team(league: Any, guid: str) -> tuple[str | None, str | None]:
    """
    Find the team_key and team_name owned by the given Yahoo GUID in a league.
    Returns (team_key, team_name) or (None, None) if not found.
    """
    try:
        teams = league.teams()
    except Exception:
        return None, None

    if not teams:
        return None, None

    for team in teams:
        managers = getattr(team, "managers", None)
        if managers is None:
            managers = getattr(team, "manager", None)
        if managers is None:
            continue

        mgr_list = _as_list(
            getattr(managers, "manager", managers)
            if hasattr(managers, "manager") else managers
        )

        for mgr in mgr_list:
            mgr_guid = getattr(mgr, "guid", None)
            if mgr_guid and str(mgr_guid) == guid:
                return (
                    _safe_str(team, "team_key") or None,
                    _safe_str(team, "name") or None,
                )

    return None, None


def _get_all_teams(league: Any) -> list:
    """Return all Team objects in a league."""
    try:
        teams = league.teams()
        return list(teams) if teams else []
    except Exception:
        return []


def _get_week(league: Any, week_num: int) -> Any | None:
    """
    Get a single Week object from a league for the given week number.

    yahoofantasy's league.weeks() returns all weeks but triggers API
    calls for each.  Instead, we use league.scoreboard(week_num) which
    returns the scoreboard for a specific week — much more efficient.

    Falls back to league.weeks() and filtering if scoreboard() fails.
    """
    # Try the efficient path: scoreboard for a specific week
    try:
        scoreboard = league.scoreboard(week_num)
        if scoreboard is not None:
            return scoreboard
    except Exception:
        pass

    # Fallback: get all weeks and find the right one
    try:
        weeks = league.weeks()
        if weeks:
            for week in weeks:
                wn = getattr(week, "week_num", None)
                if wn is not None and int(wn) == week_num:
                    return week
    except Exception:
        pass

    return None


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
        raise

    log.info("Yahoo sync loop shut down")
