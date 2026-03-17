import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTauriListener } from "./hooks/useTauriListener";
import { Menu, CheckMenuItem, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { dashboardQueryOptions, queryKeys } from "./api/queries";
import ScrollrTicker from "./components/ScrollrTicker";
import TickerToolbar from "./components/TickerToolbar";
import {
  getValidToken,
  isAuthenticated as checkAuth,
  getTier,
} from "./auth";
import { channelsApi, toggleChannelVisibility } from "./api/client";
import {
  loadPref,
  savePref,
  loadPrefs,
  savePrefs,
  TICKER_GAPS,
  TICKER_HEIGHTS,
  toggleWidgetOnTicker,
  toggleWidgetPin,
} from "./preferences";
import type { SubscriptionTier } from "./auth";
import type { ChannelType } from "./api/client";
import type { DeliveryMode } from "./types";
import type { AppPreferences, TickerPosition } from "./preferences";
import { getAllWidgets } from "./widgets/registry";
import { useWidgetTickerData } from "./hooks/useWidgetTickerData";
import { useTheme } from "./hooks/useTheme";
import { onStoreChange } from "./lib/store";

// ── Constants ────────────────────────────────────────────────────

import { API_BASE as API_URL } from "./config";
const POLL_INTERVALS: Record<SubscriptionTier, number> = {
  free: 60_000,
  uplink: 30_000,
  uplink_pro: 10_000,
  uplink_ultimate: 30_000, // Ultimate uses SSE — polling is just a safety-net fallback
};
/** Delay before re-fetching after an SSE config-change event, giving the
 *  backend time to propagate the update before we query. */
const SSE_REFETCH_DELAY_MS = 500;

// ── App (Ticker Window) ─────────────────────────────────────────

export default function App() {
  const queryClient = useQueryClient();

  // Auth + tier state (drives refetchInterval)
  const [authenticated, setAuthenticated] = useState(() => checkAuth());
  const [tier, setTier] = useState<SubscriptionTier>(() =>
    checkAuth() ? getTier() : "free",
  );

  // Delivery mode
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("polling");

  // ── Dashboard data via TanStack Query ──────────────────────────
  // refetchInterval replaces the manual setInterval polling lifecycle.
  // TanStack Query also handles refetchOnWindowFocus (configured in
  // the QueryClient defaults).

  const { data: dashboard } = useQuery({
    ...dashboardQueryOptions(),
    refetchInterval: POLL_INTERVALS[tier],
  });

  // Derive channels and active tabs from query data
  const channels = useMemo(
    () => dashboard?.channels ?? [],
    [dashboard?.channels],
  );

  const channelTabs = useMemo(() => {
    if (channels.length === 0) {
      return loadPref("activeFeedTabs", ["finance", "sports"]);
    }
    return channels
      .filter((ch) => ch.enabled && ch.visible)
      .map((ch) => ch.channel_type);
  }, [channels]);

  // Persist active tabs when they change (side effect, not in useMemo)
  useEffect(() => {
    if (channels.length > 0) {
      savePref("activeFeedTabs", channelTabs);
    }
  }, [channelTabs, channels.length]);

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

  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const tierRef = useRef<SubscriptionTier>(tier);
  tierRef.current = tier;
  const sseActiveRef = useRef(false);

  // ── SSE lifecycle ───────────────────────────────────────────

  const startSSE = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    sseActiveRef.current = true;
    setDeliveryMode("sse");
    await invoke("start_sse", { token, apiBase: API_URL }).catch(() => {
      sseActiveRef.current = false;
      setDeliveryMode("polling");
    });
  }, []);

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
            invoke("start_sse", { token: newToken, apiBase: API_URL }).catch(() => {
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
  // CDC events for user_channels come via SSE. We update the local
  // channelTabs optimistically and then invalidate the dashboard
  // query so TanStack Query re-fetches the full dashboard.
  //
  // Note: channelTabs is now derived from the query cache, so the
  // invalidation will cause it to update automatically. But the SSE
  // event gives us immediate CDC data to update tabs without waiting
  // for the re-fetch round-trip.

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

      // Optimistically update the dashboard cache with CDC channel changes
      queryClient.setQueryData(queryKeys.dashboard, (old: typeof dashboard) => {
        if (!old?.channels) return old;

        const updatedChannels = [...old.channels];
        for (const cdc of channelRecords) {
          const type = cdc.record.channel_type as string | undefined;
          if (!type) continue;

          const idx = updatedChannels.findIndex(
            (ch) => ch.channel_type === type,
          );

          if (cdc.action === "delete") {
            if (idx !== -1) updatedChannels.splice(idx, 1);
          } else if (idx !== -1) {
            updatedChannels[idx] = {
              ...updatedChannels[idx],
              enabled: cdc.record.enabled as boolean,
              visible: cdc.record.visible as boolean,
            };
          }
        }

        return { ...old, channels: updatedChannels };
      });

      // Re-fetch full dashboard after a delay to pick up data changes
      setTimeout(
        () =>
          queryClient.invalidateQueries({ queryKey: queryKeys.dashboard }),
        SSE_REFETCH_DELAY_MS,
      );
    },
    [queryClient],
  );

  // ── Initial SSE start for unlimited tier ──────────────────────

  useEffect(() => {
    async function init() {
      // Attempt silent token refresh to determine the real tier
      const token = await getValidToken();
      const resolvedTier = token ? getTier() : "free";
      setTier(resolvedTier);
      tierRef.current = resolvedTier;

      if (token && !authenticatedRef.current) {
        setAuthenticated(true);
      }

      if (resolvedTier === "uplink_ultimate") {
        startSSE();
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth sync from app window ──────────────────────────────────
  // When the user logs in/out via the app window, auth tokens change
  // in the store. onStoreChange fires here so we can react.

  useEffect(() => {
    return onStoreChange("scrollr:auth", () => {
      const wasAuth = authenticatedRef.current;
      const isAuth = checkAuth();
      setAuthenticated(isAuth);

      if (isAuth && !wasAuth) {
        // Just logged in — update tier (drives refetchInterval)
        const newTier = getTier();
        setTier(newTier);
        tierRef.current = newTier;
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        if (newTier === "uplink_ultimate") startSSE();
      } else if (!isAuth && wasAuth) {
        // Just logged out — tear down SSE, reset to free tier
        if (sseActiveRef.current) stopSSE();
        setTier("free");
        tierRef.current = "free";
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      }
    });
  }, [startSSE, stopSSE, queryClient]);

  // ── Cross-window prefs sync ─────────────────────────────────

  useEffect(() => {
    return onStoreChange<AppPreferences>("scrollr:settings", (next) => {
      if (!next) return;

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
      if (next.ticker.showTicker !== prev.ticker.showTicker) {
        const nextCollapsed = !next.ticker.showTicker;
        setTickerCollapsed(nextCollapsed);
        savePref("tickerCollapsed", nextCollapsed);
      }
    });
  }, []);

  // ── Theme + UI scale (shared hook) ────────────────────────────
  useTheme("desktop-shell", prefs.appearance.theme, prefs.appearance.uiScale);

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
      try {
        await toggleChannelVisibility(channelType, visible);
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      } catch {
        // Silently fail — will sync on next poll
      }
    },
    [queryClient],
  );

  // ── Widget quick-toggle (for context menu) ─────────────────────

  const handleWidgetToggle = useCallback(
    (widgetId: string) => {
      setPrefs((prev) => {
        const updated = toggleWidgetOnTicker(prev, widgetId);
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
        const updated = toggleWidgetPin(prev, widgetId);
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

  const handleToggleWindowPin = useCallback(() => {
    const next = !prefsRef.current.window.pinned;
    setPinned(next);
    savePref("feedPinned", next);
    const updated = {
      ...prefsRef.current,
      window: { ...prefsRef.current.window, pinned: next },
    };
    setPrefs(updated);
    savePrefs(updated);
    invoke("pin_window", { pinned: next }).catch(() => {});
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
      items.push(
        await CheckMenuItem.new({
          text: "Pin on Top",
          checked: prefsRef.current.window.pinned,
          action: handleToggleWindowPin,
        }),
      );

      // Hide Ticker
      items.push(
        await MenuItem.new({
          text: "Hide Ticker",
          action: handleHideTicker,
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
  const activeTabs = useMemo(
    () => [...channelTabs, ...prefs.widgets.widgetsOnTicker],
    [channelTabs, prefs.widgets.widgetsOnTicker],
  );

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
              key={`row${i}`}
              dashboard={dashboard ?? null}
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
