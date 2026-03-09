import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";
import { Menu, CheckMenuItem, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type {
  DashboardResponse,
  DeliveryMode,
} from "~/utils/types";
import ScrollrTicker from "./components/ScrollrTicker";
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
  TICKER_GAPS,
  TICKER_HEIGHTS,
} from "./preferences";
import type { AppPreferences } from "./preferences";

// ── Constants ────────────────────────────────────────────────────

const API_URL = "https://api.myscrollr.relentnet.dev";
const POLL_INTERVALS: Record<SubscriptionTier, number> = {
  free: 60_000,
  uplink: 30_000,
  uplink_unlimited: 30_000,
};

// ── App (Ticker Window) ─────────────────────────────────────────

export default function App() {
  // Data state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("polling");

  // Channel state
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeTabs, setActiveTabs] = useState<string[]>(() =>
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
      let res: Response;

      if (authenticatedRef.current) {
        const token = await getValidToken();
        if (!token) {
          setAuthenticated(false);
          res = await fetch(`${API_URL}/public/feed`);
        } else {
          res = await fetch(`${API_URL}/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401) {
            setAuthenticated(false);
            res = await fetch(`${API_URL}/public/feed`);
          }
        }
      } else {
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
        setActiveTabs(visible);
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
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<{ status: string; code?: number; error?: string }>(
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
    ).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // ── Channel config sync via CDC ────────────────────────────────

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<{
      data?: {
        action: string;
        record: Record<string, unknown>;
        metadata: { table_name: string };
      }[];
    }>("sse-event", (event) => {
      const records = event.payload?.data;
      if (!Array.isArray(records)) return;

      const channelRecords = records.filter(
        (r) => r.metadata?.table_name === "user_channels",
      );
      if (channelRecords.length === 0) return;

      setActiveTabs((prev) => {
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

      setTimeout(() => fetchFeed(), 500);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchFeed]);

  // ── Initial data fetch + delivery start ────────────────────────

  useEffect(() => {
    const tier = authenticated ? getTier() : "free";
    tierRef.current = tier;

    startPolling(tier);

    if (tier === "uplink_unlimited") {
      startSSE();
    }

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Window focus refetch ────────────────────────────────────────

  useEffect(() => {
    const appWindow = getCurrentWindow();
    const promise = appWindow.onFocusChanged(({ payload: focused }) => {
      if (focused && authenticatedRef.current) {
        fetchFeed();
      }
    });

    return () => {
      promise.then((unlisten) => unlisten());
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

    const resolved: "light" | "dark" =
      prefs.appearance.theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : prefs.appearance.theme as "light" | "dark";

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
      invoke("resize_window", { height: tickerH })
        .then(() => getCurrentWindow().show())
        .catch(() => {});
    }
    invoke("pin_window", { pinned }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resize ticker when row/mode prefs change ───────────────────

  useEffect(() => {
    const tickerH = tickerCollapsed
      ? 0
      : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows;
    if (tickerH > 0) {
      invoke("resize_window", { height: tickerH }).catch(() => {});
    }
  }, [
    prefs.ticker.tickerMode,
    prefs.appearance.tickerRows,
    tickerCollapsed,
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
      savePref("activeTab", channelType);
      savePref("appSection", "feed");
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
  }, [handleChannelToggle]);

  // ── Render ─────────────────────────────────────────────────────

  const showTicker = !tickerCollapsed && prefs.ticker.showTicker;

  return (
    <div id="desktop-shell">
      {showTicker &&
        Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
          <ScrollrTicker
            key={`row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.appearance.tickerRows}`}
            dashboard={dashboard}
            activeTabs={activeTabs}
            onChipClick={handleChipClick}
            speed={prefs.ticker.tickerSpeed}
            gap={TICKER_GAPS[prefs.ticker.tickerGap]}
            pauseOnHover={prefs.ticker.pauseOnHover}
            hoverSpeed={prefs.ticker.hoverSpeed}
            mixMode={prefs.ticker.mixMode}
            chipColorMode={prefs.ticker.chipColors}
            comfort={prefs.ticker.tickerMode === "comfort"}
            rowIndex={i}
            totalRows={prefs.appearance.tickerRows}
          />
        ))}
    </div>
  );
}
