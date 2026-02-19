import type { UserPreferences, UserChannel } from "~/utils/types";
import { TAB_ORDER } from "~/channels/registry";
import {
  feedMode,
  feedPosition,
  feedBehavior,
  feedEnabled,
  activeFeedTabs,
  enabledSites,
  disabledSites,
} from "~/utils/storage";

// ── Callback for channel changes (set by index.ts to avoid circular imports) ──

let onChannelChanged: (() => void) | null = null;

export function setOnChannelChanged(cb: () => void) {
  onChannelChanged = cb;
}

// ── Channel visibility tracking ───────────────────────────────────
// Module-scoped map of channel type → visible. CDC sends one row at a
// time, so we maintain the full picture here and recompute activeFeedTabs
// from the complete map on every change.

const channelVisibility = new Map<string, boolean>();

/**
 * Derives activeFeedTabs from the current channel visibility map and
 * writes it to WXT storage. Content scripts react via storage watchers.
 */
async function syncActiveTabs(): Promise<void> {
  const visible: string[] = [];
  for (const [type, isVisible] of channelVisibility) {
    if (isVisible) visible.push(type);
  }
  // Preserve a stable order from the registry, unknown IDs appended alphabetically
  const order = TAB_ORDER as readonly string[];
  const known = order.filter((t) => visible.includes(t));
  const unknown = visible.filter((t) => !order.includes(t)).sort();
  const sorted = [...known, ...unknown];
  await activeFeedTabs.setValue(sorted);
}

/**
 * Initialises the channel visibility map from the full list of channels
 * returned by GET /dashboard. Called once on login or background startup.
 */
export async function initChannelsVisibility(
  channels: UserChannel[],
): Promise<void> {
  channelVisibility.clear();
  for (const c of channels) {
    channelVisibility.set(c.channel_type, c.visible);
  }
  await syncActiveTabs();
}

/**
 * Handles a single user_channels CDC insert/update record.
 * Updates the visibility map and recomputes activeFeedTabs.
 */
export async function handleChannelUpdate(
  record: Record<string, unknown>,
): Promise<void> {
  // Server already filters records to the authenticated user — no client-side guard needed.
  const channelType = record.channel_type as string | undefined;
  if (!channelType) return;

  channelVisibility.set(channelType, Boolean(record.visible));
  await syncActiveTabs();

  // Refetch dashboard so that existing items for newly-subscribed feeds
  // (e.g. RSS) are loaded immediately — CDC only delivers future changes.
  onChannelChanged?.();
}

/**
 * Handles a user_channels CDC delete record.
 * Removes the channel from the visibility map and recomputes activeFeedTabs.
 */
export async function handleChannelDelete(
  record: Record<string, unknown>,
): Promise<void> {
  // Server already filters records to the authenticated user — no client-side guard needed.
  const channelType = record.channel_type as string | undefined;
  if (!channelType) return;

  channelVisibility.delete(channelType);
  await syncActiveTabs();

  // Refetch dashboard to clear items from the removed channel.
  onChannelChanged?.();
}

// ── Preferences ───────────────────────────────────────────────────

/**
 * Writes server-sourced preferences into WXT storage.
 * Content scripts react automatically via existing storage watchers.
 */
export async function applyServerPreferences(
  prefs: UserPreferences,
): Promise<void> {
  await Promise.all([
    feedMode.setValue(prefs.feed_mode),
    feedPosition.setValue(prefs.feed_position),
    feedBehavior.setValue(prefs.feed_behavior),
    feedEnabled.setValue(prefs.feed_enabled),
    enabledSites.setValue(prefs.enabled_sites),
    disabledSites.setValue(prefs.disabled_sites),
  ]);
}

/**
 * Handles a user_preferences CDC record from SSE.
 * Only applies if the record belongs to the current user.
 */
export async function handlePreferenceUpdate(
  record: Record<string, unknown>,
): Promise<void> {
  // Server already filters records to the authenticated user — no client-side guard needed.
  await applyServerPreferences(record as unknown as UserPreferences);
}
