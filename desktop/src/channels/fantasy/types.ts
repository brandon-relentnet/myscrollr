/**
 * Fantasy channel types — canonical source of truth.
 *
 * Mirrors the Go API's MyLeaguesResponse shape. Fields are nullable
 * where the API may omit them (e.g. during discovery, before import,
 * or for finished leagues with no active matchups/rosters).
 */

// ── Constants ────────────────────────────────────────────────────

export const SPORT_EMOJI: Record<string, string> = {
  nfl: "\u{1F3C8}",
  nba: "\u{1F3C0}",
  nhl: "\u{1F3D2}",
  mlb: "\u26BE",
};

export const GAME_CODE_LABELS: Record<string, string> = {
  nfl: "Football",
  nba: "Basketball",
  nhl: "Hockey",
  mlb: "Baseball",
};

/** Human-readable sport label from a game code (e.g. "nfl" → "Football"). */
export function sportLabel(gameCode: string): string {
  return GAME_CODE_LABELS[gameCode] || gameCode || "Fantasy";
}

/** Canonical position ordering for a given sport (starters first, bench/IR last). */
export const POSITION_ORDER: Record<string, string[]> = {
  nfl: ["QB", "RB", "WR", "TE", "W/R/T", "W/T", "FLEX", "K", "DEF", "D/ST", "BN", "IR", "IR+"],
  nba: ["PG", "SG", "G", "SF", "PF", "F", "C", "Util", "BN", "IL", "IL+"],
  nhl: ["C", "LW", "RW", "F", "D", "G", "Util", "BN", "IR", "IR+"],
  mlb: [
    "C",
    "1B",
    "2B",
    "3B",
    "SS",
    "OF",
    "Util",
    "SP",
    "RP",
    "P",
    "BN",
    "IL",
    "NA",
  ],
};

/** True if the selected position keeps the player out of the starting lineup. */
export function isBenchPosition(pos: string): boolean {
  if (!pos) return true;
  const p = pos.toUpperCase();
  return p === "BN" || p === "IR" || p === "IL" || p === "NA" || p.startsWith("IR") || p.startsWith("IL");
}

// ── Types ────────────────────────────────────────────────────────

export interface MatchupTeam {
  team_key: string;
  team_id?: number;
  name: string;
  team_logo: string;
  manager_name: string;
  points: number | null;
  projected_points: number | null;
}

export interface Matchup {
  week: number;
  week_start?: string;
  week_end?: string;
  status: string;
  is_playoffs: boolean;
  is_consolation?: boolean;
  is_tied?: boolean;
  winner_team_key: string | null;
  teams: MatchupTeam[];
}

export interface StandingsEntry {
  team_key: string;
  team_id?: number;
  name: string;
  url?: string;
  team_logo: string;
  manager_name: string;
  rank: number | null;
  wins: number;
  losses: number;
  ties: number;
  percentage?: string;
  games_back?: string;
  points_for: number | string;
  points_against?: string;
  streak_type: string;
  streak_value: number;
  playoff_seed: number | null;
  clinched_playoffs: boolean;
  waiver_priority: number | null;
}

export interface RosterPlayer {
  player_key: string;
  player_id?: number;
  name: { full: string; first: string; last: string };
  editorial_team_abbr: string;
  editorial_team_full_name?: string;
  display_position: string;
  selected_position: string;
  eligible_positions?: string[];
  position_type?: string;
  image_url: string;
  status: string | null;
  status_full: string | null;
  injury_note: string | null;
  /**
   * Either Yahoo's native <player_points> total (NFL-style points leagues)
   * or a synthetic total the API computes from player_stats × league stat
   * modifiers (MLB H2H categories, etc.). Null when neither is available.
   */
  player_points: number | null;
  /** Raw stat_id → value map. Present in category leagues. */
  player_stats?: Record<string, number> | null;
}

export interface RosterEntry {
  team_key: string;
  data: {
    team_key: string;
    team_name: string;
    players: RosterPlayer[];
  };
}

export interface LeagueResponse {
  league_key: string;
  name: string;
  game_code: string;
  season: string;
  team_key: string | null;
  team_name: string | null;
  data: {
    num_teams: number;
    is_finished: boolean;
    current_week: number | null;
    scoring_type: string;
    [k: string]: unknown;
  };
  standings: StandingsEntry[] | null;
  matchups: Matchup[] | null;
  previous_matchups?: Matchup[] | null;
  rosters: RosterEntry[] | null;
}

export interface MyLeaguesResponse {
  leagues: LeagueResponse[];
}

// ── Matchup status helpers ───────────────────────────────────────

export function isMatchupLive(matchup: Matchup): boolean {
  return matchup.status === "midevent";
}

export function isMatchupFinal(matchup: Matchup): boolean {
  return matchup.status === "postevent";
}

export function isMatchupPre(matchup: Matchup): boolean {
  return matchup.status === "preevent";
}

/** Return the user's matchup in a given week, or the single current matchup. */
export function findUserMatchup(
  league: LeagueResponse,
  matchups: Matchup[] | null | undefined,
): Matchup | null {
  if (!matchups || !league.team_key) return null;
  return (
    matchups.find((m) => m.teams.some((t) => t.team_key === league.team_key)) ?? null
  );
}

/** Orient a matchup around the user: [userTeam, opponent]. Returns null if not resolvable. */
export function orientMatchup(
  matchup: Matchup | null,
  userTeamKey: string | null | undefined,
): { user: MatchupTeam; opponent: MatchupTeam } | null {
  if (!matchup || !userTeamKey || matchup.teams.length < 2) return null;
  const user = matchup.teams.find((t) => t.team_key === userTeamKey);
  const opponent = matchup.teams.find((t) => t.team_key !== userTeamKey);
  if (!user || !opponent) return null;
  return { user, opponent };
}

/** Numeric score for a team, safely coerced from nullable float to 0. */
export function teamScore(team: MatchupTeam): number {
  return typeof team.points === "number" ? team.points : 0;
}

/**
 * Rudimentary win-probability estimate.
 *
 * During a live matchup we blend actual points with projected remaining
 * points. The longer the week runs, the more actual points dominate.
 *
 * Returns a fraction in [0, 1] representing the user's chance of winning.
 * Returns null if we don't have enough data to judge (pre-event or missing
 * projections).
 */
export function estimateWinProbability(
  matchup: Matchup | null,
  userTeamKey: string | null | undefined,
): number | null {
  const oriented = orientMatchup(matchup, userTeamKey);
  if (!oriented || !matchup) return null;
  const { user, opponent } = oriented;

  const uProj = typeof user.projected_points === "number" ? user.projected_points : null;
  const oProj = typeof opponent.projected_points === "number" ? opponent.projected_points : null;

  if (isMatchupPre(matchup)) {
    if (uProj === null || oProj === null) return null;
    const diff = uProj - oProj;
    return sigmoid(diff / 15); // ~stdev 15 points in typical fantasy football
  }

  if (isMatchupFinal(matchup)) {
    const diff = teamScore(user) - teamScore(opponent);
    if (diff > 0) return 1;
    if (diff < 0) return 0;
    return 0.5;
  }

  // Live. Blend actual + expected remaining.
  const uActual = teamScore(user);
  const oActual = teamScore(opponent);
  if (uProj === null || oProj === null) {
    const diff = uActual - oActual;
    return sigmoid(diff / 10);
  }
  // Fraction of the projected total that's been scored — used as a crude
  // "how far through the week" estimate.
  const totalProj = Math.max(uProj + oProj, 1);
  const completion = clamp((uActual + oActual) / totalProj, 0, 1);
  const remainingU = Math.max(uProj - uActual, 0) * (1 - completion * 0.5);
  const remainingO = Math.max(oProj - oActual, 0) * (1 - completion * 0.5);
  const projFinalU = uActual + remainingU;
  const projFinalO = oActual + remainingO;
  const diff = projFinalU - projFinalO;
  // Remaining uncertainty shrinks as the week progresses.
  const stdDev = Math.max(12 * (1 - completion), 2.5);
  return sigmoid(diff / stdDev);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

// ── Standings helpers ───────────────────────────────────────────

/** Number of playoff spots a league awards (best-effort inference). */
export function playoffSpotCount(league: LeagueResponse): number {
  // Yahoo doesn't cleanly expose this, but most head-to-head leagues use
  // 4 or 6 playoff spots. We infer: if any team has clinched_playoffs or
  // playoff_seed is set, count the distinct seeds. Fall back by league size.
  const seeds = league.standings
    ?.map((s) => s.playoff_seed)
    .filter((x): x is number => typeof x === "number");
  if (seeds && seeds.length > 0) return Math.max(...seeds);
  const numTeams = league.data.num_teams ?? 0;
  if (numTeams >= 12) return 6;
  if (numTeams >= 10) return 6;
  if (numTeams >= 8) return 4;
  return Math.max(1, Math.min(numTeams, 4));
}

/** Distinguish playoff-track teams from elimination-track teams. */
export function isPlayoffBound(entry: StandingsEntry, spots: number): boolean {
  if (entry.clinched_playoffs) return true;
  if (typeof entry.playoff_seed === "number") return entry.playoff_seed <= spots;
  if (typeof entry.rank === "number") return entry.rank <= spots;
  return false;
}

/** Nicely formatted points-for value (supports numeric or Yahoo string form). */
export function fmtPoints(pf: number | string | undefined | null): string {
  if (pf === undefined || pf === null) return "—";
  const n = typeof pf === "number" ? pf : parseFloat(pf);
  if (!Number.isFinite(n)) return String(pf);
  return n.toFixed(1);
}

/**
 * Format a player's points for display. Returns "—" when the value is null
 * (category leagues with no scoring modifiers, or genuinely unscored games),
 * signalling to the UI that 0.0 is not the correct answer.
 */
export function fmtPlayerPoints(pts: number | null | undefined): string {
  if (typeof pts !== "number" || !Number.isFinite(pts)) return "—";
  return pts.toFixed(1);
}

/** Short "W3" / "L2" / "T1" badge. */
export function streakLabel(type: string, value: number): string {
  if (!type || value <= 0) return "—";
  const prefix = type.charAt(0).toUpperCase();
  return `${prefix}${value}`;
}

// ── Roster helpers ─────────────────────────────────────────────

/** Map of position-code → ordinal, for sorting. Bench/IR sorts last. */
export function positionOrderIndex(gameCode: string, position: string): number {
  const order = POSITION_ORDER[gameCode] ?? [];
  const idx = order.indexOf(position);
  return idx >= 0 ? idx : 999;
}

/** Status badge color class (Tailwind). */
export function statusColorClass(status: string | null | undefined): string {
  if (!status) return "";
  const s = status.toUpperCase();
  if (s === "O" || s === "IR" || s === "SUSP" || s === "DL" || s === "IL") return "bg-error/20 text-error border-error/40";
  if (s === "D" || s === "DTD") return "bg-warn/20 text-warn border-warn/40";
  if (s === "Q" || s === "P") return "bg-amber-500/20 text-amber-500 border-amber-500/40";
  if (s === "NA") return "bg-fg-3/20 text-fg-3 border-fg-3/40";
  return "bg-fg-3/20 text-fg-3 border-fg-3/40";
}

/** True if the player status represents any kind of injury/availability issue. */
export function isInjuryStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const s = status.toUpperCase();
  return s.length > 0 && s !== "ACTIVE";
}

/** Count injured players in a roster entry. */
export function countInjuries(roster: RosterEntry | null | undefined): number {
  if (!roster) return 0;
  return roster.data.players.filter((p) => isInjuryStatus(p.status)).length;
}

// ── League-level helpers ───────────────────────────────────────

/** Return the user's current matchup and its oriented teams, if resolvable. */
export function userMatchupContext(league: LeagueResponse): {
  matchup: Matchup;
  user: MatchupTeam;
  opponent: MatchupTeam;
} | null {
  const current = findUserMatchup(league, league.matchups);
  if (!current) return null;
  const oriented = orientMatchup(current, league.team_key);
  if (!oriented) return null;
  return { matchup: current, user: oriented.user, opponent: oriented.opponent };
}

/** Return the user's previous-week matchup, if it's in `previous_matchups`. */
export function userPreviousMatchup(league: LeagueResponse): {
  matchup: Matchup;
  user: MatchupTeam;
  opponent: MatchupTeam;
} | null {
  const previous = findUserMatchup(league, league.previous_matchups);
  if (!previous) return null;
  const oriented = orientMatchup(previous, league.team_key);
  if (!oriented) return null;
  return { matchup: previous, user: oriented.user, opponent: oriented.opponent };
}

/** Return the user's standings entry, if present. */
export function userStanding(league: LeagueResponse): StandingsEntry | null {
  if (!league.team_key) return null;
  return league.standings?.find((s) => s.team_key === league.team_key) ?? null;
}

/** Return the user's roster entry, if present. */
export function userRoster(league: LeagueResponse): RosterEntry | null {
  if (!league.team_key) return null;
  return league.rosters?.find((r) => r.team_key === league.team_key) ?? null;
}

// ── Discovery type ────────────────────────────────────────────

export interface DiscoveredLeague {
  league_key: string;
  name: string;
  game_code: string;
  season: number;
  num_teams: number;
  is_finished: boolean;
  logo_url?: string;
  url?: string;
}
