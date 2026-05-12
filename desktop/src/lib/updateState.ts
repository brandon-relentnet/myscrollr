// ── Shared update-flow lock ─────────────────────────────────────
//
// Both the startup auto-check (`hooks/useStartupUpdateCheck.ts`) and
// the manual Settings flow (`components/settings/GeneralSettings.tsx`)
// can run `check()` and `downloadAndInstall()` against the same Tauri
// updater plugin. The plugin is not safe to call concurrently — a
// `check()` fired while a download is in flight, or two downloads
// kicked off in parallel, can leave the plugin in a state where
// installation crashes the app on Windows (mid-install MSI/NSIS spawn
// against a still-running webview).
//
// This module exposes a module-level boolean guard. The auto-check
// acquires it before starting; if it's already held (e.g. the user
// opened Settings and started a manual download before the startup
// toast finished), the check is skipped silently. The Settings flow
// reuses the same guard, so neither path can step on the other.
//
// Module-level state is fine here: the desktop app has exactly two
// windows (ticker + main), and only the main window has the
// `updater:default` capability (see `src-tauri/capabilities/`). The
// guard lives in the main window's JS heap, so cross-window
// contention isn't a concern.

let isUpdating = false;

/**
 * Attempt to acquire the update lock. Returns `true` if acquired
 * (caller must invoke `releaseUpdateLock` when done), or `false` if
 * another flow is already running an update.
 */
export function tryAcquireUpdateLock(): boolean {
  if (isUpdating) return false;
  isUpdating = true;
  return true;
}

/** Release the update lock. Safe to call even if not held. */
export function releaseUpdateLock(): void {
  isUpdating = false;
}

/** Read the current lock state without acquiring. */
export function isUpdateInProgress(): boolean {
  return isUpdating;
}
