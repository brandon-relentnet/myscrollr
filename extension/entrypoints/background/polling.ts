import { FREE_POLLING_ALARM_INTERVAL, POLLING_ALARM_NAME } from '~/utils/constants';

// ── Polling lifecycle ────────────────────────────────────────────
// Uses chrome.alarms to trigger periodic data fetches.
// Interval varies by tier: 60s for free, 30s for Uplink.
// The actual fetch logic is injected via `onPoll` callback to avoid
// circular imports with dashboard.ts / index.ts.

type PollCallback = () => void | Promise<void>;

let onPoll: PollCallback | null = null;

export function setOnPoll(cb: PollCallback) {
  onPoll = cb;
}

/**
 * Starts the polling timer at the given interval (in minutes).
 * Defaults to FREE_POLLING_ALARM_INTERVAL (60s) if not specified.
 * Safe to call multiple times — recreates the alarm with the new interval.
 */
export function startPolling(intervalMinutes: number = FREE_POLLING_ALARM_INTERVAL) {
  browser.alarms?.create(POLLING_ALARM_NAME, {
    periodInMinutes: intervalMinutes,
  });

  // Trigger an immediate poll so data loads without waiting
  onPoll?.();

  console.log(`[Scrollr] Polling started (${intervalMinutes * 60}s interval)`);
}

/**
 * Stops the polling timer.
 */
export function stopPolling() {
  browser.alarms?.clear(POLLING_ALARM_NAME);
  console.log('[Scrollr] Polling stopped');
}

/**
 * Sets up the alarm listener that drives polling.
 * Must be called once during background initialization.
 */
export function setupPollingAlarm() {
  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === POLLING_ALARM_NAME) {
      onPoll?.();
    }
  });
}
