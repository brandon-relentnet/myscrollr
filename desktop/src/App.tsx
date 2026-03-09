import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { getWebChannel } from "./channels/webRegistry";
import { getValidToken as authGetValidToken } from "./auth";
import {
  login as authLogin,
  logout as authLogout,
  getValidToken,
  isAuthenticated as checkAuth,
  getTier,
} from "./auth";
import type { SubscriptionTier } from "./auth";
import type { Channel } from "./api/client";
import { channelsApi } from "./api/client";
import ChannelPicker from "./components/ChannelPicker";
import AppMenu from "./components/AppMenu";
import SettingsPanel from "./components/SettingsPanel";
import {
  loadPrefs,
  savePrefs,
  TASKBAR_HEIGHTS,
  TICKER_GAPS,
  TICKER_HEIGHTS,
} from "./preferences";
import type { AppPreferences } from "./preferences";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

// ── Canvas mode type ─────────────────────────────────────────────

type CanvasMode = "feed" | "dashboard" | "settings";

// ── Constants ────────────────────────────────────────────────────

const API_URL = "https://api.myscrollr.relentnet.dev";
const POLL_INTERVALS: Record<SubscriptionTier, number> = {
  free: 60_000,
  uplink: 30_000,
  uplink_unlimited: 30_000, // Baseline fallback; SSE CDC handles real-time
};
const TASKBAR_HEIGHT = 36;
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
  const [activeTabs, setActiveTabs] = useState<string[]>(() =>
    loadPref("activeFeedTabs", ["finance", "sports"]),
  );

  // Channel config state (from dashboard response, for DashboardTab)
  const [channels, setChannels] = useState<Channel[]>([]);

  // Canvas mode: "feed" shows FeedTab, "dashboard" shows DashboardTab
  const [canvasMode, setCanvasMode] = useState<CanvasMode>(() =>
    loadPref("canvasMode", "feed" as CanvasMode),
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

  // Pin (always-on-top) state
  const [pinned, setPinned] = useState(() => loadPref("feedPinned", true));

  // Channel picker dropdown
  const [showChannelPicker, setShowChannelPicker] = useState(false);

  // App menu dropdown
  const [showMenu, setShowMenu] = useState(false);

  // Settings preferences
  const [prefs, setPrefs] = useState<AppPreferences>(loadPrefs);
  const [autostartOn, setAutostartOn] = useState(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => checkAuth());

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFullWidthRef = useRef(isFullWidth);
  isFullWidthRef.current = isFullWidth;
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const maxWidthBtnRef = useRef<HTMLButtonElement | null>(null);
  const tickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const feedBtnRef = useRef<HTMLButtonElement | null>(null);
  const dashBtnRef = useRef<HTMLButtonElement | null>(null);
  const pinBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const pinnedContainerRef = useRef<HTMLElement | null>(null);
  const logoChevronRef = useRef<SVGSVGElement | null>(null);
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

      // Store full channels array for DashboardTab rendering
      if (Array.isArray(data.channels)) {
        const channelList = data.channels as Channel[];
        setChannels(channelList);

        // Sync active tabs from server channel config.
        // The /dashboard response includes a `channels` array with
        // enabled/visible flags. Derive which tabs to show from it.
        const visible = channelList
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

  // ── Inject buttons into FeedBar header ─────────────────────────
  // Left group: channel picker (+) button after the tab strip.
  // Right group: FEED|DASH pill, ticker toggle, width toggle.
  // Also wires double-click on the header as width toggle.

  useEffect(() => {
    const header = document.querySelector("[data-tauri-drag-region]");
    if (!header) return;

    // Find the left-side group (first child div) and right-side group
    const leftGroup = header.firstElementChild as HTMLElement;
    const rightGroup = header.lastElementChild as HTMLElement;
    if (!leftGroup || !rightGroup) return;

    // Create buttons matching existing header style
    const btnClass =
      "text-fg-3 hover:text-accent transition-colors text-[13px] font-mono px-1 cursor-pointer";
    const divClass = "h-4 w-px bg-edge";

    // Wrap the "scrollr" logo span in a clickable button with a chevron icon.
    // Clicking anywhere on the logo or icon toggles the channel picker.
    const logoSpan = leftGroup.firstElementChild as HTMLElement;
    const logoBtn = document.createElement("button");
    logoBtn.className =
      "flex items-center gap-1 cursor-pointer group";
    logoBtn.title = "Toggle channels";
    logoBtn.setAttribute("data-channel-picker-trigger", "");
    logoBtn.onclick = () => setShowChannelPicker((prev) => !prev);
    // Move the original span inside the button
    leftGroup.insertBefore(logoBtn, logoSpan);
    logoBtn.appendChild(logoSpan);
    // Add chevron-up SVG icon (lucide ChevronUp, 14x14)
    const chevronSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    chevronSvg.setAttribute("width", "14");
    chevronSvg.setAttribute("height", "14");
    chevronSvg.setAttribute("viewBox", "0 0 24 24");
    chevronSvg.setAttribute("fill", "none");
    chevronSvg.setAttribute("stroke", "currentColor");
    chevronSvg.setAttribute("stroke-width", "2");
    chevronSvg.setAttribute("stroke-linecap", "round");
    chevronSvg.setAttribute("stroke-linejoin", "round");
    chevronSvg.setAttribute("class", "text-fg-4 group-hover:text-accent transition-all duration-200");
    chevronSvg.style.transform = showChannelPicker ? "rotate(180deg)" : "rotate(0deg)";
    const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    chevronPath.setAttribute("d", "m18 15-6-6-6 6");
    chevronSvg.appendChild(chevronPath);
    logoBtn.appendChild(chevronSvg);
    logoChevronRef.current = chevronSvg;

    // Canvas mode toggle: segmented pill [FEED|DASH]
    // Wrapped in a container with a subtle bg so it reads as a control
    const canvasPill = document.createElement("span");
    canvasPill.className =
      "inline-flex items-center rounded bg-surface-2 border border-edge overflow-hidden";
    const feedBtn = document.createElement("button");
    feedBtnRef.current = feedBtn;
    const dashBtn = document.createElement("button");
    dashBtnRef.current = dashBtn;
    canvasPill.appendChild(feedBtn);
    canvasPill.appendChild(dashBtn);

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

    // Pin (always-on-top) button
    const pinDiv = document.createElement("span");
    pinDiv.className = divClass;
    const pinBtn = document.createElement("button");
    pinBtn.className = btnClass;
    pinBtnRef.current = pinBtn;

    // Pinned quick-action buttons container
    const pinnedContainer = document.createElement("span");
    pinnedContainer.className = "inline-flex items-center";
    pinnedContainer.setAttribute("data-pinned-actions", "");
    pinnedContainerRef.current = pinnedContainer;

    // Menu (three-dot) button
    const menuDiv = document.createElement("span");
    menuDiv.className = divClass;
    const menuBtn = document.createElement("button");
    menuBtn.className = btnClass;
    menuBtn.textContent = "\u22EE";
    menuBtn.title = "Menu";
    menuBtn.setAttribute("data-app-menu-trigger", "");
    menuBtn.onclick = () => setShowMenu((prev) => !prev);
    menuBtnRef.current = menuBtn;

    // Insert: ... | [FEED|DASH] | [▦] | [↔] | [📌] | [pinned actions] | [⋮]
    rightGroup.appendChild(canvasPill);
    rightGroup.appendChild(tickerDiv);
    rightGroup.appendChild(tickerBtn);
    rightGroup.appendChild(widthDiv);
    rightGroup.appendChild(widthBtn);
    rightGroup.appendChild(pinDiv);
    rightGroup.appendChild(pinBtn);
    rightGroup.appendChild(pinnedContainer);
    rightGroup.appendChild(menuDiv);
    rightGroup.appendChild(menuBtn);

    // Double-click header = toggle width
    const onDblClick = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement;
      if (target.closest("button, [role='tab'], a, input, select")) return;
      toggleFullWidth();
    };
    header.addEventListener("dblclick", onDblClick);

    return () => {
      // Restore the logo span back to the left group before removing the button
      if (logoBtn.contains(logoSpan)) {
        leftGroup.insertBefore(logoSpan, logoBtn);
      }
      logoBtn.remove();
      canvasPill.remove();
      tickerDiv.remove();
      tickerBtn.remove();
      widthDiv.remove();
      widthBtn.remove();
      pinDiv.remove();
      pinBtn.remove();
      pinnedContainer.remove();
      menuDiv.remove();
      menuBtn.remove();
      feedBtnRef.current = null;
      dashBtnRef.current = null;
      maxWidthBtnRef.current = null;
      tickerBtnRef.current = null;
      pinBtnRef.current = null;
      pinnedContainerRef.current = null;
      menuBtnRef.current = null;
      logoChevronRef.current = null;
      header.removeEventListener("dblclick", onDblClick);
    };
  }, [toggleFullWidth]);

  // ── Ticker toggle ───────────────────────────────────────────

  const handleToggleTicker = useCallback(() => {
    const next = !tickerCollapsed;
    setTickerCollapsed(next);
    savePref("tickerCollapsed", next);
    // Keep settings pref in sync
    setPrefs((prev) => {
      const updated = { ...prev, ticker: { ...prev.ticker, showTicker: !next } };
      savePrefs(updated);
      return updated;
    });
  }, [tickerCollapsed]);

  // ── Ticker chip click → switch canvas tab ───────────────────

  const handleChipClick = useCallback((channelType: string, _itemId: string | number) => {
    setActiveTab(channelType);
    savePref("activeTab", channelType);
  }, []);

  // Track the canvas mode before entering settings so we can restore it
  const prevCanvasModeRef = useRef<"feed" | "dashboard">("feed");

  const handleActiveTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    savePref("activeTab", tab);
    // Exit settings when a channel tab is clicked
    setCanvasMode((prev) => {
      if (prev === "settings") {
        const restore = prevCanvasModeRef.current;
        savePref("canvasMode", restore);
        return restore;
      }
      return prev;
    });
  }, []);

  // ── Pin (always-on-top) toggle ────────────────────────────────
  // Uses compositor-specific IPC (Hyprland/Sway) instead of
  // GTK's set_keep_above which is silently ignored on Wayland.

  const handleTogglePin = useCallback(() => {
    const next = !pinned;
    setPinned(next);
    savePref("feedPinned", next);
    invoke("pin_window", { pinned: next }).catch((err) => {
      console.error("[Scrollr] Pin toggle failed:", err);
    });
  }, [pinned]);

  // ── Settings ─────────────────────────────────────────────────

  const handleOpenSettings = useCallback(() => {
    setCanvasMode((prev) => {
      if (prev !== "settings") prevCanvasModeRef.current = prev as "feed" | "dashboard";
      return "settings";
    });
    savePref("canvasMode", "settings");
  }, []);

  const handleCloseSettings = useCallback(() => {
    const restore = prevCanvasModeRef.current;
    setCanvasMode(restore);
    savePref("canvasMode", restore);
  }, []);

  const handleQuit = useCallback(() => {
    getCurrentWindow().close();
  }, []);

  const handlePrefsChange = useCallback((next: AppPreferences) => {
    setPrefs(next);
    // Sync window prefs that have side effects
    if (next.window.pinned !== prefsRef.current.window.pinned) {
      setPinned(next.window.pinned);
      savePref("feedPinned", next.window.pinned);
      invoke("pin_window", { pinned: next.window.pinned }).catch(() => {});
    }
    // Sync ticker visibility
    if (!next.ticker.showTicker !== tickerCollapsed) {
      setTickerCollapsed(!next.ticker.showTicker);
      savePref("tickerCollapsed", !next.ticker.showTicker);
    }
  }, [tickerCollapsed]);

  const handleAutostartChange = useCallback((enabled: boolean) => {
    setAutostartOn(enabled);
    if (enabled) {
      enableAutostart().catch((err) => {
        console.error("[Scrollr] Enable autostart failed:", err);
        setAutostartOn(false);
      });
    } else {
      disableAutostart().catch((err) => {
        console.error("[Scrollr] Disable autostart failed:", err);
        setAutostartOn(true);
      });
    }
  }, []);

  // ── Canvas mode toggle ──────────────────────────────────────────

  const handleCanvasModeChange = useCallback((mode: CanvasMode) => {
    setCanvasMode(mode);
    savePref("canvasMode", mode);
  }, []);

  // Keep the injected buttons' text/handlers in sync with state
  useEffect(() => {
    const btnClass =
      "text-fg-3 hover:text-accent transition-colors text-[13px] font-mono px-1 cursor-pointer";

    // Segmented pill styles for FEED / DASH toggle
    const segBase =
      "px-2.5 py-1 text-[11px] font-mono font-semibold uppercase tracking-widest transition-colors leading-none cursor-pointer";
    const segActive = `${segBase} bg-accent/15 text-accent`;
    const segInactive = `${segBase} text-fg-3 hover:text-fg-2`;

    // Canvas mode toggle pill — only visible when authenticated
    const feedBtn = feedBtnRef.current;
    const dashBtn = dashBtnRef.current;
    const canvasPill = feedBtn?.parentElement;

    if (feedBtn) {
      feedBtn.textContent = "FEED";
      feedBtn.title = "Show live feed";
      feedBtn.className = canvasMode === "feed" ? segActive : segInactive;
      feedBtn.onclick = () => handleCanvasModeChange("feed");
    }
    if (dashBtn) {
      dashBtn.textContent = "DASH";
      dashBtn.title = "Show dashboard config";
      dashBtn.className = canvasMode === "dashboard" ? segActive : segInactive;
      dashBtn.onclick = () => handleCanvasModeChange("dashboard");
    }
    // Hide the whole pill + preceding divider when not authenticated or toggled off
    const showPill = authenticated && prefs.taskbar.showCanvasToggle;
    if (canvasPill) {
      canvasPill.style.display = showPill ? "" : "none";
      const prevDiv = canvasPill.previousElementSibling;
      if (prevDiv && (prevDiv as HTMLElement).className.includes("bg-edge")) {
        (prevDiv as HTMLElement).style.display = showPill ? "" : "none";
      }
    }

    // Helper to show/hide a button + its preceding divider
    const setVisible = (btn: HTMLElement | null, visible: boolean) => {
      if (!btn) return;
      btn.style.display = visible ? "" : "none";
      const prevSibling = btn.previousElementSibling;
      if (prevSibling && (prevSibling as HTMLElement).classList.contains("w-px")) {
        (prevSibling as HTMLElement).style.display = visible ? "" : "none";
      }
    };

    const widthBtn = maxWidthBtnRef.current;
    if (widthBtn) {
      widthBtn.textContent = "\u2194";
      widthBtn.title = isFullWidth ? "Narrow window" : "Full screen width";
      widthBtn.onclick = () => toggleFullWidth();
    }
    setVisible(widthBtn, prefs.taskbar.showWidthToggle);

    const tickerBtn = tickerBtnRef.current;
    if (tickerBtn) {
      tickerBtn.textContent = tickerCollapsed ? "\u25A4" : "\u25A6";
      tickerBtn.title = tickerCollapsed ? "Show ticker" : "Hide ticker";
      tickerBtn.onclick = () => handleToggleTicker();
    }
    setVisible(tickerBtn, prefs.taskbar.showTickerToggle);

    const pinBtn = pinBtnRef.current;
    if (pinBtn) {
      pinBtn.textContent = pinned ? "\u25A3" : "\u25A2";
      pinBtn.title = pinned ? "Unpin (disable always-on-top)" : "Pin (always-on-top)";
      pinBtn.className = pinned
        ? "text-accent transition-colors text-[13px] font-mono px-1 cursor-pointer"
        : btnClass;
      pinBtn.onclick = () => handleTogglePin();
    }
    setVisible(pinBtn, prefs.taskbar.showPinButton);

    // Menu button — highlight when settings view is active
    const menuBtn = menuBtnRef.current;
    if (menuBtn) {
      menuBtn.className = canvasMode === "settings"
        ? "text-accent transition-colors text-[13px] font-mono px-1 cursor-pointer"
        : btnClass;
    }

    // Rotate logo chevron to reflect picker open/closed state
    const chevron = logoChevronRef.current;
    if (chevron) {
      chevron.style.transform = showChannelPicker ? "rotate(180deg)" : "rotate(0deg)";
    }

    // Apply taskbar height
    const header = document.querySelector("#desktop-shell [data-tauri-drag-region]") as HTMLElement | null;
    if (header) {
      header.style.setProperty("height", `${TASKBAR_HEIGHTS[prefs.taskbar.taskbarHeight]}px`, "important");
    }

    // Apply connection indicator visibility
    const connIndicator = document.querySelector("#desktop-shell [data-tauri-drag-region] .tracking-widest")?.parentElement as HTMLElement | null;
    if (connIndicator) {
      connIndicator.style.display = prefs.taskbar.showConnectionIndicator ? "" : "none";
    }

    // Apply channel icon visibility via data attribute
    const shell = document.getElementById("desktop-shell");
    if (shell) {
      shell.dataset.channelIcons = prefs.taskbar.showChannelIcons ? "on" : "off";
    }

    // ── Pinned quick-action buttons ────────────────────────────
    // Render inline icon buttons for each pinned action ID.
    const pinnedEl = pinnedContainerRef.current;
    if (pinnedEl) {
      pinnedEl.innerHTML = "";
      const actions = prefs.taskbar.pinnedActions;

      if (actions.length > 0) {
        // Leading divider
        const div = document.createElement("span");
        div.className = "h-4 w-px bg-edge mx-0.5";
        pinnedEl.appendChild(div);
      }

      for (const actionId of actions) {
        const btn = document.createElement("button");
        btn.className = btnClass;
        btn.style.fontSize = "12px";

        switch (actionId) {
          case "theme": {
            const isDark = prefs.appearance.theme === "dark" ||
              (prefs.appearance.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            btn.textContent = isDark ? "\u263E" : "\u2600";
            btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
            btn.onclick = () => {
              const next = isDark ? "light" : "dark";
              const updated = { ...prefsRef.current, appearance: { ...prefsRef.current.appearance, theme: next as "light" | "dark" } };
              setPrefs(updated);
              savePrefs(updated);
            };
            break;
          }
          case "tickerRows": {
            const rows = prefs.appearance.tickerRows;
            btn.textContent = rows === 1 ? "\u2630" : rows === 2 ? "\u2633" : "\u2637";
            btn.title = `Ticker: ${rows} row${rows > 1 ? "s" : ""} (click to cycle)`;
            btn.onclick = () => {
              const nextRows = (rows % 3 + 1) as 1 | 2 | 3;
              const updated = { ...prefsRef.current, appearance: { ...prefsRef.current.appearance, tickerRows: nextRows } };
              setPrefs(updated);
              savePrefs(updated);
            };
            break;
          }
          case "showTicker": {
            btn.textContent = prefs.ticker.showTicker ? "\u25A6" : "\u25A4";
            btn.title = prefs.ticker.showTicker ? "Hide ticker" : "Show ticker";
            btn.onclick = () => {
              const updated = { ...prefsRef.current, ticker: { ...prefsRef.current.ticker, showTicker: !prefsRef.current.ticker.showTicker } };
              setPrefs(updated);
              savePrefs(updated);
              setTickerCollapsed(prefsRef.current.ticker.showTicker);
              savePref("tickerCollapsed", prefsRef.current.ticker.showTicker);
            };
            break;
          }
          case "tickerMode": {
            const isComfort = prefs.ticker.tickerMode === "comfort";
            btn.textContent = isComfort ? "\u2261" : "\u2630";
            btn.title = isComfort ? "Switch to compact ticker" : "Switch to comfort ticker";
            btn.onclick = () => {
              const nextMode = isComfort ? "compact" : "comfort";
              const updated = { ...prefsRef.current, ticker: { ...prefsRef.current.ticker, tickerMode: nextMode as "compact" | "comfort" } };
              setPrefs(updated);
              savePrefs(updated);
            };
            break;
          }
          case "pinned": {
            btn.textContent = pinned ? "\u25A3" : "\u25A2";
            btn.title = pinned ? "Unpin window" : "Pin window on top";
            if (pinned) btn.className = "text-accent transition-colors text-[12px] font-mono px-1 cursor-pointer";
            btn.onclick = () => handleTogglePin();
            break;
          }
        }

        pinnedEl.appendChild(btn);
      }
    }
  }, [isFullWidth, toggleFullWidth, tickerCollapsed, handleToggleTicker, canvasMode, handleCanvasModeChange, authenticated, pinned, handleTogglePin, showChannelPicker, prefs.taskbar, prefs.appearance, prefs.ticker]);

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
    const tickerH = tickerCollapsed ? 0 : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows;
    const effectiveHeight = height + tickerH;
    invoke("resize_window", { height: effectiveHeight })
      .then(() => getCurrentWindow().show())
      .catch(() => {});
    // Sync pinned state via compositor IPC — tauri.conf.json defaults
    // to alwaysOnTop: true, but the user may have unpinned previously.
    invoke("pin_window", { pinned }).catch(() => {});
    // Check autostart state
    isAutostartEnabled()
      .then((enabled) => setAutostartOn(enabled))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Theme & scale application ────────────────────────────────
  // Apply theme class and UI scale whenever appearance prefs change.

  useEffect(() => {
    const shell = document.getElementById("desktop-shell");
    if (!shell) return;

    // Resolve theme: "system" follows OS preference
    let resolved: "light" | "dark" = prefs.appearance.theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : prefs.appearance.theme;

    // Add transition class for smooth theme switch
    shell.classList.add("theme-transition");
    shell.dataset.theme = resolved;
    const timer = setTimeout(() => shell.classList.remove("theme-transition"), 350);

    // Listen for OS theme changes when set to "system"
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

  useEffect(() => {
    const shell = document.getElementById("desktop-shell");
    if (!shell) return;
    // Apply UI scale via CSS zoom (simpler than transform, works with layout)
    shell.style.zoom = prefs.appearance.uiScale === 100 ? "" : `${prefs.appearance.uiScale}%`;
  }, [prefs.appearance.uiScale]);

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

  // ── Channel picker toggle ───────────────────────────────────────

  const handlePickerToggle = useCallback(
    async (channelType: string, visible: boolean) => {
      try {
        await channelsApi.update(
          channelType as Channel["channel_type"],
          { visible },
          () => getValidToken(),
        );
        // Optimistic update for instant UI feedback
        setActiveTabs((prev) => {
          const next = visible
            ? [...prev, channelType]
            : prev.filter((t) => t !== channelType);
          savePref("activeFeedTabs", next);
          return next;
        });
        // Full refetch to sync everything
        fetchFeed();
      } catch (err) {
        console.error("[Scrollr] Channel toggle failed:", err);
      }
    },
    [fetchFeed],
  );

  // ── DashboardTab handlers ───────────────────────────────────────

  const handleToggleChannel = useCallback(async () => {
    const ch = channels.find((c) => c.channel_type === activeTab);
    if (!ch) return;

    try {
      await channelsApi.update(
        ch.channel_type,
        { visible: !ch.visible },
        () => getValidToken(),
      );
      fetchFeed();
    } catch (err) {
      console.error("[Scrollr] Toggle channel failed:", err);
    }
  }, [channels, activeTab, fetchFeed]);

  const handleDeleteChannel = useCallback(async () => {
    const ch = channels.find((c) => c.channel_type === activeTab);
    if (!ch) return;

    try {
      await channelsApi.delete(ch.channel_type, () => getValidToken());
      setCanvasMode("feed");
      savePref("canvasMode", "feed");
      fetchFeed();
    } catch (err) {
      console.error("[Scrollr] Delete channel failed:", err);
    }
  }, [channels, activeTab, fetchFeed]);

  const handleChannelUpdate = useCallback(
    (updated: Channel) => {
      setChannels((prev) =>
        prev.map((ch) =>
          ch.channel_type === updated.channel_type ? updated : ch,
        ),
      );
      // Also refetch to sync everything
      fetchFeed();
    },
    [fetchFeed],
  );

  // ── Token getter for DashboardTab props ─────────────────────────

  const getToken = useCallback(async (): Promise<string | null> => {
    return authGetValidToken();
  }, []);

  // ── Build overrideContent for DashboardTab / Settings mode ─────

  const overrideContent = useMemo(() => {
    if (canvasMode === "settings") {
      return (
        <SettingsPanel
          prefs={prefs}
          onPrefsChange={handlePrefsChange}
          authenticated={authenticated}
          tier={getTier()}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onClose={handleCloseSettings}
          autostartEnabled={autostartOn}
          onAutostartChange={handleAutostartChange}
        />
      );
    }

    if (canvasMode !== "dashboard" || !authenticated) return undefined;

    const webChannel = getWebChannel(activeTab);
    if (!webChannel) {
      return (
        <div className="text-center py-8 text-fg-3 text-xs font-mono">
          No dashboard available for this channel
        </div>
      );
    }

    const channel = channels.find((c) => c.channel_type === activeTab);
    if (!channel) {
      return (
        <div className="text-center py-8 text-fg-3 text-xs font-mono">
          Channel not configured — switch to feed view
        </div>
      );
    }

    const DashboardTab = webChannel.DashboardTab;
    const tier = getTier();
    const isConnected = status === "connected" && deliveryMode === "sse";

    return (
      <div className="dashboard-content max-w-4xl mx-auto py-6 px-6">
        <DashboardTab
          channel={channel}
          getToken={getToken}
          onToggle={handleToggleChannel}
          onDelete={handleDeleteChannel}
          onChannelUpdate={handleChannelUpdate}
          connected={isConnected}
          subscriptionTier={tier}
          hex={webChannel.hex}
        />
      </div>
    );
  }, [
    canvasMode,
    authenticated,
    activeTab,
    channels,
    status,
    deliveryMode,
    getToken,
    handleToggleChannel,
    handleDeleteChannel,
    handleChannelUpdate,
    pinned,
    handleLogin,
    handleLogout,
    handleCloseSettings,
    prefs,
    handlePrefsChange,
    autostartOn,
    handleAutostartChange,
  ]);

  const _behavior: FeedBehavior = "overlay";

  return (
    <div id="desktop-shell">
      {!tickerCollapsed && prefs.ticker.showTicker &&
        Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
          <ScrollrTicker
            key={`row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.appearance.tickerRows}`}
            dashboard={dashboard}
            activeTabs={activeTabs}
            onChipClick={handleChipClick}
            speed={prefs.ticker.tickerSpeed}
            gap={TICKER_GAPS[prefs.ticker.tickerGap]}
            pauseOnHover={prefs.ticker.pauseOnHover}
            hoverSpeed={prefs.ticker.hoverSpeed}
            comfort={prefs.ticker.tickerMode === "comfort"}
            rowIndex={i}
            totalRows={prefs.appearance.tickerRows}
          />
        ))
      }
      {showChannelPicker && authenticated && (
        <ChannelPicker
          channels={channels}
          activeTabs={activeTabs}
          onToggle={handlePickerToggle}
          onClose={() => setShowChannelPicker(false)}
          topOffset={(tickerCollapsed || !prefs.ticker.showTicker ? 0 : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows) + TASKBAR_HEIGHTS[prefs.taskbar.taskbarHeight] + 2}
        />
      )}
      {showMenu && (
        <AppMenu
          onSettings={handleOpenSettings}
          onQuit={handleQuit}
          onClose={() => setShowMenu(false)}
          topOffset={(tickerCollapsed || !prefs.ticker.showTicker ? 0 : TICKER_HEIGHTS[prefs.ticker.tickerMode] * prefs.appearance.tickerRows) + TASKBAR_HEIGHTS[prefs.taskbar.taskbarHeight] + 2}
        />
      )}
      <FeedBar
        dashboard={dashboard}
        connectionStatus={status}
        deliveryMode={deliveryMode}
        position={position}
        height={height}
        mode={mode}
        behavior={_behavior}
        activeTabs={activeTabs}
        authenticated={authenticated}
        activeTab={activeTab}
        onActiveTabChange={handleActiveTabChange}
        onLogin={handleLogin}
        onHeightChange={handleHeightChange}
        onHeightCommit={handleHeightCommit}
        overrideContent={overrideContent}
      />
    </div>
  );
}
