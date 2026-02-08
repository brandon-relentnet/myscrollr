import { useState, useEffect, useCallback } from 'react';
import type {
  Trade,
  Game,
  RssItem,
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  FeedCategory,
} from '~/utils/types';
import type { BackgroundMessage, ClientMessage, StateSnapshotMessage } from '~/utils/messaging';
import {
  feedEnabled as feedEnabledStorage,
  feedPosition as feedPositionStorage,
  feedHeight as feedHeightStorage,
  feedMode as feedModeStorage,
  feedCollapsed as feedCollapsedStorage,
  feedBehavior as feedBehaviorStorage,
  activeFeedTabs as activeFeedTabsStorage,
} from '~/utils/storage';
import type { ContentScriptContext } from '#imports';
import FeedBar from './FeedBar';

interface AppProps {
  ctx: ContentScriptContext;
}

export default function App({ ctx }: AppProps) {
  // ── Data state ───────────────────────────────────────────────
  const [trades, setTrades] = useState<Trade[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [rssItems, setRssItems] = useState<RssItem[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [enabled, setEnabled] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  // ── Preference state ─────────────────────────────────────────
  const [position, setPosition] = useState<FeedPosition>('bottom');
  const [height, setHeight] = useState(200);
  const [mode, setMode] = useState<FeedMode>('comfort');
  const [collapsed, setCollapsed] = useState(false);
  const [behavior, setBehavior] = useState<FeedBehavior>('overlay');
  const [activeTabs, setActiveTabs] = useState<FeedCategory[]>(['finance', 'sports']);

  // ── Load initial state from background + storage ─────────────
  useEffect(() => {
    if (!ctx.isValid) return;

    // Request state snapshot from background
    browser.runtime
      .sendMessage({ type: 'GET_STATE' } satisfies ClientMessage)
      .then((response: unknown) => {
        if (!ctx.isValid) return;
        const snapshot = response as StateSnapshotMessage | null;
        if (snapshot?.type === 'STATE_SNAPSHOT') {
          setTrades(snapshot.trades);
          setGames(snapshot.games);
          setRssItems(snapshot.rssItems || []);
          setStatus(snapshot.connectionStatus);
          setAuthenticated(snapshot.authenticated);
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
    activeFeedTabsStorage.getValue().then(setActiveTabs).catch(() => {});
  }, [ctx]);

  // ── Listen for broadcasts from background ────────────────────
  const handleMessage = useCallback((message: unknown) => {
    const msg = message as BackgroundMessage;

    switch (msg.type) {
      case 'STATE_UPDATE':
        // Background already processed CDC — just replace state
        setTrades(msg.trades);
        setGames(msg.games);
        setRssItems(msg.rssItems || []);
        break;

      case 'INITIAL_DATA': {
        // Dashboard data after login
        const { finance, sports, rss } = msg.payload;
        if (finance) setTrades(finance as unknown as Trade[]);
        if (sports) setGames(sports as unknown as Game[]);
        if (rss) setRssItems(rss as unknown as RssItem[]);
        break;
      }

      case 'CONNECTION_STATUS':
        setStatus(msg.status);
        break;

      case 'AUTH_STATUS':
        setAuthenticated(msg.authenticated);
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!ctx.isValid) return;
    browser.runtime.onMessage.addListener(handleMessage);

    // Clean up on context invalidation (extension update/reinstall)
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(handleMessage);
    });

    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
    };
  }, [handleMessage, ctx]);

  // ── Watch storage for live preference changes ────────────────
  useEffect(() => {
    if (!ctx.isValid) return;

    const unwatchers = [
      feedEnabledStorage.watch((v) => setEnabled(v)),
      feedPositionStorage.watch((v) => setPosition(v)),
      feedHeightStorage.watch((v) => setHeight(v)),
      feedModeStorage.watch((v) => setMode(v)),
      feedCollapsedStorage.watch((v) => setCollapsed(v)),
      feedBehaviorStorage.watch((v) => setBehavior(v)),
      activeFeedTabsStorage.watch((v) => setActiveTabs(v)),
    ];

    const cleanup = () => unwatchers.forEach((unwatch) => unwatch());

    // Clean up on context invalidation (extension update/reinstall)
    ctx.onInvalidated(cleanup);

    return cleanup;
  }, [ctx]);

  // ── Manage push mode (adjust page margin) ────────────────────
  useEffect(() => {
    const resetMargins = () => {
      document.body.style.marginTop = '';
      document.body.style.marginBottom = '';
    };

    if (!ctx.isValid || behavior !== 'push' || collapsed || !authenticated) {
      resetMargins();
      return;
    }

    const prop = position === 'top' ? 'marginTop' : 'marginBottom';
    document.body.style[prop] = `${height}px`;

    // Always clean up margins, even on context invalidation
    ctx.onInvalidated(resetMargins);

    return resetMargins;
  }, [behavior, position, height, collapsed, authenticated, ctx]);

  // ── Login handler ──────────────────────────────────────────────
  const handleLogin = useCallback(() => {
    browser.runtime.sendMessage({ type: 'LOGIN' } satisfies ClientMessage).catch(() => {});
  }, []);

  // Hide the feed bar when globally disabled
  if (!enabled) return null;

  return (
    <FeedBar
      trades={trades}
      games={games}
      rssItems={rssItems}
      connectionStatus={status}
      position={position}
      height={height}
      mode={mode}
      collapsed={collapsed}
      behavior={behavior}
      activeTabs={activeTabs}
      authenticated={authenticated}
      onLogin={handleLogin}
      onToggleCollapse={() => {
        const next = !collapsed;
        setCollapsed(next);
        feedCollapsedStorage.setValue(next);
      }}
      onHeightChange={(h: number) => {
        setHeight(h);
      }}
      onHeightCommit={(h: number) => {
        feedHeightStorage.setValue(h);
      }}
    />
  );
}
