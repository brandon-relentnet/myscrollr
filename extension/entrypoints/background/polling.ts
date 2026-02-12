import { POLLING_ALARM_INTERVAL, POLLING_ALARM_NAME } from '~/utils/constants';

// ── Polling lifecycle ────────────────────────────────────────────
// Uses chrome.alarms to trigger periodic data fetches at ~30s intervals.
// The actual fetch logic is injected via `onPoll` callback to avoid
// circular imports with dashboard.ts / index.ts.

type PollCallback = () => void | Promise<void>;

let onPoll: PollCallback | null = null;

export function setOnPoll(cb: PollCallback) {
  onPoll = cb;
}

/**
 * Starts the polling timer. The alarm fires every ~30 seconds.
 * Safe to call multiple times — creates the alarm only once.
 */
export function startPolling() {
  browser.alarms?.create(POLLING_ALARM_NAME, {
    periodInMinutes: POLLING_ALARM_INTERVAL,
  });

  // Trigger an immediate poll so data loads without waiting 30s
  onPoll?.();

  console.log('[Scrollr] Polling started');
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
