/**
 * URL builders for ticker chip clicks. The handler in `App.tsx` routes
 * a click to the OS shell when these helpers return a string, and
 * falls back to opening the desktop app's main window otherwise.
 *
 * Trade/Game/RssItem already carry a server-populated `link` field —
 * these helpers just unwrap it. Fantasy chips construct URLs from the
 * Yahoo `league_key` / `player_key` namespacing scheme since neither
 * the league nor the player URL is currently surfaced through the
 * Go layer of the fantasy channel.
 *
 * Yahoo Fantasy URL format:
 *   league: https://{sport}.fantasysports.yahoo.com/{game_code}/{league_id}
 *   player: https://sports.yahoo.com/{game_code}/players/{player_id}/
 *
 * `league_key` shape: "{game_code}.l.{league_id}" (e.g. "nfl.l.420").
 * `player_key` shape: "{game_code}.p.{player_id}" (e.g. "nfl.p.30977").
 */

import type { Trade, Game, RssItem } from "../types";

/** Yahoo's per-sport subdomain prefix on fantasysports.yahoo.com. */
const SPORT_PREFIX: Record<string, string> = {
  nfl: "football",
  nba: "basketball",
  nhl: "hockey",
  mlb: "baseball",
};

export function buildYahooLeagueUrl(leagueKey: string): string | undefined {
  const parts = leagueKey.split(".l.");
  if (parts.length !== 2) return undefined;
  const [gameCode, leagueId] = parts;
  const prefix = SPORT_PREFIX[gameCode];
  if (!prefix) return undefined;
  return `https://${prefix}.fantasysports.yahoo.com/${gameCode}/${leagueId}`;
}

export function buildYahooPlayerUrl(playerKey: string): string | undefined {
  const parts = playerKey.split(".p.");
  if (parts.length !== 2) return undefined;
  const [gameCode, playerId] = parts;
  if (!SPORT_PREFIX[gameCode]) return undefined;
  return `https://sports.yahoo.com/${gameCode}/players/${playerId}/`;
}

export function chipUrlForFinance(trade: Trade): string | undefined {
  return trade.link && trade.link.length > 0 ? trade.link : undefined;
}

export function chipUrlForSports(game: Game): string | undefined {
  return game.link && game.link.length > 0 ? game.link : undefined;
}

export function chipUrlForRss(item: RssItem): string | undefined {
  return item.link && item.link.length > 0 ? item.link : undefined;
}
