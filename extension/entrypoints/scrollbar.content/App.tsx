import { useState, useEffect, useCallback } from 'react';
import type {
  Trade,
  Game,
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
} from '~/utils/types';
import type { BackgroundMessage, StateSnapshotMessage } from '~/utils/messaging';
import {
  feedEnabled as feedEnabledStorage,
  feedPosition as feedPositionStorage,
  feedHeight as feedHeightStorage,
  feedMode as feedModeStorage,
  feedCollapsed as feedCollapsedStorage,
  feedBehavior as feedBehaviorStorage,
} from '~/utils/storage';
import FeedBar from './FeedBar';

export default function App() {
  // ── Data state ───────────────────────────────────────────────
  const [trades, setTrades] = useState<Trade[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [enabled, setEnabled] = useState(true);

  // ── Preference state ─────────────────────────────────────────
  const [position, setPosition] = useState<FeedPosition>('bottom');
  const [height, setHeight] = useState(200);
  const [mode, setMode] = useState<FeedMode>('comfort');
  const [collapsed, setCollapsed] = useState(false);
  const [behavior, setBehavior] = useState<FeedBehavior>('overlay');

  // ── Load initial state from background + storage ─────────────
  useEffect(() => {
    // Request state snapshot from background
    browser.runtime
      .sendMessage({ type: 'GET_STATE' })
      .then((response: unknown) => {
        const snapshot = response as StateSnapshotMessage | null;
        if (snapshot?.type === 'STATE_SNAPSHOT') {
          setTrades(snapshot.trades);
          setGames(snapshot.games);
          setStatus(snapshot.connectionStatus);
        }
      })
      .catch(() => {
        // Background not ready yet
      });

    // Load preferences from storage
    feedEnabledStorage.getValue().then(setEnabled).catch(() => {});
    feedPositionStorage.getValue().then(setPosition).catch(() => {});
    feedHeightStorage.getValue().then(setHeight).catch(() => {});
    feedModeStorage.getValue().then(setMode).catch(() => {});
    feedCollapsedStorage.getValue().then(setCollapsed).catch(() => {});
    feedBehaviorStorage.getValue().then(setBehavior).catch(() => {});
  }, []);

  // ── Listen for broadcasts from background ────────────────────
  const handleMessage = useCallback((message: unknown) => {
    const msg = message as BackgroundMessage;

    switch (msg.type) {
      case 'STATE_UPDATE':
        // Background already processed CDC — just replace state
        setTrades(msg.trades);
        setGames(msg.games);
        break;

      case 'INITIAL_DATA': {
        // Dashboard data after login
        const { finance, sports } = msg.payload;
        if (finance) setTrades(finance as unknown as Trade[]);
        if (sports) setGames(sports as unknown as Game[]);
        break;
      }

      case 'CONNECTION_STATUS':
        setStatus(msg.status);
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    browser.runtime.onMessage.addListener(handleMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage]);

  // ── Watch storage for live preference changes ────────────────
  useEffect(() => {
    const unwatchers = [
      feedEnabledStorage.watch((v) => setEnabled(v)),
      feedPositionStorage.watch((v) => setPosition(v)),
      feedHeightStorage.watch((v) => setHeight(v)),
      feedModeStorage.watch((v) => setMode(v)),
      feedCollapsedStorage.watch((v) => setCollapsed(v)),
      feedBehaviorStorage.watch((v) => setBehavior(v)),
    ];

    return () => {
      unwatchers.forEach((unwatch) => unwatch());
    };
  }, []);

  // ── Manage push mode (adjust page margin) ────────────────────
  useEffect(() => {
    if (behavior !== 'push' || collapsed) {
      document.body.style.marginTop = '';
      document.body.style.marginBottom = '';
      return;
    }

    const prop = position === 'top' ? 'marginTop' : 'marginBottom';
    document.body.style[prop] = `${height}px`;

    return () => {
      document.body.style.marginTop = '';
      document.body.style.marginBottom = '';
    };
  }, [behavior, position, height, collapsed]);

  // Hide the feed bar when globally disabled
  if (!enabled) return null;

  return (
    <FeedBar
      trades={trades}
      games={games}
      connectionStatus={status}
      position={position}
      height={height}
      mode={mode}
      collapsed={collapsed}
      behavior={behavior}
      onToggleCollapse={() => {
        const next = !collapsed;
        setCollapsed(next);
        feedCollapsedStorage.setValue(next);
      }}
      onHeightChange={(h: number) => {
        setHeight(h);
        feedHeightStorage.setValue(h);
      }}
    />
  );
}
