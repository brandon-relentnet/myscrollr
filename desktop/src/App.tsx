import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCurrentWindow,
  currentMonitor,
  LogicalSize,
} from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  DashboardResponse,
  DeliveryMode,
} from "~/utils/types";
import FeedBar from "~/entrypoints/scrollbar.content/FeedBar";

// ── Constants ────────────────────────────────────────────────────

const API_URL = "https://api.myscrollr.relentnet.dev";
const POLL_INTERVAL_MS = 60_000;
const COLLAPSED_HEIGHT = 32;
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
  const [activeTabs] = useState<string[]>(() =>
    loadPref("activeFeedTabs", ["finance", "sports"]),
  );

  // Width state
  const [isFullWidth, setIsFullWidth] = useState(() =>
    loadPref("feedFullWidth", true),
  );
  const [customWidth, setCustomWidth] = useState(() =>
    loadPref("feedCustomWidth", DEFAULT_NARROW_WIDTH),
  );

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const isFullWidthRef = useRef(isFullWidth);
  isFullWidthRef.current = isFullWidth;
  const maxWidthBtnRef = useRef<HTMLButtonElement | null>(null);

  // ── Fetch public feed ────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/public/feed`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setDashboard({ data: data.data });
      setStatus("connected");
    } catch {
      setStatus("disconnected");
    }
  }, []);

  useEffect(() => {
    fetchFeed();
    pollRef.current = setInterval(fetchFeed, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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

    // Create divider + button matching existing header style
    const divider = document.createElement("span");
    divider.className = "h-3 w-px bg-edge";

    const btn = document.createElement("button");
    btn.className =
      "text-fg-3 hover:text-accent transition-colors text-[10px] font-mono px-0.5";
    maxWidthBtnRef.current = btn;

    // Insert: ... | [↔] | [▼]
    rightGroup.insertBefore(divider, collapseBtn);
    rightGroup.insertBefore(btn, collapseBtn);

    // Double-click header = toggle width
    const onDblClick = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement;
      if (target.closest("button, [role='tab'], a, input, select")) return;
      toggleFullWidth();
    };
    header.addEventListener("dblclick", onDblClick);

    return () => {
      divider.remove();
      btn.remove();
      maxWidthBtnRef.current = null;
      header.removeEventListener("dblclick", onDblClick);
    };
  }, [toggleFullWidth]);

  // Keep the injected button text/handler in sync with state
  useEffect(() => {
    const btn = maxWidthBtnRef.current;
    if (!btn) return;
    btn.textContent = "\u2194";
    btn.title = isFullWidth ? "Narrow window" : "Full screen width";
    btn.onclick = () => toggleFullWidth();
  }, [isFullWidth, toggleFullWidth]);

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

  // ── Collapse / expand ────────────────────────────────────────

  const handleToggleCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    savePref("feedCollapsed", next);
    const newHeight = next ? COLLAPSED_HEIGHT : height;
    invoke("resize_window", { height: newHeight }).catch(() => {});
  }, [collapsed, height]);

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
    const effectiveHeight = collapsed ? COLLAPSED_HEIGHT : height;
    invoke("resize_window", { height: effectiveHeight })
      .then(() => getCurrentWindow().show())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogin = useCallback(() => {
    // Phase 2: Logto OAuth flow
  }, []);

  const _behavior: FeedBehavior = "overlay";
  const _deliveryMode: DeliveryMode = "polling";

  return (
    <FeedBar
      dashboard={dashboard}
      connectionStatus={status}
      deliveryMode={_deliveryMode}
      position={position}
      height={height}
      mode={mode}
      collapsed={collapsed}
      behavior={_behavior}
      activeTabs={activeTabs}
      authenticated={false}
      onLogin={handleLogin}
      onToggleCollapse={handleToggleCollapse}
      onHeightChange={handleHeightChange}
      onHeightCommit={handleHeightCommit}
    />
  );
}
