"""
Serializers that convert yahoofantasy library objects into the exact JSON
shapes stored in Postgres JSONB columns.

All attributes on yahoofantasy objects are dynamically set from Yahoo's XML,
so any attribute may be absent or None.  Every access goes through _safe_*
helpers to avoid AttributeError.

Rewritten to capture:
  - Matchup scores (team_points.total, team_projected_points.total)
  - Matchup team logos
  - Standings rank, streak, playoff_seed, clinched_playoffs, manager_name
  - Player injury status (status, status_full, injury_note)
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


def _safe_float(obj: Any, attr: str, default: float = 0.0) -> float:
    """Safely get a float attribute."""
    val = getattr(obj, attr, None)
    if val is None:
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_optional_float(obj: Any, attr: str) -> float | None:
    """Safely get an optional float attribute."""
    val = getattr(obj, attr, None)
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _safe_optional_str(obj: Any, attr: str) -> str | None:
    """Safely get an optional string attribute (returns None instead of '')."""
    val = getattr(obj, attr, None)
    if val is None:
        return None
    return str(val)


def _extract_team_logo(team: Any) -> str:
    """
    Extract a team logo URL from a yahoofantasy team-like object.
    Handles multiple nesting patterns:
      - team.team_logos.team_logo[0].url (list)
      - team.team_logos.team_logo.url (single)
      - team.team_logo (direct)
    """
    logos = getattr(team, "team_logos", None)
    if logos:
        logo_list = getattr(logos, "team_logo", None)
        if logo_list and isinstance(logo_list, list) and len(logo_list) > 0:
            return _safe_str(logo_list[0], "url")
        elif logo_list and hasattr(logo_list, "url"):
            return _safe_str(logo_list, "url")
    return _safe_str(team, "team_logo", "")


def _as_list(val: Any) -> list:
    """Ensure a value is a list (wraps singletons, passes through lists)."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


# ---------------------------------------------------------------------------
# yahoo_leagues.data  (flat dict)
# ---------------------------------------------------------------------------

def serialize_league(league: Any, game_code: str) -> dict:
    """
    Convert a yahoofantasy League object into the flat dict stored in
    yahoo_leagues.data.

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
        "current_week": 14,
        "start_week": 1,
        "end_week": 17,
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
    Heuristic for is_finished:
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
# yahoo_standings.data  (JSON array of flat dicts)
#
# REWRITTEN: Now includes rank, streak, playoff_seed, clinched_playoffs,
# manager_name, waiver_priority — all missing from the old serializer.
# ---------------------------------------------------------------------------

def serialize_standings(standings_list: Any) -> list[dict]:
    """
    Convert a yahoofantasy standings response into the JSON array stored
    in yahoo_standings.data.

    Each element:
    {
        "team_key": "...",
        "team_id": 1,
        "name": "...",
        "url": "...",
        "team_logo": "...",
        "manager_name": "...",
        "rank": 1,
        "wins": 10,
        "losses": 3,
        "ties": 0,
        "percentage": ".769",
        "games_back": "0.0",
        "points_for": "1542.30",
        "points_against": "1320.10",
        "streak_type": "win",
        "streak_value": 3,
        "playoff_seed": 1,
        "clinched_playoffs": false,
        "waiver_priority": 5
    }
    """
    result = []
    if standings_list is None:
        return result

    for team in standings_list:
        ts = getattr(team, "team_standings", None)
        ot = getattr(ts, "outcome_totals", None) if ts else None
        streak = getattr(ts, "streak", None) if ts else None

        wins = _safe_int(ot, "wins") if ot else 0
        losses = _safe_int(ot, "losses") if ot else 0
        ties = _safe_int(ot, "ties") if ot else 0
        percentage = _safe_str(ot, "percentage", "0.0") if ot else "0.0"

        games_back = _safe_str(ts, "games_back", "0.0") if ts else "0.0"
        points_for = _safe_str(ts, "points_for", "0") if ts else "0"
        points_against = _safe_str(ts, "points_against", "0") if ts else "0"

        # Rank and playoff info (NEW)
        rank = _safe_optional_int(ts, "rank") if ts else None
        playoff_seed = _safe_optional_int(ts, "playoff_seed") if ts else None

        # Streak info (NEW)
        streak_type = _safe_str(streak, "type") if streak else ""
        streak_value = _safe_int(streak, "value") if streak else 0

        # Clinched playoffs (NEW) — attribute may be absent if not clinched
        clinched_raw = _safe_optional_str(team, "clinched_playoffs")
        clinched = clinched_raw == "1" if clinched_raw else False

        # Manager name (NEW)
        manager_name = _extract_manager_name(team)

        # Waiver priority (NEW)
        waiver_priority = _safe_optional_int(team, "waiver_priority")

        result.append({
            "team_key": _safe_str(team, "team_key"),
            "team_id": _safe_int(team, "team_id"),
            "name": _safe_str(team, "name"),
            "url": _safe_str(team, "url"),
            "team_logo": _extract_team_logo(team),
            "manager_name": manager_name,
            "rank": rank,
            "wins": wins,
            "losses": losses,
            "ties": ties,
            "percentage": percentage,
            "games_back": games_back,
            "points_for": points_for,
            "points_against": points_against,
            "streak_type": streak_type,
            "streak_value": streak_value,
            "playoff_seed": playoff_seed,
            "clinched_playoffs": clinched,
            "waiver_priority": waiver_priority,
        })

    return result


def _extract_manager_name(team: Any) -> str:
    """
    Extract the primary manager's display name from a team object.

    yahoofantasy stores managers at team.managers.manager (list or single).
    Each manager has a 'nickname' attribute.
    The Team class also has a .manager shortcut property.
    """
    # Try the .manager shortcut first (yahoofantasy Team property)
    mgr = getattr(team, "manager", None)
    if mgr and hasattr(mgr, "nickname"):
        return _safe_str(mgr, "nickname")

    # Fall back to managers.manager list
    managers_obj = getattr(team, "managers", None)
    if managers_obj is None:
        return ""

    mgr_list = getattr(managers_obj, "manager", None)
    if mgr_list is None:
        return ""

    entries = _as_list(mgr_list)
    if entries:
        return _safe_str(entries[0], "nickname")

    return ""


# ---------------------------------------------------------------------------
# yahoo_matchups.data  (JSON array of matchup dicts)
#
# REWRITTEN: Now league-wide (all matchups for a week, not filtered by team).
# Includes team_points.total, team_projected_points.total, and team logos.
# ---------------------------------------------------------------------------

def serialize_week_matchups(week_obj: Any) -> tuple[int, list[dict]]:
    """
    Serialize ALL matchups for a single week.

    Returns (week_number, list_of_matchup_dicts).  The week number is
    extracted from the first matchup's "week" attribute.

    Each matchup dict:
    {
        "week": 14,
        "week_start": "2025-12-01",
        "week_end": "2025-12-07",
        "status": "postevent",
        "is_playoffs": false,
        "is_consolation": false,
        "is_tied": false,
        "winner_team_key": "423.l.12345.t.1",
        "teams": [
            {
                "team_key": "...",
                "team_id": 1,
                "name": "...",
                "team_logo": "...",
                "manager_name": "...",
                "points": 142.68,
                "projected_points": 136.79
            },
            { ... }
        ]
    }
    """
    matchups_raw = getattr(week_obj, "matchups", None)
    if matchups_raw is None:
        matchups_raw = getattr(week_obj, "matchup", [])
    matchups_list = _as_list(matchups_raw)

    week_num = 0
    result = []

    for matchup in matchups_list:
        week_val = _safe_int(matchup, "week")
        if week_val > 0:
            week_num = week_val

        # Extract teams
        teams = _extract_matchup_teams(matchup)
        serialized_teams = [_serialize_matchup_team(t) for t in teams]

        result.append({
            "week": week_val,
            "week_start": _safe_str(matchup, "week_start"),
            "week_end": _safe_str(matchup, "week_end"),
            "status": _safe_str(matchup, "status"),
            "is_playoffs": _safe_str(matchup, "is_playoffs", "0") == "1",
            "is_consolation": _safe_str(matchup, "is_consolation", "0") == "1",
            "is_tied": _safe_str(matchup, "is_tied", "0") == "1",
            "winner_team_key": _safe_optional_str(matchup, "winner_team_key"),
            "teams": serialized_teams,
        })

    # Use the week_num from the Week object if available
    wk = getattr(week_obj, "week_num", None)
    if wk is not None:
        try:
            week_num = int(wk)
        except (ValueError, TypeError):
            pass

    return week_num, result


def _extract_matchup_teams(matchup: Any) -> list:
    """Pull the team list out of a yahoofantasy Matchup object."""
    teams_obj = getattr(matchup, "teams", None)
    if teams_obj is None:
        return []

    team_list = getattr(teams_obj, "team", None)
    if team_list is None:
        team_list = teams_obj if isinstance(teams_obj, list) else []
    if not isinstance(team_list, list):
        team_list = [team_list]

    return team_list


def _serialize_matchup_team(team: Any) -> dict:
    """
    Serialize a team within a matchup.  NOW includes:
      - team_points.total (actual score)
      - team_projected_points.total (projected score)
      - team logo
      - manager name
    """
    # Points (THE MOST IMPORTANT DATA — was missing before!)
    tp = getattr(team, "team_points", None)
    points = _safe_optional_float(tp, "total") if tp else None

    tpp = getattr(team, "team_projected_points", None)
    projected = _safe_optional_float(tpp, "total") if tpp else None

    return {
        "team_key": _safe_str(team, "team_key"),
        "team_id": _safe_int(team, "team_id"),
        "name": _safe_str(team, "name"),
        "team_logo": _extract_team_logo(team),
        "manager_name": _extract_manager_name(team),
        "points": points,
        "projected_points": projected,
    }


# ---------------------------------------------------------------------------
# yahoo_rosters.data  (dict with players list)
#
# REWRITTEN: Now includes injury status, status_full, injury_note.
# Flattened structure (no nested "players.player" wrapper — cleaner for Go).
# ---------------------------------------------------------------------------

def serialize_roster(roster: Any, team_key: str = "", team_name: str = "") -> dict:
    """
    Convert a yahoofantasy Roster/players list into the dict stored in
    yahoo_rosters.data.

    {
        "team_key": "...",
        "team_name": "...",
        "players": [
            {
                "player_key": "423.p.12345",
                "player_id": 12345,
                "name": {"full": "...", "first": "...", "last": "..."},
                "editorial_team_abbr": "KC",
                "editorial_team_full_name": "Kansas City Chiefs",
                "display_position": "QB",
                "selected_position": "QB",
                "eligible_positions": ["QB"],
                "image_url": "...",
                "position_type": "O",
                "status": "Q",
                "status_full": "Questionable",
                "injury_note": "Knee",
                "player_points": 25.5
            }
        ]
    }
    """
    players = []
    player_list = _get_player_list(roster)

    for player in player_list:
        # Name
        name_obj = getattr(player, "name", None)
        name = {
            "full": _safe_str(name_obj, "full") if name_obj else _safe_str(player, "name"),
            "first": _safe_str(name_obj, "first") if name_obj else "",
            "last": _safe_str(name_obj, "last") if name_obj else "",
        }

        # Selected position — flatten to just the string
        sp_obj = getattr(player, "selected_position", None)
        if sp_obj and hasattr(sp_obj, "position"):
            selected_pos = _safe_str(sp_obj, "position")
        else:
            selected_pos = _safe_str(player, "selected_position")

        # Eligible positions — flatten to a list of strings
        ep_obj = getattr(player, "eligible_positions", None)
        if ep_obj and hasattr(ep_obj, "position"):
            raw_pos = getattr(ep_obj, "position", [])
            if isinstance(raw_pos, list):
                eligible_pos = [str(p) for p in raw_pos]
            else:
                eligible_pos = [str(raw_pos)]
        else:
            eligible_pos = []

        # Player points — flatten to just the total (or None)
        pp_obj = getattr(player, "player_points", None)
        player_points = _safe_optional_float(pp_obj, "total") if pp_obj else None

        # Injury status (NEW — was completely missing before!)
        status = _safe_optional_str(player, "status")
        status_full = _safe_optional_str(player, "status_full")
        injury_note = _safe_optional_str(player, "injury_note")

        p: dict[str, Any] = {
            "player_key": _safe_str(player, "player_key"),
            "player_id": _safe_int(player, "player_id"),
            "name": name,
            "editorial_team_abbr": _safe_str(player, "editorial_team_abbr"),
            "editorial_team_full_name": _safe_str(player, "editorial_team_full_name"),
            "display_position": _safe_str(player, "display_position"),
            "selected_position": selected_pos,
            "eligible_positions": eligible_pos,
            "image_url": _safe_str(player, "image_url"),
            "position_type": _safe_str(player, "position_type"),
            "status": status,
            "status_full": status_full,
            "injury_note": injury_note,
            "player_points": player_points,
        }
        players.append(p)

    return {
        "team_key": team_key,
        "team_name": team_name,
        "players": players,
    }


def _get_player_list(roster: Any) -> list:
    """Extract the player list from a roster object."""
    if roster is None:
        return []

    # yahoofantasy Roster has a .players property that returns List[Player]
    players_obj = getattr(roster, "players", None)
    if players_obj is None:
        return []

    # Could be a list directly or have a .player sub-attribute
    if isinstance(players_obj, list):
        return players_obj

    if hasattr(players_obj, "player"):
        plist = getattr(players_obj, "player", [])
        return _as_list(plist)

    return []
