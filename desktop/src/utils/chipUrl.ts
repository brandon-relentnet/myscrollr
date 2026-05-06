/**
 * URL builders for ticker chip clicks. The handler in `App.tsx` routes
 * a click to the OS shell when these helpers return a string, and
 * falls back to opening the desktop app's main window otherwise.
 *
 * Two production realities the v1.0.9 build did NOT account for:
 *
 * 1. Sports games arrive from api-sports.io with `link = NULL`. The
 *    upstream API does not provide canonical per-game URLs; we have to
 *    construct a sensible target from `league` + `sport` + team names.
 *
 * 2. Yahoo Fantasy `league_key` / `player_key` use NUMERIC game-code
 *    prefixes in production (e.g. `469.l.35099`, where `469` is
 *    Yahoo's internal game id for the 2026 NFL season — not the
 *    string `nfl`). The previous helper assumed the prefix was the
 *    canonical sport name and silently returned undefined for every
 *    real-world key. The fix: accept the canonical `game_code` field
 *    from the LeagueResponse (which the Go API already populates as
 *    "nfl"/"nba"/"nhl"/"mlb") as an explicit parameter and use it for
 *    the URL construction; fall back to key-prefix only when no
 *    explicit gameCode is supplied (legacy callers / unknown data).
 *
 * Yahoo Fantasy canonical URL formats:
 *   NFL league:  https://football.fantasysports.yahoo.com/f1/{league_id}
 *   NBA league:  https://basketball.fantasysports.yahoo.com/nba/{league_id}
 *   MLB league:  https://baseball.fantasysports.yahoo.com/mlb/{league_id}
 *   NHL league:  https://hockey.fantasysports.yahoo.com/hockey/{league_id}
 *   Generic player: https://sports.yahoo.com/{sport}/players/{player_id}/
 */

import type { Trade, Game, RssItem } from "../types";

/**
 * Per-sport subdomain + URL slug for Yahoo Fantasy league pages. The
 * sport subdomain is the host (basketball.fantasysports.yahoo.com etc.)
 * and the slug is the in-path identifier — these are NOT always the
 * same as the Yahoo `game_code` value; e.g. NFL uses `f1` in the path
 * but `nfl` everywhere else.
 */
const YAHOO_LEAGUE_PATH: Record<string, { sport: string; slug: string }> = {
  nfl: { sport: "football", slug: "f1" },
  nba: { sport: "basketball", slug: "nba" },
  mlb: { sport: "baseball", slug: "mlb" },
  nhl: { sport: "hockey", slug: "hockey" },
};

/** Per-sport URL prefix for Yahoo Sports player pages. */
const YAHOO_PLAYER_PREFIX: Record<string, string> = {
  nfl: "nfl",
  nba: "nba",
  mlb: "mlb",
  nhl: "nhl",
};

/**
 * Build the canonical Yahoo Fantasy league URL.
 *
 * @param leagueKey  Yahoo league key, e.g. "nfl.l.420" or "469.l.35099"
 * @param gameCode   Optional canonical sport code ("nfl"|"nba"|"nhl"|"mlb").
 *                   When supplied, takes precedence over the key prefix.
 *                   The Go API's LeagueResponse populates this as the
 *                   string sport code regardless of the numeric prefix
 *                   in `league_key`, so callers should always pass it.
 */
export function buildYahooLeagueUrl(
  leagueKey: string,
  gameCode?: string,
): string | undefined {
  const parts = leagueKey.split(".l.");
  if (parts.length !== 2) return undefined;
  const leagueId = parts[1];

  // Prefer explicit gameCode over the numeric/string prefix in the key.
  const code = (gameCode || parts[0] || "").toLowerCase();
  const mapping = YAHOO_LEAGUE_PATH[code];
  if (mapping) {
    return `https://${mapping.sport}.fantasysports.yahoo.com/${mapping.slug}/${leagueId}`;
  }

  // Unknown sport — fall back to a generic Yahoo Fantasy hub. Better
  // than returning undefined (which would dump the user back into the
  // desktop app); the generic page lets them navigate from there.
  return "https://sports.yahoo.com/fantasy/";
}

/**
 * Build the canonical Yahoo Sports player URL.
 *
 * @param playerKey  Yahoo player key, e.g. "nfl.p.30977" or "469.p.30977"
 * @param gameCode   Optional canonical sport code ("nfl"|"nba"|"nhl"|"mlb").
 *                   Same precedence rule as `buildYahooLeagueUrl`.
 */
export function buildYahooPlayerUrl(
  playerKey: string,
  gameCode?: string,
): string | undefined {
  const parts = playerKey.split(".p.");
  if (parts.length !== 2) return undefined;
  const playerId = parts[1];

  const code = (gameCode || parts[0] || "").toLowerCase();
  const prefix = YAHOO_PLAYER_PREFIX[code];
  if (prefix) {
    return `https://sports.yahoo.com/${prefix}/players/${playerId}/`;
  }

  // Unknown sport — fall back to Yahoo Sports homepage so the click
  // does *something* visible.
  return "https://sports.yahoo.com/";
}

export function chipUrlForFinance(trade: Trade): string | undefined {
  return trade.link && trade.link.length > 0 ? trade.link : undefined;
}

/**
 * Map a sport key to ESPN's URL slug for that sport's scoreboard page.
 * api-sports.io's `sport` field uses lowercase short names; ESPN uses
 * a similar but not-identical convention.
 */
const ESPN_SCOREBOARD_PATH: Record<string, string> = {
  nfl: "nfl",
  nba: "nba",
  mlb: "mlb",
  nhl: "nhl",
  wnba: "wnba",
  mls: "soccer/league/_/name/usa.1",
  // football, basketball, baseball, hockey: already covered by the
  // specific league-name branches below; this map is for sport keys
  // api-sports actually emits.
};

/**
 * Build a chip-click URL for a sports game.
 *
 * Priority order:
 *   1. Server-supplied `link` (rare today — most leagues have NULL).
 *   2. League-specific scoreboard for known leagues (F1, EPL, etc.).
 *   3. ESPN scoreboard for known sport keys.
 *   4. Google search of "{home} vs {away} {league}" — always lands the
 *      user somewhere useful (Google's sports widget for popular games).
 *   5. undefined — caller falls through to opening the desktop app.
 */
export function chipUrlForSports(game: Game): string | undefined {
  if (game.link && game.link.length > 0) return game.link;

  const sport = (game.sport || "").toLowerCase();
  const league = (game.league || "").toLowerCase();

  // ── League-specific destinations ──────────────────────────────
  // Order matters: more specific names checked before generic.
  if (league.includes("formula 1") || league === "f1" || league.includes("formula1")) {
    return "https://www.formula1.com/en/results.html";
  }
  if (league.includes("premier league")) {
    return "https://www.premierleague.com/results";
  }
  if (league.includes("champions league")) {
    return "https://www.uefa.com/uefachampionsleague/fixtures-results/";
  }
  if (league.includes("la liga") || league.includes("laliga")) {
    return "https://www.laliga.com/en-GB/laliga-easports/results";
  }
  if (league.includes("bundesliga")) {
    return "https://www.bundesliga.com/en/bundesliga/matchday";
  }
  if (league.includes("serie a")) {
    return "https://www.legaseriea.it/en/serie-a/calendar-results";
  }
  if (league.includes("ligue 1")) {
    return "https://www.ligue1.com/results";
  }
  if (league.includes("mls")) {
    return "https://www.mlssoccer.com/scoreboard/";
  }

  // ── ESPN scoreboard by sport key ──────────────────────────────
  if (sport && ESPN_SCOREBOARD_PATH[sport]) {
    return `https://www.espn.com/${ESPN_SCOREBOARD_PATH[sport]}/scoreboard`;
  }

  // ── Google search fallback ────────────────────────────────────
  // Always reasonable: Google's sports widget shows scores at the top
  // of results for any well-known matchup.
  if (game.home_team_name && game.away_team_name) {
    const q = [
      game.home_team_name,
      "vs",
      game.away_team_name,
      game.league || "",
    ].filter(Boolean).join(" ").trim();
    return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }

  return undefined;
}

export function chipUrlForRss(item: RssItem): string | undefined {
  return item.link && item.link.length > 0 ? item.link : undefined;
}
