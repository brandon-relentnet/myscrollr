import type { UserPreferences, UserStream } from '~/utils/types';
import { TAB_ORDER } from '~/integrations/registry';
import {
  feedMode,
  feedPosition,
  feedBehavior,
  feedEnabled,
  activeFeedTabs,
  enabledSites,
  disabledSites,
} from '~/utils/storage';

// ── Callback for stream changes (set by index.ts to avoid circular imports) ──

let onStreamChanged: (() => void) | null = null;

export function setOnStreamChanged(cb: () => void) {
  onStreamChanged = cb;
}

// ── Stream visibility tracking ────────────────────────────────────
// Module-scoped map of stream type → visible. CDC sends one row at a
// time, so we maintain the full picture here and recompute activeFeedTabs
// from the complete map on every change.

const streamVisibility = new Map<string, boolean>();

/**
 * Derives activeFeedTabs from the current stream visibility map and
 * writes it to WXT storage. Content scripts react via storage watchers.
 */
async function syncActiveTabs(): Promise<void> {
  const visible: string[] = [];
  for (const [type, isVisible] of streamVisibility) {
    if (isVisible) visible.push(type);
  }
  // Preserve a stable order from the registry, unknown IDs appended alphabetically
  const known = TAB_ORDER.filter((t) => visible.includes(t));
  const unknown = visible.filter((t) => !TAB_ORDER.includes(t)).sort();
  const sorted = [...known, ...unknown];
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
  // Server already filters records to the authenticated user — no client-side guard needed.
  const streamType = record.stream_type as string | undefined;
  if (!streamType) return;

  streamVisibility.set(streamType, Boolean(record.visible));
  await syncActiveTabs();

  // Refetch dashboard so that existing items for newly-subscribed feeds
  // (e.g. RSS) are loaded immediately — CDC only delivers future changes.
  onStreamChanged?.();
}

/**
 * Handles a user_streams CDC delete record.
 * Removes the stream from the visibility map and recomputes activeFeedTabs.
 */
export async function handleStreamDelete(record: Record<string, unknown>): Promise<void> {
  // Server already filters records to the authenticated user — no client-side guard needed.
  const streamType = record.stream_type as string | undefined;
  if (!streamType) return;

  streamVisibility.delete(streamType);
  await syncActiveTabs();

  // Refetch dashboard to clear items from the removed stream.
  onStreamChanged?.();
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
    enabledSites.setValue(prefs.enabled_sites),
    disabledSites.setValue(prefs.disabled_sites),
  ]);
}

/**
 * Handles a user_preferences CDC record from SSE.
 * Only applies if the record belongs to the current user.
 */
export async function handlePreferenceUpdate(record: Record<string, unknown>): Promise<void> {
  // Server already filters records to the authenticated user — no client-side guard needed.
  await applyServerPreferences(record as unknown as UserPreferences);
}
