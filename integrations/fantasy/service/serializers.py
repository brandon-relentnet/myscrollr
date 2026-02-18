"""
Serializers that convert yahoofantasy library objects into the exact JSON
shapes stored in Postgres JSONB columns and consumed by the Go API.

The Go API reads yahoo_leagues.data and yahoo_standings.data as
json.RawMessage (pass-through), so the shapes here MUST match what the
Rust service previously wrote.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_str(obj: Any, attr: str, default: str = "") -> str:
    """Safely get a string attribute from a yahoofantasy object."""
    val = getattr(obj, attr, None)
    if val is None:
        return default
    return str(val)


def _safe_int(obj: Any, attr: str, default: int = 0) -> int:
    """Safely get an int attribute from a yahoofantasy object."""
    val = getattr(obj, attr, None)
    if val is None:
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _safe_optional_int(obj: Any, attr: str) -> int | None:
    """Safely get an optional int attribute."""
    val = getattr(obj, attr, None)
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


# ---------------------------------------------------------------------------
# yahoo_leagues.data  (flat dict — must match Rust's UserLeague serde output)
# ---------------------------------------------------------------------------

def serialize_league(league: Any, game_code: str) -> dict:
    """
    Convert a yahoofantasy League object into the flat dict stored in
    yahoo_leagues.data.

    Expected output shape (matching Rust UserLeague):
    {
        "league_key": "423.l.12345",
        "league_id": 12345,
        "name": "...",
        "url": "...",
        "logo_url": "...",
        "draft_status": "postdraft",
        "num_teams": 12,
        "scoring_type": "head",
        "league_type": "private",
        "current_week": 14,    // nullable
        "start_week": 1,       // nullable
        "end_week": 17,        // nullable
        "is_finished": false,
        "season": 2025,
        "game_code": "nfl"
    }
    """
    season = _safe_int(league, "season", 0)
    is_finished = _compute_is_finished(league, season)

    return {
        "league_key": _safe_str(league, "league_key"),
        "league_id": _safe_int(league, "league_id"),
        "name": _safe_str(league, "name"),
        "url": _safe_str(league, "url"),
        "logo_url": _safe_str(league, "logo_url"),
        "draft_status": _safe_str(league, "draft_status"),
        "num_teams": _safe_int(league, "num_teams"),
        "scoring_type": _safe_str(league, "scoring_type"),
        "league_type": _safe_str(league, "league_type"),
        "current_week": _safe_optional_int(league, "current_week"),
        "start_week": _safe_optional_int(league, "start_week"),
        "end_week": _safe_optional_int(league, "end_week"),
        "is_finished": is_finished,
        "season": season,
        "game_code": game_code,
    }


def _compute_is_finished(league: Any, season: int) -> bool:
    """
    Replicate the Rust service's is_finished heuristic:
      - is_finished == 1 → true
      - is_finished == 0 → false
      - is_finished missing/None → season < (current_year - 1)

    Yahoo doesn't always return is_finished for predraft/unplayed leagues.
    Current year and previous year leagues could still be in-season
    (e.g. NBA 2025 season runs Oct 2025 – Apr 2026).
    """
    raw = getattr(league, "is_finished", None)
    if raw is not None:
        try:
            val = int(raw)
            return val == 1
        except (ValueError, TypeError):
            pass

    current_year = datetime.now().year
    return season < (current_year - 1)


# ---------------------------------------------------------------------------
# yahoo_standings.data  (JSON array of flat dicts — Vec<LeagueStandings>)
# ---------------------------------------------------------------------------

def serialize_standings(standings_list: Any) -> list[dict]:
    """
    Convert a yahoofantasy standings response into the JSON array stored
    in yahoo_standings.data.

    The yahoofantasy library returns Standings objects that are Team-like
    with nested team_standings. We flatten to match Rust's LeagueStandings:

    [
        {
            "team_key": "...",
            "team_id": 1,
            "name": "...",
            "url": "...",
            "team_logo": "...",
            "wins": 10,
            "losses": 3,
            "ties": 0,
            "percentage": ".769",
            "games_back": "0.0",
            "points_for": "1542.30",
            "points_against": "1320.10"
        }
    ]
    """
    result = []
    if standings_list is None:
        return result

    for team in standings_list:
        # yahoofantasy Standings objects have team_standings as a nested attr
        ts = getattr(team, "team_standings", None)

        # Outcome totals may be nested further
        ot = getattr(ts, "outcome_totals", None) if ts else None

        wins = _safe_int(ot, "wins") if ot else 0
        losses = _safe_int(ot, "losses") if ot else 0
        ties = _safe_int(ot, "ties") if ot else 0
        percentage = _safe_str(ot, "percentage", "0.0") if ot else "0.0"

        games_back = _safe_str(ts, "games_back", "0.0") if ts else "0.0"
        points_for = _safe_str(ts, "points_for", "0") if ts else "0"
        points_against = _safe_str(ts, "points_against", "0") if ts else "0"

        # Team logo: yahoofantasy may store as team_logos.team_logo[0].url
        # or directly as team_logo
        team_logo = ""
        logos = getattr(team, "team_logos", None)
        if logos:
            logo_list = getattr(logos, "team_logo", None)
            if logo_list and isinstance(logo_list, list) and len(logo_list) > 0:
                team_logo = _safe_str(logo_list[0], "url")
            elif logo_list and hasattr(logo_list, "url"):
                team_logo = _safe_str(logo_list, "url")
        if not team_logo:
            team_logo = _safe_str(team, "team_logo", "")

        result.append({
            "team_key": _safe_str(team, "team_key"),
            "team_id": _safe_int(team, "team_id"),
            "name": _safe_str(team, "name"),
            "url": _safe_str(team, "url"),
            "team_logo": team_logo,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "percentage": percentage,
            "games_back": games_back,
            "points_for": points_for,
            "points_against": points_against,
        })

    return result


# ---------------------------------------------------------------------------
# yahoo_matchups.data  (NEW — not previously populated by Rust)
#
# Keyed by team_key.  Shape designed to match Go API's Matchup JSON tags
# from models.go so the Go API can consume them in future endpoints.
# ---------------------------------------------------------------------------

def serialize_matchups(weeks: Any, team_key: str) -> list[dict]:
    """
    Given a list of Week objects from yahoofantasy, extract all matchups
    that involve the given team_key. Returns a list of matchup dicts.

    Each matchup dict matches Go's Matchup struct JSON tags:
    {
        "week": "14",
        "week_start": "2025-12-01",
        "week_end": "2025-12-07",
        "status": "postevent",
        "is_playoffs": "0",
        "is_consolation": "0",
        "is_matchup_of_the_week": "0",
        "is_tied": "0",
        "winner_team_key": "423.l.12345.t.1",
        "teams": { "team": [...] }
    }
    """
    result = []
    if weeks is None:
        return result

    for week in weeks:
        matchups = getattr(week, "matchups", None)
        if matchups is None:
            matchups = getattr(week, "matchup", [])
            if not isinstance(matchups, list):
                matchups = [matchups] if matchups else []

        for matchup in matchups:
            # Check if this matchup involves our team
            teams = _extract_matchup_teams(matchup)
            involved = any(
                _safe_str(t, "team_key") == team_key for t in teams
            )
            if not involved:
                continue

            result.append({
                "week": _safe_str(matchup, "week"),
                "week_start": _safe_str(matchup, "week_start"),
                "week_end": _safe_str(matchup, "week_end"),
                "status": _safe_str(matchup, "status"),
                "is_playoffs": _safe_str(matchup, "is_playoffs", "0"),
                "is_consolation": _safe_str(matchup, "is_consolation", "0"),
                "is_matchup_of_the_week": _safe_str(
                    matchup, "is_matchup_of_the_week", "0"
                ),
                "is_tied": _safe_str(matchup, "is_tied"),
                "winner_team_key": _safe_str(matchup, "winner_team_key"),
                "teams": {
                    "team": [_serialize_matchup_team(t) for t in teams]
                },
            })

    return result


def _extract_matchup_teams(matchup: Any) -> list:
    """Pull the team list out of a yahoofantasy Matchup object."""
    teams_obj = getattr(matchup, "teams", None)
    if teams_obj is None:
        return []

    # Could be teams.team (list) or direct list
    team_list = getattr(teams_obj, "team", None)
    if team_list is None:
        team_list = teams_obj if isinstance(teams_obj, list) else []
    if not isinstance(team_list, list):
        team_list = [team_list]

    return team_list


def _serialize_matchup_team(team: Any) -> dict:
    """Serialize a team within a matchup (minimal info)."""
    return {
        "team_key": _safe_str(team, "team_key"),
        "team_id": _safe_int(team, "team_id"),
        "name": _safe_str(team, "name"),
    }


# ---------------------------------------------------------------------------
# yahoo_rosters.data  (NEW — not previously populated by Rust)
#
# Keyed by team_key.  Shape designed to match Go API's Roster/Player
# JSON tags from models.go.
# ---------------------------------------------------------------------------

def serialize_roster(roster: Any) -> dict:
    """
    Convert a yahoofantasy Roster/players list into the dict stored in
    yahoo_rosters.data. Matches Go's Roster struct JSON tags:

    {
        "players": {
            "player": [
                {
                    "player_key": "...",
                    "player_id": 12345,
                    "name": {"full": "...", "first": "...", "last": "..."},
                    "editorial_team_abbr": "KC",
                    "editorial_team_full_name": "Kansas City Chiefs",
                    "display_position": "QB",
                    "selected_position": {"position": "QB"},
                    "eligible_positions": {"position": ["QB"]},
                    "image_url": "...",
                    "position_type": "O",
                    "player_points": {"coverage_type": "week", "week": 14, "total": 25.5}
                }
            ]
        }
    }
    """
    players = []
    player_list = _get_player_list(roster)

    for player in player_list:
        name_obj = getattr(player, "name", None)
        name = {
            "full": _safe_str(name_obj, "full") if name_obj else _safe_str(player, "name"),
            "first": _safe_str(name_obj, "first") if name_obj else "",
            "last": _safe_str(name_obj, "last") if name_obj else "",
        }

        # Selected position
        sp_obj = getattr(player, "selected_position", None)
        if sp_obj and hasattr(sp_obj, "position"):
            selected_pos = {"position": _safe_str(sp_obj, "position")}
        else:
            selected_pos = {"position": _safe_str(player, "selected_position")}

        # Eligible positions
        ep_obj = getattr(player, "eligible_positions", None)
        if ep_obj and hasattr(ep_obj, "position"):
            raw_pos = getattr(ep_obj, "position", [])
            if isinstance(raw_pos, list):
                eligible_pos = {"position": [str(p) for p in raw_pos]}
            else:
                eligible_pos = {"position": [str(raw_pos)]}
        else:
            eligible_pos = {"position": []}

        # Player points
        pp_obj = getattr(player, "player_points", None)
        player_points = None
        if pp_obj:
            player_points = {
                "coverage_type": _safe_str(pp_obj, "coverage_type"),
                "week": _safe_optional_int(pp_obj, "week"),
                "total": _safe_float(pp_obj, "total", 0.0),
            }

        p = {
            "player_key": _safe_str(player, "player_key"),
            "player_id": _safe_int(player, "player_id"),
            "name": name,
            "editorial_team_abbr": _safe_str(player, "editorial_team_abbr"),
            "editorial_team_full_name": _safe_str(
                player, "editorial_team_full_name"
            ),
            "display_position": _safe_str(player, "display_position"),
            "selected_position": selected_pos,
            "eligible_positions": eligible_pos,
            "image_url": _safe_str(player, "image_url"),
            "position_type": _safe_str(player, "position_type"),
        }
        if player_points:
            p["player_points"] = player_points

        players.append(p)

    return {"players": {"player": players}}


def _get_player_list(roster: Any) -> list:
    """Extract the player list from a roster object."""
    if roster is None:
        return []

    # yahoofantasy might give us roster.players.player or roster.players
    players_obj = getattr(roster, "players", None)
    if players_obj is None:
        return []

    if hasattr(players_obj, "player"):
        plist = getattr(players_obj, "player", [])
    elif isinstance(players_obj, list):
        plist = players_obj
    else:
        plist = []

    if not isinstance(plist, list):
        plist = [plist]

    return plist


def _safe_float(obj: Any, attr: str, default: float = 0.0) -> float:
    """Safely get a float attribute."""
    val = getattr(obj, attr, None)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default
