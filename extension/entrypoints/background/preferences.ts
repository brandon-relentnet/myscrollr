import type { UserPreferences } from '~/utils/types';
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
