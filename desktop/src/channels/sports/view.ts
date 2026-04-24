/**
 * Sports view selectors — shared filter/sort pipeline.
 *
 * Sports display prefs live server-side on the dashboard channel config
 * (not in `prefs.channelDisplay`), so this selector accepts the config
 * blob shape. Both `FeedTab` and `ScrollrTicker` call `selectSportsForTicker`
 * to apply showUpcoming/showFinal filters + engagement sort.
 *
 * SINGLE SOURCE OF TRUTH for Sports display prefs.
 */
import type { Game } from "../../types";
import { isLive, isCloseGame, isFinal, isPre } from "../../utils/gameHelpers";

// ── Display prefs shape (mirrors server-side channel config.display) ─

export interface SportsDisplayConfig {
  showUpcoming?: boolean;
  showFinal?: boolean;
  showLogos?: boolean;
  showTimer?: boolean;
}

// ── Pure: engagement score ──────────────────────────────────────

export function gameEngagement(g: Game): number {
  if (isLive(g)) return isCloseGame(g) ? 100 : 80;
  if (g.state === "pre") {
    const until = new Date(g.start_time).getTime() - Date.now();
    if (until < 3_600_000) return 60; // within 1 hour
    if (until < 86_400_000) return 40; // within 24 hours
    return 20;
  }
  if (g.state === "final") {
    const ago = Date.now() - new Date(g.start_time).getTime();
    if (ago < 7_200_000) return 30; // finished within 2 hours
    return 10;
  }
  return 0;
}

// ── Pure: selector for the ticker ────────────────────────────────

/**
 * Baseline pipeline used by the ticker: applies `showUpcoming`/`showFinal`
 * filters from the channel config.display blob, then sorts by engagement
 * (live/close-game games float to the top).
 */
export function selectSportsForTicker(
  games: Game[],
  config: SportsDisplayConfig | null | undefined,
): Game[] {
  const cfg = config ?? {};
  const showUpcoming = cfg.showUpcoming ?? true;
  const showFinal = cfg.showFinal ?? true;

  const filtered = games.filter((g) => {
    if (!showUpcoming && isPre(g)) return false;
    if (!showFinal && isFinal(g)) return false;
    return true;
  });

  return filtered.sort((a, b) => gameEngagement(b) - gameEngagement(a));
}

// ── Helper: extract sports display config from dashboard ────────

import type { DashboardResponse } from "../../types";

export function getSportsDisplayConfig(
  dashboard: DashboardResponse | null | undefined,
): SportsDisplayConfig {
  const channel = dashboard?.channels?.find((c) => c.channel_type === "sports");
  return (channel?.config?.display ?? {}) as SportsDisplayConfig;
}
