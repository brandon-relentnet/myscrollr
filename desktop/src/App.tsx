import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCurrentWindow,
  currentMonitor,
  LogicalSize,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  DashboardResponse,
  DeliveryMode,
} from "~/utils/types";
import FeedBar from "~/entrypoints/scrollbar.content/FeedBar";
import ScrollrTicker from "./components/ScrollrTicker";
import {
  login as authLogin,
  logout as authLogout,
  getValidToken,
  isAuthenticated as checkAuth,
  getTier,
} from "./auth";
import type { SubscriptionTier } from "./auth";

// ── Constants ────────────────────────────────────────────────────

const API_URL = "https://api.myscrollr.relentnet.dev";
const POLL_INTERVALS: Record<SubscriptionTier, number> = {
  free: 60_000,
  uplink: 30_000,
  uplink_unlimited: 30_000, // Baseline fallback; SSE CDC handles real-time
};
const TICKER_HEIGHT = 28;
const TASKBAR_HEIGHT = 32;
const COLLAPSED_HEIGHT = TASKBAR_HEIGHT;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;
const DEFAULT_NARROW_WIDTH = 800;

// ── Local storage helpers ────────────────────────────────────────

function loadPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`scrollr:${key}`);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function savePref<T>(key: string, value: T): void {
  localStorage.setItem(`scrollr:${key}`, JSON.stringify(value));
}

// ── App ──────────────────────────────────────────────────────────

export default function App() {
  // Data state
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("polling");

  // Preference state (persisted in localStorage)
  const [position, _setPosition] = useState<FeedPosition>(() =>
    loadPref("feedPosition", "bottom" as FeedPosition),
  );
  const [height, setHeight] = useState(() => loadPref("feedHeight", 200));
  const [mode] = useState<FeedMode>(() =>
    loadPref("feedMode", "comfort" as FeedMode),
  );
  const [collapsed, setCollapsed] = useState(() =>
    loadPref("feedCollapsed", false),
  );
  const [activeTabs, setActiveTabs] = useState<string[]>(() =>
    loadPref("activeFeedTabs", ["finance", "sports"]),
  );

  // Ticker state
  const [tickerCollapsed, setTickerCollapsed] = useState(() =>
    loadPref("tickerCollapsed", false),
  );

  // Active tab — lifted so ticker clicks can switch the canvas tab
  const [activeTab, setActiveTab] = useState<string>(() =>
    loadPref("activeTab", "finance"),
  );

  // Width state
  const [isFullWidth, setIsFullWidth] = useState(() =>
    loadPref("feedFullWidth", true),
  );
  const [customWidth, setCustomWidth] = useState(() =>
    loadPref("feedCustomWidth", DEFAULT_NARROW_WIDTH),
  );

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => checkAuth());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const isFullWidthRef = useRef(isFullWidth);
  isFullWidthRef.current = isFullWidth;
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const maxWidthBtnRef = useRef<HTMLButtonElement | null>(null);
  const tickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const tierRef = useRef<SubscriptionTier>("free");
  const sseActiveRef = useRef(false);

  // ── Fetch feed data ───────────────────────────────────────────
  // When authenticated, fetch /dashboard with Bearer token.
  // When anonymous, fetch /public/feed (no auth).

  const fetchFeed = useCallback(async () => {
    try {
      let res: Response;

      if (authenticatedRef.current) {
        const token = await getValidToken();
        if (!token) {
          // Token expired and refresh failed — fall back to anonymous
          setAuthenticated(false);
          res = await fetch(`${API_URL}/public/feed`);
        } else {
          res = await fetch(`${API_URL}/dashboard`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          // If the authenticated request fails (e.g. 401), fall back
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
      setStatus("connected");

      // Sync active tabs from server channel config.
      // The /dashboard response includes a `channels` array with
      // enabled/visible flags. Derive which tabs to show from it.
      if (Array.isArray(data.channels)) {
        const visible = (data.channels as { channel_type: string; enabled: boolean; visible: boolean }[])
          .filter((ch) => ch.enabled && ch.visible)
          .map((ch) => ch.channel_type);
        setActiveTabs(visible);
        savePref("activeFeedTabs", visible);
      }
    } catch {
      setStatus("disconnected");
    }
  }, []);

  // ── Polling lifecycle ─────────────────────────────────────────
  // Starts polling at the tier-appropriate interval. Restarts
  // whenever tier changes. SSE users (uplink_unlimited) skip
  // polling while SSE is connected; if SSE disconnects, polling
  // activates as fallback.

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
  // Starts Rust-side SSE for uplink_unlimited users. Listens for
  // sse-status events to track connection state, switch delivery
  // mode, and handle auth expiry (refresh token + restart).

  const startSSE = useCallback(async () => {
    const token = await getValidToken();
    if (!token) return;
    sseActiveRef.current = true;
    setDeliveryMode("sse");
    await invoke("start_sse", { token }).catch(() => {
      // If SSE start fails, fall back to polling
      sseActiveRef.current = false;
      setDeliveryMode("polling");
      startPolling(tierRef.current);
    });
  }, [startPolling]);

  const stopSSE = useCallback(async () => {
    sseActiveRef.current = false;
    setDeliveryMode("polling");
    setStatus("disconnected");
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
            setStatus("connected");
            setDeliveryMode("sse");
            // Polling continues independently for config sync
            break;

          case "reconnecting":
            setStatus("reconnecting");
            break;

          case "disconnected":
          case "error":
            setStatus("disconnected");
            setDeliveryMode("polling");
            break;

          case "auth-expired": {
            // Token expired — refresh and restart SSE
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
  // Mirrors the extension's preferences.ts: when a `user_channels`
  // CDC record arrives via SSE, update activeTabs directly from the
  // record fields. No server round-trip needed for tab visibility.
  // Also triggers a dashboard refetch to load data for any newly-
  // enabled channels (the Go API cache is invalidated by then).

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

      // Direct tab update — instant visibility change
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
            // Channel removed, disabled, or hidden — drop the tab
            next = next.filter((t) => t !== type);
          } else if (!next.includes(type)) {
            // Channel enabled + visible — add the tab
            next.push(type);
          }
        }

        savePref("activeFeedTabs", next);
        return next;
      });

      // Refetch dashboard to get data for newly-enabled channels.
      // Brief delay lets the Go API finish cache invalidation
      // (the CDC event can arrive before the handler completes).
      setTimeout(() => fetchFeed(), 500);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [fetchFeed]);

  // Initial data fetch + delivery start
  useEffect(() => {
    const tier = authenticated ? getTier() : "free";
    tierRef.current = tier;

    // Always poll — provides config sync (channel toggles, symbol
    // changes) even when SSE handles real-time data delivery.
    startPolling(tier);

    // SSE users additionally get real-time CDC data
    if (tier === "uplink_unlimited") {
      startSSE();
    }

    return () => {
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Window focus refetch ────────────────────────────────────────
  // When the user switches from the browser (where they changed
  // settings) back to the desktop window, immediately refetch the
  // dashboard. By this point the Go API has finished processing
  // and the Redis cache is invalidated — the response is fresh.

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

  // ── Window dragging via header ───────────────────────────────

  useEffect(() => {
    const header = document.querySelector("[data-tauri-drag-region]");
    if (!header) return;

    const onMouseDown = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement;
      if (target.closest("button, [role='tab'], a, input, select")) return;
      getCurrentWindow().startDragging().catch(() => {});
    };

    header.addEventListener("mousedown", onMouseDown);
    return () => header.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Toggle full-width ↔ narrow width ──────────────────────────
  // Uses the JS window API to get the monitor size, save/restore
  // the previous width, and resize without changing height.

  const toggleFullWidth = useCallback(async () => {
    const appWindow = getCurrentWindow();
    const monitor = await currentMonitor();
    if (!monitor) return;

    const scale = monitor.scaleFactor;
    const monitorWidth = monitor.size.width / scale;
    const currentSize = await appWindow.outerSize();
    const currentHeight = currentSize.height / (window.devicePixelRatio || 1);

    if (isFullWidthRef.current) {
      // Shrink to saved custom width
      await appWindow.setSize(
        new LogicalSize(customWidth, currentHeight),
      );
      setIsFullWidth(false);
      savePref("feedFullWidth", false);
    } else {
      // Save current width, then expand to full monitor width
      const currentWidth = currentSize.width / (window.devicePixelRatio || 1);
      setCustomWidth(currentWidth);
      savePref("feedCustomWidth", currentWidth);
      await appWindow.setSize(
        new LogicalSize(monitorWidth, currentHeight),
      );
      setIsFullWidth(true);
      savePref("feedFullWidth", true);
    }
  }, [customWidth]);

  // ── Inject width-toggle button into FeedBar header ───────────
  // Adds a ↔ button to the header's right-side group, matching the
  // existing collapse button style. Also wires double-click on the
  // header as an alternate trigger (standard desktop maximize gesture).

  useEffect(() => {
    const header = document.querySelector("[data-tauri-drag-region]");
    if (!header) return;

    // Find the right-side group (last child div) and its collapse button
    const rightGroup = header.lastElementChild as HTMLElement;
    const collapseBtn = rightGroup?.querySelector("button");
    if (!rightGroup || !collapseBtn) return;

    // Create buttons matching existing header style
    const btnClass =
      "text-fg-3 hover:text-accent transition-colors text-[10px] font-mono px-0.5";
    const divClass = "h-3 w-px bg-edge";

    // Ticker toggle button
    const tickerDiv = document.createElement("span");
    tickerDiv.className = divClass;
    const tickerBtn = document.createElement("button");
    tickerBtn.className = btnClass;
    tickerBtnRef.current = tickerBtn;

    // Width toggle button
    const widthDiv = document.createElement("span");
    widthDiv.className = divClass;
    const widthBtn = document.createElement("button");
    widthBtn.className = btnClass;
    maxWidthBtnRef.current = widthBtn;

    // Insert: ... | [▦] | [↔] | [▼]
    rightGroup.insertBefore(tickerDiv, collapseBtn);
    rightGroup.insertBefore(tickerBtn, collapseBtn);
    rightGroup.insertBefore(widthDiv, collapseBtn);
    rightGroup.insertBefore(widthBtn, collapseBtn);

    // Double-click header = toggle width
    const onDblClick = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement;
      if (target.closest("button, [role='tab'], a, input, select")) return;
      toggleFullWidth();
    };
    header.addEventListener("dblclick", onDblClick);

    return () => {
      tickerDiv.remove();
      tickerBtn.remove();
      widthDiv.remove();
      widthBtn.remove();
      maxWidthBtnRef.current = null;
      tickerBtnRef.current = null;
      header.removeEventListener("dblclick", onDblClick);
    };
  }, [toggleFullWidth]);

  // ── Collapse / expand ────────────────────────────────────────

  const handleToggleCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    savePref("feedCollapsed", next);
    const tickerH = tickerCollapsed ? 0 : TICKER_HEIGHT;
    const newHeight = next ? TASKBAR_HEIGHT + tickerH : height + tickerH;
    invoke("resize_window", { height: newHeight }).catch(() => {});
  }, [collapsed, height, tickerCollapsed]);

  // ── Ticker toggle ───────────────────────────────────────────

  const handleToggleTicker = useCallback(() => {
    const next = !tickerCollapsed;
    setTickerCollapsed(next);
    savePref("tickerCollapsed", next);
  }, [tickerCollapsed]);

  // ── Ticker chip click → switch canvas tab ───────────────────

  const handleChipClick = useCallback((channelType: string, _itemId: string | number) => {
    setActiveTab(channelType);
    savePref("activeTab", channelType);
  }, []);

  const handleActiveTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    savePref("activeTab", tab);
  }, []);

  // Keep the injected buttons' text/handlers in sync with state
  useEffect(() => {
    const widthBtn = maxWidthBtnRef.current;
    if (widthBtn) {
      widthBtn.textContent = "\u2194";
      widthBtn.title = isFullWidth ? "Narrow window" : "Full screen width";
      widthBtn.onclick = () => toggleFullWidth();
    }

    const tickerBtn = tickerBtnRef.current;
    if (tickerBtn) {
      tickerBtn.textContent = tickerCollapsed ? "\u25A4" : "\u25A6";
      tickerBtn.title = tickerCollapsed ? "Show ticker" : "Hide ticker";
      tickerBtn.onclick = () => handleToggleTicker();
    }
  }, [isFullWidth, toggleFullWidth, tickerCollapsed, handleToggleTicker]);

  // ── Native compositor resize via drag handle ─────────────────
  // Intercept the drag handle mousedown to use Tauri's startResizing()
  // instead of FeedBar's built-in JS mouse tracking. This delegates
  // resize to the compositor via startResizeDragging(), which correctly
  // anchors the opposite edge (bottom stays fixed when dragging the
  // top handle upward).

  useEffect(() => {
    const handle = document.querySelector(".cursor-row-resize");
    if (!handle) return;

    const onMouseDown = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Handle is at the top edge (position=bottom), so resize from North
      const direction = position === "bottom" ? "North" : "South";
      getCurrentWindow().startResizeDragging(direction).catch(() => {});
    };

    // Use capture phase to intercept before React's event delegation
    handle.addEventListener("mousedown", onMouseDown, true);
    return () => handle.removeEventListener("mousedown", onMouseDown, true);
  }, [position]);

  // ── Sync height state from native resize events ──────────────
  // When the compositor finishes resizing, read the new window size
  // and update our height state + persist to localStorage.

  useEffect(() => {
    const appWindow = getCurrentWindow();
    let saveTimer: ReturnType<typeof setTimeout> | null = null;

    const promise = appWindow.onResized((event) => {
      // Ignore resize events while collapsed (programmatic collapse)
      if (collapsedRef.current) return;

      const scale = window.devicePixelRatio || 1;
      const logicalHeight = Math.round(event.payload.height / scale);

      // Clamp to valid range and ignore tiny/collapsed sizes
      if (logicalHeight >= MIN_HEIGHT && logicalHeight <= MAX_HEIGHT) {
        setHeight(logicalHeight);

        // Debounce the save to avoid writing on every frame during drag
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          savePref("feedHeight", logicalHeight);
        }, 200);
      }
    });

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      promise.then((unlisten) => unlisten());
    };
  }, []);

  // ── FeedBar height callbacks ─────────────────────────────────
  // These are still passed to FeedBar for API compatibility, but
  // the native resize handler above drives the actual behavior.
  // FeedBar's built-in drag logic is intercepted and never fires.

  const handleHeightChange = useCallback((_h: number) => {
    // No-op: native resize handles this
  }, []);

  const handleHeightCommit = useCallback((_h: number) => {
    // No-op: native resize handles this
  }, []);

  // ── Initial setup ────────────────────────────────────────────

  useEffect(() => {
    const tickerH = tickerCollapsed ? 0 : TICKER_HEIGHT;
    const effectiveHeight = collapsed
      ? TASKBAR_HEIGHT + tickerH
      : height + tickerH;
    invoke("resize_window", { height: effectiveHeight })
      .then(() => getCurrentWindow().show())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auth handlers ─────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    const result = await authLogin();
    if (result) {
      setAuthenticated(true);

      // Determine tier from the new JWT and start appropriate delivery
      const tier = getTier();
      tierRef.current = tier;

      // Restart polling at the new tier's interval
      stopPolling();
      await fetchFeed();
      startPolling(tier);

      // SSE users additionally get real-time CDC data
      if (tier === "uplink_unlimited") {
        await startSSE();
      }
    }
  }, [fetchFeed, startSSE, startPolling, stopPolling]);

  const handleLogout = useCallback(async () => {
    // Tear down SSE if running
    if (sseActiveRef.current) {
      await stopSSE();
    }
    stopPolling();

    authLogout();
    setAuthenticated(false);
    tierRef.current = "free";

    // Restart as anonymous (free tier polling)
    startPolling("free");
  }, [startPolling, stopPolling, stopSSE]);

  const _behavior: FeedBehavior = "overlay";

  return (
    <div id="desktop-shell">
      {!tickerCollapsed && (
        <ScrollrTicker
          dashboard={dashboard}
          activeTabs={activeTabs}
          onChipClick={handleChipClick}
        />
      )}
      <FeedBar
        dashboard={dashboard}
        connectionStatus={status}
        deliveryMode={deliveryMode}
        position={position}
        height={height}
        mode={mode}
        collapsed={collapsed}
        behavior={_behavior}
        activeTabs={activeTabs}
        authenticated={authenticated}
        activeTab={activeTab}
        onActiveTabChange={handleActiveTabChange}
        onLogin={handleLogin}
        onToggleCollapse={handleToggleCollapse}
        onHeightChange={handleHeightChange}
        onHeightCommit={handleHeightCommit}
      />
    </div>
  );
}
