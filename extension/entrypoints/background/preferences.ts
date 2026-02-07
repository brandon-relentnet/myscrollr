import type { UserPreferences, UserStream, StreamType, FeedCategory } from '~/utils/types';
import {
  feedMode,
  feedPosition,
  feedBehavior,
  feedEnabled,
  activeFeedTabs,
  enabledSites,
  disabledSites,
  userSub,
} from '~/utils/storage';

// ── Stream visibility tracking ────────────────────────────────────
// Module-scoped map of stream type → visible. CDC sends one row at a
// time, so we maintain the full picture here and recompute activeFeedTabs
// from the complete map on every change.

const streamVisibility = new Map<StreamType, boolean>();

/**
 * Derives activeFeedTabs from the current stream visibility map and
 * writes it to WXT storage. Content scripts react via storage watchers.
 */
async function syncActiveTabs(): Promise<void> {
  const visible: FeedCategory[] = [];
  for (const [type, isVisible] of streamVisibility) {
    if (isVisible) visible.push(type);
  }
  // Preserve a stable order: finance, sports, fantasy, rss
  const order: FeedCategory[] = ['finance', 'sports', 'fantasy', 'rss'];
  const sorted = order.filter((t) => visible.includes(t));
  await activeFeedTabs.setValue(sorted);
}

/**
 * Initialises the stream visibility map from the full list of streams
 * returned by GET /dashboard. Called once on login or background startup.
 */
export async function initStreamsVisibility(streams: UserStream[]): Promise<void> {
  streamVisibility.clear();
  for (const s of streams) {
    streamVisibility.set(s.stream_type, s.visible);
  }
  await syncActiveTabs();
}

/**
 * Handles a single user_streams CDC insert/update record.
 * Updates the visibility map and recomputes activeFeedTabs.
 */
export async function handleStreamUpdate(record: Record<string, unknown>): Promise<void> {
  const currentSub = await userSub.getValue();
  if (!currentSub || record.logto_sub !== currentSub) return;

  const streamType = record.stream_type as StreamType | undefined;
  if (!streamType) return;

  streamVisibility.set(streamType, Boolean(record.visible));
  await syncActiveTabs();
}

/**
 * Handles a user_streams CDC delete record.
 * Removes the stream from the visibility map and recomputes activeFeedTabs.
 */
export async function handleStreamDelete(record: Record<string, unknown>): Promise<void> {
  const currentSub = await userSub.getValue();
  if (!currentSub || record.logto_sub !== currentSub) return;

  const streamType = record.stream_type as StreamType | undefined;
  if (!streamType) return;

  streamVisibility.delete(streamType);
  await syncActiveTabs();
}

// ── Preferences ───────────────────────────────────────────────────

/**
 * Writes server-sourced preferences into WXT storage.
 * Content scripts react automatically via existing storage watchers.
 */
export async function applyServerPreferences(prefs: UserPreferences): Promise<void> {
  await Promise.all([
    feedMode.setValue(prefs.feed_mode),
    feedPosition.setValue(prefs.feed_position),
    feedBehavior.setValue(prefs.feed_behavior),
    feedEnabled.setValue(prefs.feed_enabled),
    activeFeedTabs.setValue(prefs.active_tabs),
    enabledSites.setValue(prefs.enabled_sites),
    disabledSites.setValue(prefs.disabled_sites),
  ]);
}

/**
 * Handles a user_preferences CDC record from SSE.
 * Only applies if the record belongs to the current user.
 */
export async function handlePreferenceUpdate(record: Record<string, unknown>): Promise<void> {
  const currentSub = await userSub.getValue();
  if (!currentSub || record.logto_sub !== currentSub) return;

  await applyServerPreferences(record as unknown as UserPreferences);
}
