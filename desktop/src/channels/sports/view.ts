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
import { migrateVenue, shouldShowOnFeed, shouldShowOnTicker } from "../../preferences";
import type { Venue } from "../../preferences";

// ── Display prefs shape (mirrors server-side channel config.display) ─
//
// Stored per-user in `user_channels.config.display` as JSONB. v1.0.2
// switched each field from boolean → Venue. Old boolean-era values still
// deserialize correctly because `normalizeSportsDisplayConfig` runs the
// read through `migrateVenue`.

export interface SportsDisplayConfig {
  showUpcoming?: Venue;
  showFinal?: Venue;
  showLogos?: Venue;
  showTimer?: Venue;
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
 *
 * Filters only apply when the venue is `off` or ticker-only-excluded
 * ("feed"). `both` and `ticker` both permit the category to show on the
 * ticker.
 */
export function selectSportsForTicker(
  games: Game[],
  config: SportsDisplayConfig | null | undefined,
): Game[] {
  const cfg = config ?? {};
  const showUpcoming = shouldShowOnTicker(cfg.showUpcoming ?? "both");
  const showFinal = shouldShowOnTicker(cfg.showFinal ?? "both");

  const filtered = games.filter((g) => {
    if (!showUpcoming && isPre(g)) return false;
    if (!showFinal && isFinal(g)) return false;
    return true;
  });

  return filtered.sort((a, b) => gameEngagement(b) - gameEngagement(a));
}

/**
 * Feed-side filter mirroring `selectSportsForTicker`. Filters apply
 * when a category's venue is `off` or ticker-only.
 */
export function selectSportsForFeed(
  games: Game[],
  config: SportsDisplayConfig | null | undefined,
): Game[] {
  const cfg = config ?? {};
  const showUpcoming = shouldShowOnFeed(cfg.showUpcoming ?? "both");
  const showFinal = shouldShowOnFeed(cfg.showFinal ?? "both");

  return games.filter((g) => {
    if (!showUpcoming && isPre(g)) return false;
    if (!showFinal && isFinal(g)) return false;
    return true;
  });
}

// ── Helper: extract sports display config from dashboard ────────

import type { DashboardResponse } from "../../types";

/**
 * Read the sports channel's display config from the dashboard payload
 * and normalize every field through `migrateVenue` so old boolean-era
 * configs (stored by clients before v1.0.2) still deserialize to valid
 * Venue values.
 */
export function getSportsDisplayConfig(
  dashboard: DashboardResponse | null | undefined,
): SportsDisplayConfig {
  const channel = dashboard?.channels?.find((c) => c.channel_type === "sports");
  return normalizeSportsDisplayConfig(channel?.config?.display);
}

export function normalizeSportsDisplayConfig(
  raw: unknown,
): SportsDisplayConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    showUpcoming: migrateVenue(obj.showUpcoming),
    showFinal: migrateVenue(obj.showFinal),
    showLogos: migrateVenue(obj.showLogos),
    showTimer: migrateVenue(obj.showTimer),
  };
}
