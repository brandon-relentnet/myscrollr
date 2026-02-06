import { useState, useEffect } from 'react';
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
} from '~/utils/types';
import type { StateSnapshotMessage } from '~/utils/messaging';
import {
  feedEnabled as feedEnabledStorage,
  feedPosition as feedPositionStorage,
  feedMode as feedModeStorage,
  feedBehavior as feedBehaviorStorage,
} from '~/utils/storage';

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
      .sendMessage({ type: 'GET_STATE' })
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
      const msg = message as Record<string, unknown>;
      if (msg.type === 'AUTH_STATUS' && typeof msg.authenticated === 'boolean') {
        setAuthenticated(msg.authenticated);
      }
      if (msg.type === 'CONNECTION_STATUS' && typeof msg.status === 'string') {
        setStatus(msg.status as ConnectionStatus);
      }
    };
    browser.runtime.onMessage.addListener(handler);
    return () => browser.runtime.onMessage.removeListener(handler);
  }, []);

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    await feedEnabledStorage.setValue(next);
  };

  const changePosition = async (val: FeedPosition) => {
    setPosition(val);
    await feedPositionStorage.setValue(val);
  };

  const changeMode = async (val: FeedMode) => {
    setMode(val);
    await feedModeStorage.setValue(val);
  };

  const changeBehavior = async (val: FeedBehavior) => {
    setBehavior(val);
    await feedBehaviorStorage.setValue(val);
  };

  const openOptions = () => {
    browser.runtime.openOptionsPage();
  };

  const handleLogin = () => {
    browser.runtime.sendMessage({ type: 'LOGIN' });
  };

  const handleLogout = () => {
    browser.runtime.sendMessage({ type: 'LOGOUT' }).then(() => {
      setAuthenticated(false);
    });
  };

  return (
    <div className="w-[320px] bg-zinc-900 text-zinc-100 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span className="font-bold text-base tracking-tight">Scrollr</span>
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              status === 'connected'
                ? 'bg-emerald-400'
                : status === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
            }`}
          />
          <span className="text-xs text-zinc-500 capitalize">{status}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Feed</span>
          <button
            onClick={toggleEnabled}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              enabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
            }`}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Mode</span>
          <select
            value={mode}
            onChange={(e) => changeMode(e.target.value as FeedMode)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="comfort">Comfort</option>
            <option value="compact">Compact</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Position</span>
          <select
            value={position}
            onChange={(e) => changePosition(e.target.value as FeedPosition)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Behavior</span>
          <select
            value={behavior}
            onChange={(e) => changeBehavior(e.target.value as FeedBehavior)}
            className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="overlay">Overlay</option>
            <option value="push">Push Content</option>
          </select>
        </div>
      </div>

      {/* Auth */}
      <div className="px-4 py-3 border-t border-zinc-800">
        {authenticated ? (
          <button
            onClick={handleLogout}
            className="w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign Out
          </button>
        ) : (
          <button
            onClick={handleLogin}
            className="w-full py-1.5 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
          >
            Sign In
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800">
        <button
          onClick={openOptions}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
