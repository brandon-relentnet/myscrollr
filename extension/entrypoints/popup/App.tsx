import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
} from '~/utils/types';
import type { BackgroundMessage, StateSnapshotMessage, ClientMessage } from '~/utils/messaging';
import {
  feedEnabled as feedEnabledStorage,
  feedPosition as feedPositionStorage,
  feedMode as feedModeStorage,
  feedBehavior as feedBehaviorStorage,
  authToken,
  authTokenExpiry,
} from '~/utils/storage';
import { API_URL, FRONTEND_URL } from '~/utils/constants';

const STATUS_CONFIG = {
  connected: { dot: 'bg-accent', label: 'LIVE', labelClass: 'text-accent/70' },
  reconnecting: { dot: 'bg-warn animate-pulse', label: 'SYNC', labelClass: 'text-warn/70' },
  disconnected: { dot: 'bg-down/60', label: 'OFF', labelClass: 'text-fg-3' },
} as const;

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [enabled, setEnabled] = useState(true);
  const [position, setPosition] = useState<FeedPosition>('bottom');
  const [mode, setMode] = useState<FeedMode>('comfort');
  const [behavior, setBehavior] = useState<FeedBehavior>('overlay');
  const [authenticated, setAuthenticated] = useState(false);

  // Load state on mount
  useEffect(() => {
    browser.runtime
      .sendMessage({ type: 'GET_STATE' } satisfies ClientMessage)
      .then((response: unknown) => {
        const snapshot = response as StateSnapshotMessage | null;
        if (snapshot?.type === 'STATE_SNAPSHOT') {
          setStatus(snapshot.connectionStatus);
          setAuthenticated(snapshot.authenticated);
        }
      })
      .catch(() => {});

    feedEnabledStorage.getValue().then(setEnabled).catch(() => {});
    feedPositionStorage.getValue().then(setPosition).catch(() => {});
    feedModeStorage.getValue().then(setMode).catch(() => {});
    feedBehaviorStorage.getValue().then(setBehavior).catch(() => {});
  }, []);

  // Listen for live broadcasts from background
  useEffect(() => {
    const handler = (message: unknown) => {
      const msg = message as BackgroundMessage;
      switch (msg.type) {
        case 'AUTH_STATUS':
          setAuthenticated(msg.authenticated);
          break;
        case 'CONNECTION_STATUS':
          setStatus(msg.status);
          break;
      }
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  // Fire-and-forget PUT to server for cross-device preference sync.
  // Local WXT storage is already updated before this is called, so
  // the extension works instantly even if the API call fails.
  const syncPreferenceToServer = async (
    key: string,
    value: unknown,
  ): Promise<void> => {
    try {
      const token = await authToken.getValue();
      const expiry = await authTokenExpiry.getValue();
      if (!token || (expiry && expiry - Date.now() < 10_000)) return;

      fetch(`${API_URL}/users/me/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ [key]: value }),
      }).catch(() => {}); // fire and forget
    } catch {
      // Ignore — local state is already updated
    }
  };

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await feedEnabledStorage.setValue(next);
    syncPreferenceToServer('feed_enabled', next);
  };

  const changePosition = async (val: FeedPosition) => {
    setPosition(val);
    await feedPositionStorage.setValue(val);
    syncPreferenceToServer('feed_position', val);
  };

  const changeMode = async (val: FeedMode) => {
    setMode(val);
    await feedModeStorage.setValue(val);
    syncPreferenceToServer('feed_mode', val);
  };

  const changeBehavior = async (val: FeedBehavior) => {
    setBehavior(val);
    await feedBehaviorStorage.setValue(val);
    syncPreferenceToServer('feed_behavior', val);
  };

  const openSettings = () => {
    browser.tabs.create({ url: `${FRONTEND_URL}/dashboard` });
  };

  const handleLogin = () => {
    browser.runtime.sendMessage({ type: 'LOGIN' } satisfies ClientMessage);
  };

  const handleLogout = () => {
    browser.runtime.sendMessage({ type: 'LOGOUT' } satisfies ClientMessage).then(() => {
      setAuthenticated(false);
    });
  };

  const statusCfg = STATUS_CONFIG[status];

  return (
    <div className="w-[320px] bg-surface text-fg text-sm font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge">
        <span className="text-[11px] font-mono font-bold tracking-[0.2em] text-accent uppercase">
          scrollr
        </span>
        <div className="flex items-center gap-1.5">
          <div className={clsx('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
          <span className={clsx('text-[9px] font-mono uppercase tracking-widest', statusCfg.labelClass)}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Accent line under header */}
      <div className="h-px bg-gradient-to-r from-transparent via-accent/15 to-transparent" />

      {/* Controls */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-fg-2 uppercase tracking-wider">Feed</span>
          <button
            onClick={toggleEnabled}
            className={clsx(
              'px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              enabled
                ? 'bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25'
                : 'bg-surface-2 text-fg-3 border border-edge hover:text-fg-2',
            )}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-fg-2 uppercase tracking-wider">Mode</span>
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as FeedMode)}
            className="bg-surface-2 border border-edge text-[11px] font-mono text-fg px-2 py-1 focus:outline-none focus:border-accent/30"
          >
            <option value="comfort">Comfort</option>
            <option value="compact">Compact</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-fg-2 uppercase tracking-wider">Position</span>
          <select
            value={position}
            onChange={(e) => changePosition(e.target.value as FeedPosition)}
            className="bg-surface-2 border border-edge text-[11px] font-mono text-fg px-2 py-1 focus:outline-none focus:border-accent/30"
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-fg-2 uppercase tracking-wider">Behavior</span>
          <select
            value={behavior}
            onChange={(e) => changeBehavior(e.target.value as FeedBehavior)}
            className="bg-surface-2 border border-edge text-[11px] font-mono text-fg px-2 py-1 focus:outline-none focus:border-accent/30"
          >
            <option value="overlay">Overlay</option>
            <option value="push">Push Content</option>
          </select>
        </div>
      </div>

      {/* Auth */}
      <div className="px-4 py-3 border-t border-edge">
        {authenticated ? (
          <button
            onClick={handleLogout}
            className="w-full text-[10px] font-mono text-fg-3 uppercase tracking-wider hover:text-fg-2 transition-colors"
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full py-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.15em] bg-accent text-surface hover:bg-accent/90 transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-edge">
        <button
          onClick={openSettings}
          className="text-[10px] font-mono text-fg-3 uppercase tracking-wider hover:text-accent transition-colors"
        >
          Dashboard &rarr;
        </button>
      </div>
    </div>
  );
}
