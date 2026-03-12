import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { useTauriListener } from "./hooks/useTauriListener";
import { Menu, CheckMenuItem, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type {
  DashboardResponse,
  DeliveryMode,
} from "./types";
import ScrollrTicker from "./components/ScrollrTicker";
import TickerToolbar from "./components/TickerToolbar";
import {
  getValidToken,
  isAuthenticated as checkAuth,
  getTier,
} from "./auth";
import type { SubscriptionTier } from "./auth";
import type { Channel, ChannelType } from "./api/client";
import { channelsApi } from "./api/client";
import {
  loadPref,
  savePref,
  loadPrefs,
  savePrefs,
  resolveTheme,
  TICKER_GAPS,
  TICKER_HEIGHTS,
} from "./preferences";
import type { AppPreferences, TickerPosition } from "./preferences";
import { getAllWidgets } from "./widgets/registry";
import { useWidgetTickerData } from "./hooks/useWidgetTickerData";

// ── Constants ────────────────────────────────────────────────────

import { API_BASE as API_URL } from "./config";
const POLL_INTERVALS: Record<SubscriptionTier, number> = {
  free: 60_000,
  uplink: 30_000,
  uplink_unlimited: 30_000,
};
/** Delay before re-fetching after an SSE config-change event, giving the
 *  backend time to propagate the update before we query. */
const SSE_REFETCH_DELAY_MS = 500;

// ── App (Ticker Window) ─────────────────────────────────────────

export default function App() {
  // Data state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("polling");

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTabs, setChannelTabs] = useState<string[]>(() =>
    loadPref("activeFeedTabs", ["finance", "sports"]),
  );
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  // Ticker state
  const [tickerCollapsed, setTickerCollapsed] = useState(() =>
    loadPref("tickerCollapsed", false),
  );

  // Pin (always-on-top) state
  const [pinned, setPinned] = useState(() => loadPref("feedPinned", true));

  // Ticker position state (top/bottom of screen)
  const [tickerPosition, setTickerPosition] = useState<TickerPosition>(() =>
    loadPref("tickerPosition", "top"),
  );

  // Hover state for toolbar visibility
  const [hovered, setHovered] = useState(false);

  // Settings preferences
  const [prefs, setPrefs] = useState<AppPreferences>(loadPrefs);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => checkAuth());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const tierRef = useRef<SubscriptionTier>("free");
  const sseActiveRef = useRef(false);

  // ── Fetch feed data ───────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    try {
      // Always attempt to get a valid token — handles silent refresh
      // even when the access token has expired but a refresh token exists.
      const token = await getValidToken();
      let res: Response;

      if (token) {
        // Sync auth state (covers silent refresh from expired state)
        if (!authenticatedRef.current) {
          setAuthenticated(true);
          const currentTier = getTier();
          tierRef.current = currentTier;
        }
        res = await fetch(`${API_URL}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          setAuthenticated(false);
          tierRef.current = "free";
          res = await fetch(`${API_URL}/public/feed`);
        }
      } else {
        if (authenticatedRef.current) {
          setAuthenticated(false);
          tierRef.current = "free";
        }
        res = await fetch(`${API_URL}/public/feed`);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDashboard({ data: data.data });

      // Sync channels and active tabs from server config
      if (Array.isArray(data.channels)) {
        const channelList = data.channels as Channel[];
        setChannels(channelList);
        const visible = channelList
          .filter((ch) => ch.enabled && ch.visible)
          .map((ch) => ch.channel_type);
        setChannelTabs(visible);
        savePref("activeFeedTabs", visible);
      }
    } catch {
      // Silently fail — ticker just shows stale data
    }
  }, []);

  // ── Polling lifecycle ─────────────────────────────────────────

  const startPolling = useCallback(
    (tier: SubscriptionTier) => {
      if (pollRef.current) clearInterval(pollRef.current);
      const interval = POLL_INTERVALS[tier];
      fetchFeed();
      pollRef.current = setInterval(fetchFeed, interval);
    },
    [fetchFeed],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── SSE lifecycle ───────────────────────────────────────────

  const startSSE = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    sseActiveRef.current = true;
    setDeliveryMode("sse");
    await invoke("start_sse", { token }).catch(() => {
      sseActiveRef.current = false;
      setDeliveryMode("polling");
      startPolling(tierRef.current);
    });
  }, [startPolling]);

  const stopSSE = useCallback(async () => {
    sseActiveRef.current = false;
    setDeliveryMode("polling");
    await invoke("stop_sse").catch(() => {});
  }, []);

  // Listen for SSE status events from the Rust backend
  useTauriListener<{ status: string; code?: number; error?: string }>(
    "sse-status",
    async (event) => {
      const { status: sseStatus } = event.payload;

      switch (sseStatus) {
        case "connected":
          setDeliveryMode("sse");
          break;
        case "auth-expired": {
          sseActiveRef.current = false;
          setDeliveryMode("polling");
          const newToken = await getValidToken();
          if (newToken) {
            sseActiveRef.current = true;
            setDeliveryMode("sse");
            invoke("start_sse", { token: newToken }).catch(() => {
              sseActiveRef.current = false;
              setDeliveryMode("polling");
            });
          }
          break;
        }
        case "disconnected":
        case "error":
          setDeliveryMode("polling");
          break;
      }
    },
  );

  // ── Channel config sync via CDC ────────────────────────────────

  useTauriListener<{
    data?: {
      action: string;
      record: Record<string, unknown>;
      metadata: { table_name: string };
    }[];
  }>(
    "sse-event",
    (event) => {
      const records = event.payload?.data;
      if (!Array.isArray(records)) return;

      const channelRecords = records.filter(
        (r) => r.metadata?.table_name === "user_channels",
      );
      if (channelRecords.length === 0) return;

      setChannelTabs((prev) => {
        let next = [...prev];

        for (const cdc of channelRecords) {
          const type = cdc.record.channel_type as string | undefined;
          if (!type) continue;

          if (
            cdc.action === "delete" ||
            !cdc.record.enabled ||
            !cdc.record.visible
          ) {
            next = next.filter((t) => t !== type);
          } else if (!next.includes(type)) {
            next.push(type);
          }
        }

        savePref("activeFeedTabs", next);
        return next;
      });

      setTimeout(() => fetchFeed(), SSE_REFETCH_DELAY_MS);
    },
    [fetchFeed],
  );

  // ── Initial data fetch + delivery start ────────────────────────

  useEffect(() => {
    async function init() {
      // Attempt silent token refresh to determine the real tier,
      // even if checkAuth() returned false due to an expired access token.
      const token = await getValidToken();
      const tier = token ? getTier() : "free";
      tierRef.current = tier;

      if (token && !authenticatedRef.current) {
        setAuthenticated(true);
      }

      startPolling(tier);

      if (tier === "uplink_unlimited") {
        startSSE();
      }
    }

    init();

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Window focus refetch ────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    const appWindow = getCurrentWindow();
    appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused && authenticatedRef.current) {
        fetchFeed();
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fetchFeed]);

  // ── Auth sync from app window ──────────────────────────────────
  // When the user logs in/out via the app window, auth tokens change
  // in localStorage. StorageEvent fires here so we can react.

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      // Auth state stored under scrollr:auth (single key with full token set)
      if (e.key === "scrollr:auth") {
        const wasAuth = authenticatedRef.current;
        const isAuth = checkAuth();
        setAuthenticated(isAuth);

        if (isAuth && !wasAuth) {
          // Just logged in — restart with proper tier
          const tier = getTier();
          tierRef.current = tier;
          stopPolling();
          startPolling(tier);
          if (tier === "uplink_unlimited") startSSE();
        } else if (!isAuth && wasAuth) {
          // Just logged out — tear down SSE, restart as anonymous
          if (sseActiveRef.current) stopSSE();
          stopPolling();
          startPolling("free");
          tierRef.current = "free";
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [startPolling, stopPolling, startSSE, stopSSE]);

  // ── Cross-window prefs sync ─────────────────────────────────

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "scrollr:settings" && e.newValue) {
        let next: AppPreferences;
        try {
          next = JSON.parse(e.newValue) as AppPreferences;
        } catch {
          return;
        }

        const prev = prefsRef.current;
        setPrefs(next);

        // Side effects: pin toggle
        if (next.window.pinned !== prev.window.pinned) {
          setPinned(next.window.pinned);
          savePref("feedPinned", next.window.pinned);
          invoke("pin_window", { pinned: next.window.pinned }).catch(() => {});
        }

        // Side effects: ticker position
        if (next.window.tickerPosition !== prev.window.tickerPosition) {
          setTickerPosition(next.window.tickerPosition);
          savePref("tickerPosition", next.window.tickerPosition);
          const h = TICKER_HEIGHTS[next.ticker.tickerMode] * next.appearance.tickerRows;
          invoke("position_ticker", { position: next.window.tickerPosition, height: h }).catch(() => {});
        }

        // Side effects: ticker visibility
        const nextCollapsed = !next.ticker.showTicker;
        setTickerCollapsed(nextCollapsed);
        savePref("tickerCollapsed", nextCollapsed);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Theme application ────────────────────────────────────────

  useEffect(() => {
    const shell = document.getElementById("desktop-shell");
    if (!shell) return;

    const resolved = resolveTheme(prefs.appearance.theme);

    shell.classList.add("theme-transition");
    shell.dataset.theme = resolved;
    const timer = setTimeout(
      () => shell.classList.remove("theme-transition"),
      350,
    );

    if (prefs.appearance.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        shell.dataset.theme = e.matches ? "dark" : "light";
      };
      mq.addEventListener("change", handler);
      return () => {
        clearTimeout(timer);
        mq.removeEventListener("change", handler);
      };
    }

    return () => clearTimeout(timer);
  }, [prefs.appearance.theme]);

  // ── UI scale application ───────────────────────────────────────

  useEffect(() => {
    const shell = document.getElementById("desktop-shell");
    if (!shell) return;
    shell.style.zoom =
      prefs.appearance.uiScale === 100
        ? ""
        : `${prefs.appearance.uiScale}%`;
  }, [prefs.appearance.uiScale]);

  // ── Broadcast delivery mode to app window ─────────────────────

  useEffect(() => {
    savePref("deliveryMode", deliveryMode);
  }, [deliveryMode]);

  // ── Initial setup ────────────────────────────────────────────

  useEffect(() => {
    const tickerH = tickerCollapsed
      ? 0
      : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows;
    if (tickerH > 0) {
      // position_ticker sets size + position atomically via compositor
      invoke("position_ticker", { position: tickerPosition, height: tickerH })
        .then(() => getCurrentWindow().show())
        .catch(() => {});
    }
    invoke("pin_window", { pinned }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resize ticker when row/mode prefs change ───────────────────
  // position_ticker sets the full geometry (x, y, width, height)
  // atomically via compositor-specific commands. This avoids the
  // race condition where set_size() hasn't propagated before the
  // position calculation reads the old height.

  useEffect(() => {
    const tickerH = tickerCollapsed
      ? 0
      : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows;
    if (tickerH > 0) {
      invoke("position_ticker", { position: tickerPosition, height: tickerH }).catch(() => {});
    }
  }, [
    prefs.ticker.tickerMode,
    prefs.appearance.tickerRows,
    tickerCollapsed,
    tickerPosition,
  ]);

  // ── Show/hide ticker window based on visibility ────────────────

  useEffect(() => {
    const win = getCurrentWindow();
    if (tickerCollapsed || !prefs.ticker.showTicker) {
      win.hide().catch(() => {});
    } else {
      win.show().catch(() => {});
    }
  }, [tickerCollapsed, prefs.ticker.showTicker]);

  // ── Chip click → open app window on that channel ───────────────

  const handleChipClick = useCallback(
    (channelType: string, _itemId: string | number) => {
      savePref("activeItem", channelType);
      invoke("show_app_window").catch(() => {});
    },
    [],
  );

  // ── Channel quick-toggle (for context menu) ────────────────────

  const handleChannelToggle = useCallback(
    async (channelType: ChannelType, visible: boolean) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.update(
          channelType,
          { visible },
          () => Promise.resolve(token),
        );
        fetchFeed();
      } catch {
        // Silently fail — will sync on next poll
      }
    },
    [fetchFeed],
  );

  // ── Widget quick-toggle (for context menu) ─────────────────────

  const handleWidgetToggle = useCallback(
    (widgetId: string) => {
      setPrefs((prev) => {
        const onTicker = prev.widgets.widgetsOnTicker;
        const next = onTicker.includes(widgetId)
          ? onTicker.filter((id) => id !== widgetId)
          : [...onTicker, widgetId];
        const updated = {
          ...prev,
          widgets: { ...prev.widgets, widgetsOnTicker: next },
        };
        savePrefs(updated);
        return updated;
      });
    },
    [],
  );

  // ── Widget pin toggle (hover icon on consolidated chip) ─────────

  const handleTogglePin = useCallback(
    (widgetId: string) => {
      setPrefs((prev) => {
        const pinned = { ...prev.widgets.pinnedWidgets };
        if (pinned[widgetId]) {
          delete pinned[widgetId];
        } else {
          pinned[widgetId] = { side: "left" };
        }
        const updated = {
          ...prev,
          widgets: { ...prev.widgets, pinnedWidgets: pinned },
        };
        savePrefs(updated);
        return updated;
      });
    },
    [],
  );

  // ── Ticker position toggle ─────────────────────────────────────

  const handleTogglePosition = useCallback(() => {
    const next: TickerPosition = tickerPosition === "top" ? "bottom" : "top";
    setTickerPosition(next);
    savePref("tickerPosition", next);
    const updated = {
      ...prefsRef.current,
      window: { ...prefsRef.current.window, tickerPosition: next },
    };
    setPrefs(updated);
    savePrefs(updated);
    const h = TICKER_HEIGHTS[updated.ticker.tickerMode] * updated.appearance.tickerRows;
    invoke("position_ticker", { position: next, height: h }).catch(() => {});
  }, [tickerPosition]);

  // ── Hide ticker from toolbar ───────────────────────────────────

  const handleHideTicker = useCallback(() => {
    setTickerCollapsed(true);
    savePref("tickerCollapsed", true);
    const updated = {
      ...prefsRef.current,
      ticker: { ...prefsRef.current.ticker, showTicker: false },
    };
    setPrefs(updated);
    savePrefs(updated);
  }, []);

  // ── Right-click → native context menu ──────────────────────────

  useEffect(() => {
    async function onContextMenu(e: MouseEvent) {
      e.preventDefault();

      const items: (CheckMenuItem | MenuItem | PredefinedMenuItem)[] = [];
      const chs = channelsRef.current;

      // Channel quick toggles (only when authenticated with channels)
      if (chs.length > 0) {
        for (const ch of chs) {
          const channelType = ch.channel_type;
          const isVisible = ch.enabled && ch.visible;
          const label =
            channelType.charAt(0).toUpperCase() + channelType.slice(1);
          const item = await CheckMenuItem.new({
            text: label,
            checked: isVisible,
            action: () => {
              handleChannelToggle(channelType, !isVisible);
            },
          });
          items.push(item);
        }
        items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      }

      // Widget quick toggles
      const allWidgets = getAllWidgets();
      if (allWidgets.length > 0) {
        for (const widget of allWidgets) {
          const isEnabled = prefsRef.current.widgets.widgetsOnTicker.includes(widget.id);
          const item = await CheckMenuItem.new({
            text: widget.name,
            checked: isEnabled,
            action: () => {
              handleWidgetToggle(widget.id);
            },
          });
          items.push(item);
        }
        items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      }

      // Open Scrollr
      items.push(
        await MenuItem.new({
          text: "Open Scrollr",
          action: () => {
            invoke("show_app_window").catch(() => {});
          },
        }),
      );

      // Separator
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));

      // Pin on Top
      const isPinned = prefsRef.current.window.pinned;
      items.push(
        await CheckMenuItem.new({
          text: "Pin on Top",
          checked: isPinned,
          action: () => {
            const next = !isPinned;
            setPinned(next);
            savePref("feedPinned", next);
            const updated = {
              ...prefsRef.current,
              window: { ...prefsRef.current.window, pinned: next },
            };
            setPrefs(updated);
            savePrefs(updated);
            invoke("pin_window", { pinned: next }).catch(() => {});
          },
        }),
      );

      // Hide Ticker
      items.push(
        await MenuItem.new({
          text: "Hide Ticker",
          action: () => {
            setTickerCollapsed(true);
            savePref("tickerCollapsed", true);
            const updated = {
              ...prefsRef.current,
              ticker: { ...prefsRef.current.ticker, showTicker: false },
            };
            setPrefs(updated);
            savePrefs(updated);
          },
        }),
      );

      // Separator + Quit
      items.push(await PredefinedMenuItem.new({ item: "Separator" }));
      items.push(
        await MenuItem.new({
          text: "Quit",
          action: () => {
            invoke("quit_app").catch(() => {});
          },
        }),
      );

      const menu = await Menu.new({ items });
      await menu.popup().catch(() => {});
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [handleChannelToggle, handleWidgetToggle]);

  // ── Merge channel + widget tabs ──────────────────────────────
  const activeTabs = [...channelTabs, ...prefs.widgets.widgetsOnTicker];

  // ── Widget ticker data (local polling for clock/weather/sysmon) ──
  const widgetData = useWidgetTickerData(prefs.widgets);

  // ── Render ─────────────────────────────────────────────────────

  const showTicker = !tickerCollapsed && prefs.ticker.showTicker;

  return (
    <div
      id="desktop-shell"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showTicker && (
        <>
          <TickerToolbar
            position={tickerPosition}
            hovered={hovered}
            onTogglePosition={handleTogglePosition}
            onHideTicker={handleHideTicker}
          />
          {Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
            <ScrollrTicker
              key={`row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.ticker.tickerDirection}-${prefs.ticker.scrollMode}-${prefs.ticker.stepPause}-${prefs.appearance.tickerRows}`}
              dashboard={dashboard}
              activeTabs={activeTabs}
              widgetData={widgetData}
              onChipClick={handleChipClick}
              onTogglePin={handleTogglePin}
              pinnedWidgets={prefs.widgets.pinnedWidgets}
              speed={prefs.ticker.tickerSpeed}
              gap={TICKER_GAPS[prefs.ticker.tickerGap]}
              pauseOnHover={prefs.ticker.pauseOnHover}
              hoverSpeed={prefs.ticker.hoverSpeed}
              mixMode={prefs.ticker.mixMode}
              chipColorMode={prefs.ticker.chipColors}
              comfort={prefs.ticker.tickerMode === "comfort"}
              rowIndex={i}
              totalRows={prefs.appearance.tickerRows}
              direction={prefs.ticker.tickerDirection}
              scrollMode={prefs.ticker.scrollMode}
              stepPause={prefs.ticker.stepPause}
            />
          ))}
        </>
      )}
    </div>
  );
}
