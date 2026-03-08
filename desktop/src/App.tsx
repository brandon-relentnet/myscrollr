import { useState, useEffect, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
const POLL_INTERVAL_MS = 60_000; // 60s for anonymous polling

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

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // ── Window dragging via Tauri JS API ─────────────────────────
  // data-tauri-drag-region is unreliable on Wayland/webkit2gtk.
  // Instead, listen for mousedown on the header and call startDragging().
  useEffect(() => {
    const header = document.querySelector("[data-tauri-drag-region]");
    if (!header) return;

    const onMouseDown = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // Don't drag if clicking on interactive children (buttons, tabs)
      const target = mouseEvent.target as HTMLElement;
      if (target.closest("button, [role='tab'], a, input, select")) return;

      getCurrentWindow().startDragging().catch(() => {});
    };

    header.addEventListener("mousedown", onMouseDown);
    return () => header.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Window resize ────────────────────────────────────────────
  // Resize the Tauri window to match the FeedBar height.

  const handleHeightChange = useCallback((h: number) => {
    setHeight(h);
    invoke("resize_window", { height: h }).catch(() => {});
  }, []);

  const handleHeightCommit = useCallback((h: number) => {
    savePref("feedHeight", h);
    invoke("resize_window", { height: h }).catch(() => {});
  }, []);

  const handleToggleCollapse = useCallback(() => {
    const next = !collapsed;
    setCollapsed(next);
    savePref("feedCollapsed", next);
    const newHeight = next ? 32 : height;
    invoke("resize_window", { height: newHeight }).catch(() => {});
  }, [collapsed, height]);

  // Sync Tauri window size on mount
  useEffect(() => {
    const effectiveHeight = collapsed ? 32 : height;
    invoke("resize_window", { height: effectiveHeight }).catch(() => {});
  }, [collapsed, height]);

  // Show the window once mounted
  useEffect(() => {
    getCurrentWindow().show().catch(() => {});
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
