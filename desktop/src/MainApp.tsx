import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";

import clsx from "clsx";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import type { Section, SettingsTab } from "./components/Sidebar";
import SettingsPanel from "./components/SettingsPanel";
import ScrollrTicker from "./components/ScrollrTicker";
import AppTaskbar from "./components/AppTaskbar";
import { getWebChannel, getAllWebChannels } from "./channels/webRegistry";
import { getChannel } from "~/channels/registry";
import {
  login as authLogin,
  logout as authLogout,
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
} from "./preferences";
import type { AppPreferences } from "./preferences";
import type { DashboardResponse, DeliveryMode } from "~/utils/types";

const API_URL = "https://api.myscrollr.relentnet.dev";

// ── Canonical channel order ─────────────────────────────────────

const CHANNEL_ORDER = ["finance", "sports", "rss", "fantasy"];

// ── Platform detection ──────────────────────────────────────────
// macOS uses native window decorations (traffic lights). Linux and
// Windows use the custom TitleBar component with JS-based drag.
// navigator.userAgentData is the modern replacement for the deprecated
// navigator.platform — fall back for older WebView engines.
const IS_MACOS =
  (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS" ||
  /Mac/.test(navigator.platform);

// ── App ─────────────────────────────────────────────────────────

export default function MainApp() {
  // Navigation
  // Guard: existing users may have "dashboard" or "account" persisted from
  // the old 5-tab layout. Fall back to "feed" for any removed section.
  const [section, setSection] = useState<Section>(() => {
    const saved = loadPref<string>("appSection", "feed");
    const valid: Section[] = ["feed", "channels", "settings"];
    return (valid as string[]).includes(saved) ? (saved as Section) : "feed";
  });
  // Guard: existing users may have "appearance" or "behavior" persisted from
  // the old settings layout. Fall back to "general" for any removed tab.
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(() => {
    const saved = loadPref<string>("settingsTab", "general");
    const valid: SettingsTab[] = ["general", "ticker", "account"];
    return (valid as string[]).includes(saved) ? (saved as SettingsTab) : "general";
  });

  // Auth state
  const [authenticated, setAuthenticated] = useState(() => checkAuth());
  const [tier, setTier] = useState<SubscriptionTier>(() =>
    checkAuth() ? getTier() : "free",
  );

  // Channel data
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activeTab, setActiveTab] = useState(
    () => loadPref("activeTab", "finance"),
  );

  // App version (read from tauri.conf.json at runtime)
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  // Preferences
  const [prefs, setPrefs] = useState<AppPreferences>(loadPrefs);
  const [autostartOn, setAutostartOn] = useState(false);

  // App window ticker + taskbar visibility
  const [showAppTicker, setShowAppTicker] = useState(
    () => loadPref("showAppTicker", true),
  );
  const [showTaskbar, setShowTaskbar] = useState(
    () => loadPref("showTaskbar", true),
  );

  // Loading / error / notification state
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Data delivery mode (synced from ticker window)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    () => loadPref<DeliveryMode>("deliveryMode", "polling"),
  );

  // Refs for stable closures
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;
  const lastFetchRef = useRef(0);

  // ── Theme & scale application ────────────────────────────────
  // Apply theme to the DOM and broadcast for cross-window sync.

  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell) return;

    const resolved = resolveTheme(prefs.appearance.theme);

    shell.classList.add("theme-transition");
    shell.dataset.theme = resolved;
    const timer = setTimeout(
      () => shell.classList.remove("theme-transition"),
      350,
    );

    // Broadcast to ticker window via localStorage
    savePref("theme", resolved);

    // Listen for OS theme changes when set to "system"
    if (prefs.appearance.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        shell.dataset.theme = e.matches ? "dark" : "light";
        savePref("theme", e.matches ? "dark" : "light");
      };
      mq.addEventListener("change", handler);
      return () => {
        clearTimeout(timer);
        mq.removeEventListener("change", handler);
      };
    }

    return () => clearTimeout(timer);
  }, [prefs.appearance.theme]);

  // Apply UI scale via CSS zoom
  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell) return;
    shell.style.zoom =
      prefs.appearance.uiScale === 100
        ? ""
        : `${prefs.appearance.uiScale}%`;
  }, [prefs.appearance.uiScale]);

  // Sync prefs + delivery mode from ticker window (StorageEvent
  // fires when the *other* window writes to localStorage)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "scrollr:settings" && e.newValue) {
        try {
          const next = JSON.parse(e.newValue) as AppPreferences;
          setPrefs(next);
        } catch {
          /* ignore malformed data */
        }
      }
      if (e.key === "scrollr:deliveryMode" && e.newValue) {
        try {
          setDeliveryMode(JSON.parse(e.newValue) as DeliveryMode);
        } catch {
          /* ignore */
        }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ── Data fetching ───────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    lastFetchRef.current = Date.now();
    try {
      setFetchError(null);
      const isAuth = authenticatedRef.current;
      let url = `${API_URL}/public/feed`;
      const headers: Record<string, string> = {};

      if (isAuth) {
        const token = await getValidToken();
        if (token) {
          url = `${API_URL}/dashboard`;
          headers["Authorization"] = `Bearer ${token}`;
        }
      }

      const res = await fetch(url, { headers });
      if (res.status === 401 && isAuth) {
        // Token expired, fall back to anonymous
        setAuthenticated(false);
        setTier("free");
        setSessionExpired(true);
        const anonRes = await fetch(`${API_URL}/public/feed`);
        if (anonRes.ok) {
          const data = await anonRes.json();
          setDashboard({ data: data.data });
          if (data.channels) setChannels(data.channels);
        }
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setDashboard({ data: data.data });
        if (data.channels) setChannels(data.channels);
      } else {
        setFetchError(`Server returned ${res.status}`);
      }
    } catch (err) {
      console.error("[Scrollr] Dashboard fetch failed:", err);
      setFetchError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when auth changes
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, authenticated]);

  // Re-fetch when window gains focus (throttled to 10s minimum gap)
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastFetchRef.current < 10_000) return;
      fetchDashboard();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboard]);

  // Check autostart on mount
  useEffect(() => {
    isAutostartEnabled().then(setAutostartOn).catch(() => {});
  }, []);

  // ── Navigation ──────────────────────────────────────────────

  const handleNavigate = useCallback((next: Section) => {
    setSection(next);
    savePref("appSection", next);
  }, []);

  const handleSettingsTab = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    savePref("settingsTab", tab);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────
  // Cmd/Ctrl+1-3: navigate sections. Escape: dismiss overlays.

  useEffect(() => {
    const SECTION_MAP: Section[] = ["feed", "channels", "settings"];
    function onKeyDown(e: KeyboardEvent) {
      const mod = IS_MACOS ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + 1-3 → navigate sections
      if (mod && e.key >= "1" && e.key <= "3") {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        handleNavigate(SECTION_MAP[idx]);
        return;
      }

      // Escape → dismiss login overlay or session banner
      if (e.key === "Escape") {
        if (loggingIn) {
          setLoggingIn(false);
          return;
        }
        if (sessionExpired) {
          setSessionExpired(false);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loggingIn, sessionExpired, handleNavigate]);

  // ── Auth handlers ───────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    setLoggingIn(true);
    try {
      const result = await authLogin();
      if (result) {
        setAuthenticated(true);
        setTier(getTier());
        fetchDashboard();
      }
    } finally {
      setLoggingIn(false);
    }
  }, [fetchDashboard]);

  const handleLogout = useCallback(async () => {
    await invoke("stop_sse").catch(() => {});
    authLogout();
    setAuthenticated(false);
    setTier("free");
    setChannels([]);
    fetchDashboard();
  }, [fetchDashboard]);

  // ── Channel handlers ────────────────────────────────────────

  const handleToggleChannel = useCallback(
    async (channelType: ChannelType, visible: boolean) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.update(
          channelType,
          { enabled: visible, visible },
          () => Promise.resolve(token),
        );
        setChannels((prev) =>
          prev.map((ch) =>
            ch.channel_type === channelType
              ? { ...ch, enabled: visible, visible }
              : ch,
          ),
        );
      } catch (err) {
        console.error("[Scrollr] Channel toggle failed:", err);
      }
    },
    [],
  );

  const handleAddChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        const created = await channelsApi.create(
          channelType,
          {},
          () => Promise.resolve(token),
        );
        setChannels((prev) => [...prev, created]);
      } catch (err) {
        console.error("[Scrollr] Channel add failed:", err);
      }
    },
    [],
  );

  const handleDeleteChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.delete(channelType, () => Promise.resolve(token));
        setChannels((prev) =>
          prev.filter((ch) => ch.channel_type !== channelType),
        );
        // Switch to first remaining channel
        setChannels((prev) => {
          if (prev.length > 0 && prev[0].channel_type !== activeTab) {
            setActiveTab(prev[0].channel_type);
          }
          return prev;
        });
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [activeTab],
  );

  const handleChannelUpdate = useCallback((updated: Channel) => {
    setChannels((prev) =>
      prev.map((ch) =>
        ch.channel_type === updated.channel_type ? updated : ch,
      ),
    );
    fetchDashboard();
  }, [fetchDashboard]);

  // ── Settings handlers ───────────────────────────────────────

  const handlePrefsChange = useCallback((next: AppPreferences) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const handleAutostartChange = useCallback(async (enabled: boolean) => {
    try {
      if (enabled) await enableAutostart();
      else await disableAutostart();
      setAutostartOn(enabled);
    } catch (err) {
      console.error("[Scrollr] Autostart toggle failed:", err);
    }
  }, []);

  // ── Stable getToken for DashboardTab components ─────────────

  const getToken = useCallback(() => getValidToken(), []);

  // ── Derived: active tabs for ticker ─────────────────────────

  const activeTabs = useMemo(
    () =>
      channels
        .filter((ch) => ch.enabled && ch.visible)
        .map((ch) => ch.channel_type),
    [channels],
  );

  // ── Ticker / taskbar toggles ────────────────────────────────

  function handleToggleAppTicker() {
    const next = !showAppTicker;
    setShowAppTicker(next);
    savePref("showAppTicker", next);
  }

  function handleToggleStandaloneTicker() {
    const next = {
      ...prefs,
      ticker: { ...prefs.ticker, showTicker: !prefs.ticker.showTicker },
    };
    setPrefs(next);
    savePrefs(next);
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div
      id="app-shell"
      data-theme="dark"
      className={clsx(
        "flex flex-col h-screen w-screen overflow-hidden bg-surface text-fg",
        !IS_MACOS && "custom-chrome",
      )}
    >
      {!IS_MACOS && <TitleBar />}

      <div className="flex flex-1 min-h-0 overflow-hidden">
      <Sidebar
        active={section}
        onNavigate={handleNavigate}
        tickerAlive={prefs.ticker.showTicker}
        settingsTab={settingsTab}
        onSettingsTabChange={handleSettingsTab}
        appVersion={appVersion}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Ticker preview (independent of standalone ticker window) */}
        {showAppTicker &&
          Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
            <ScrollrTicker
              key={`app-row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.ticker.tickerDirection}-${prefs.ticker.scrollMode}-${prefs.ticker.stepPause}-${prefs.appearance.tickerRows}`}
              dashboard={dashboard}
              activeTabs={activeTabs}
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

        {/* Taskbar */}
        {showTaskbar && (
          <AppTaskbar
            prefs={prefs}
            onPrefsChange={handlePrefsChange}
            showTicker={showAppTicker}
            onToggleTicker={handleToggleAppTicker}
            tickerAlive={prefs.ticker.showTicker}
            onToggleStandaloneTicker={handleToggleStandaloneTicker}
            deliveryMode={deliveryMode}
          />
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-edge shrink-0">
          <h1 className="text-base font-semibold capitalize">{section}</h1>
          {!authenticated && (
            <button
              onClick={handleLogin}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              Sign in
            </button>
          )}
        </header>

        {/* Session expired banner */}
        {sessionExpired && (
          <div className="flex items-center justify-between px-4 py-2 bg-warn/10 border-b border-warn/20 shrink-0">
            <span className="text-xs text-warn">
              Your session has expired. Sign in again to access your channels.
            </span>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button
                onClick={handleLogin}
                className="text-xs font-medium text-warn hover:text-fg transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => setSessionExpired(false)}
                className="text-xs text-fg-4 hover:text-fg-3 transition-colors"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {section === "feed" && (
            <FeedSection
              authenticated={authenticated}
              loading={loading}
              fetchError={fetchError}
              channels={channels}
              dashboard={dashboard}
              activeTab={activeTab}
              onActiveTabChange={(tab) => {
                setActiveTab(tab);
                savePref("activeTab", tab);
              }}
              onRetry={fetchDashboard}
              onLogin={handleLogin}
              onNavigateToChannels={() => handleNavigate("channels")}
            />
          )}

          {section === "channels" && (
            <ChannelsSection
              authenticated={authenticated}
              channels={channels}
              activeTab={activeTab}
              onActiveTabChange={(tab) => {
                setActiveTab(tab);
                savePref("activeTab", tab);
              }}
              getToken={getToken}
              tier={tier}
              deliveryMode={deliveryMode}
              onToggle={() => {
                const ch = channels.find((c) => c.channel_type === activeTab);
                if (ch) handleToggleChannel(ch.channel_type, !ch.visible);
              }}
              onAdd={handleAddChannel}
              onDelete={() => handleDeleteChannel(activeTab as ChannelType)}
              onChannelUpdate={handleChannelUpdate}
              onLogin={handleLogin}
            />
          )}

          {section === "settings" && (
            <div className="p-6">
              <SettingsPanel
                activeTab={settingsTab}
                prefs={prefs}
                onPrefsChange={handlePrefsChange}
                authenticated={authenticated}
                tier={tier}
                onLogin={handleLogin}
                onLogout={handleLogout}
                autostartEnabled={autostartOn}
                onAutostartChange={handleAutostartChange}
                showAppTicker={showAppTicker}
                onToggleAppTicker={(v) => {
                  setShowAppTicker(v);
                  savePref("showAppTicker", v);
                }}
                showTaskbar={showTaskbar}
                onToggleTaskbar={(v) => {
                  setShowTaskbar(v);
                  savePref("showTaskbar", v);
                }}
                appVersion={appVersion}
              />
            </div>
          )}


        </div>

        {/* Login overlay */}
        {loggingIn && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Signing in"
            className="absolute inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
          >
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-fg-2">
                Waiting for login...
              </p>
              <p className="text-xs text-fg-3 mt-1">
                Complete sign-in in your browser
              </p>
              <button
                onClick={() => setLoggingIn(false)}
                className="mt-4 px-4 py-1.5 rounded-lg text-xs font-medium text-fg-3 hover:text-fg-2 hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}

// ── Feed Section ─────────────────────────────────────────────────

function FeedSection({
  authenticated,
  loading,
  fetchError,
  channels,
  dashboard,
  activeTab,
  onActiveTabChange,
  onRetry,
  onLogin,
  onNavigateToChannels,
}: {
  authenticated: boolean;
  loading: boolean;
  fetchError: string | null;
  channels: Channel[];
  dashboard: DashboardResponse | null;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  onRetry: () => void;
  onLogin: () => void;
  onNavigateToChannels: () => void;
}) {
  const visibleChannels = channels.filter((ch) => ch.enabled && ch.visible);

  // Build channelConfig for the active FeedTab (same pattern as FeedBar)
  const channelConfig = useMemo(() => {
    const initialItems = dashboard?.data?.[activeTab] ?? [];
    return {
      __initialItems: initialItems,
      __dashboardLoaded: dashboard !== null,
    };
  }, [activeTab, dashboard]);

  // Look up the active channel's FeedTab component
  const channel = getChannel(activeTab);
  const FeedTabComponent = channel?.FeedTab ?? null;

  if (!authenticated) {
    return (
      <EmptyState
        title="Sign in to view your feed"
        description="Connect your account to see live data from your channels."
        action="Sign in"
        onAction={onLogin}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 motion-safe:animate-pulse">
            <div className="w-8 h-8 rounded-lg bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div
                className="h-3 rounded bg-surface-2"
                style={{ width: `${55 + (i * 17) % 35}%` }}
              />
              <div
                className="h-2 rounded bg-surface-2/60"
                style={{ width: `${30 + (i * 23) % 40}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        message={fetchError}
        onRetry={onRetry}
      />
    );
  }

  if (visibleChannels.length === 0) {
    return (
      <EmptyState
        title="No active channels"
        description="Enable some channels to see live data in your feed."
        action="Go to Channels"
        onAction={onNavigateToChannels}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Channel tabs */}
      <div role="tablist" aria-label="Feed channels" className="flex gap-1 px-4 py-2 border-b border-edge/50 shrink-0">
        {[...visibleChannels]
          .sort((a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
          )
          .map((ch) => {
            const manifest = getChannel(ch.channel_type);
            const selected = activeTab === ch.channel_type;
            return (
              <button
                key={ch.channel_type}
                role="tab"
                aria-selected={selected}
                onClick={() => onActiveTabChange(ch.channel_type)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  selected
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                )}
              >
                {manifest?.tabLabel ?? ch.channel_type}
              </button>
            );
          })}
      </div>

      {/* Feed content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {FeedTabComponent ? (
          <FeedTabComponent mode="comfort" channelConfig={channelConfig} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-fg-3 font-mono">
              No feed available for this channel
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Channels Section ─────────────────────────────────────────────
// Merged view: channel tabs + DashboardTab config + "+" add button.
// Toggle/delete handled by ChannelHeader inside each DashboardTab.

function ChannelsSection({
  authenticated,
  channels,
  activeTab,
  onActiveTabChange,
  getToken,
  tier,
  deliveryMode,
  onToggle,
  onAdd,
  onDelete,
  onChannelUpdate,
  onLogin,
}: {
  authenticated: boolean;
  channels: Channel[];
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  getToken: () => Promise<string | null>;
  tier: SubscriptionTier;
  deliveryMode: DeliveryMode;
  onToggle: () => void;
  onAdd: (channelType: ChannelType) => void;
  onDelete: () => void;
  onChannelUpdate: (updated: Channel) => void;
  onLogin: () => void;
}) {
  const [showAddMenu, setShowAddMenu] = useState(false);

  if (!authenticated) {
    return (
      <EmptyState
        title="Sign in to manage channels"
        description="Connect your account to add and configure data channels."
        action="Sign in"
        onAction={onLogin}
      />
    );
  }

  if (channels.length === 0) {
    const allManifests = getAllWebChannels();
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <EmptyState
          title="No channels yet"
          description="Add your first channel to start receiving live data."
        />
        {allManifests.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-fg-3 uppercase tracking-wider text-center">
              Available channels
            </h3>
            <div className="grid gap-2">
              {allManifests.map((manifest) => (
                <div
                  key={manifest.id}
                  className="flex items-center justify-between p-4 rounded-xl bg-surface-2/50 border border-edge/50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: manifest.hex }}
                    />
                    <div>
                      <p className="text-sm font-medium text-fg-2">
                        {manifest.name}
                      </p>
                      <p className="text-xs text-fg-3">{manifest.description}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => onAdd(manifest.id as ChannelType)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const addedTypes = new Set(channels.map((ch) => ch.channel_type));
  const allManifests = getAllWebChannels();
  const availableChannels = allManifests.filter(
    (m) => !addedTypes.has(m.id as ChannelType),
  );

  const channel = channels.find((c) => c.channel_type === activeTab);
  const webChannel = getWebChannel(activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Channel tabs + add button */}
      <div role="tablist" aria-label="Channel configuration" className="flex items-center gap-1 px-4 py-2 border-b border-edge/50 shrink-0">
        {[...channels]
          .sort((a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
          )
          .map((ch) => {
            const manifest = getWebChannel(ch.channel_type);
            const selected = activeTab === ch.channel_type;
            return (
              <button
                key={ch.channel_type}
                role="tab"
                aria-selected={selected}
                onClick={() => onActiveTabChange(ch.channel_type)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  selected
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                )}
              >
                {manifest?.tabLabel ?? ch.channel_type}
              </button>
            );
          })}

        {/* Add channel button */}
        {availableChannels.length > 0 && (
          <div className="relative ml-1">
            <button
              onClick={() => setShowAddMenu((v) => !v)}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-fg-4 hover:text-fg-2 hover:bg-surface-hover transition-colors"
              title="Add channel"
              aria-label="Add channel"
            >
              <span className="text-base leading-none">+</span>
            </button>

            {/* Dropdown */}
            {showAddMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAddMenu(false)}
                />
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-xl bg-surface-2 border border-edge shadow-lg overflow-hidden">
                  {availableChannels.map((manifest) => (
                    <button
                      key={manifest.id}
                      onClick={() => {
                        onAdd(manifest.id as ChannelType);
                        setShowAddMenu(false);
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-surface-hover transition-colors"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: manifest.hex }}
                      />
                      <div>
                        <p className="text-xs font-medium text-fg-2">
                          {manifest.name}
                        </p>
                        <p className="text-[11px] text-fg-4">{manifest.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* DashboardTab content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin dashboard-content">
        {channel && webChannel ? (
          <webChannel.DashboardTab
            channel={channel}
            getToken={getToken}
            onToggle={onToggle}
            onDelete={onDelete}
            onChannelUpdate={onChannelUpdate}
            connected={deliveryMode === "sse"}
            subscriptionTier={tier}
            hex={webChannel.hex}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-fg-3 font-mono">
              Select a channel to configure
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared error state ───────────────────────────────────────────

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center mb-1">
        <span className="text-error text-lg font-bold">!</span>
      </div>
      <h2 className="text-base font-semibold text-fg">Something went wrong</h2>
      <p className="text-sm text-fg-3 leading-relaxed">{message}</p>
      <button
        onClick={onRetry}
        className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

// ── Shared empty state ───────────────────────────────────────────

function EmptyState({
  title,
  description,
  action,
  onAction,
}: {
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <h2 className="text-base font-semibold text-fg">{title}</h2>
      <p className="text-sm text-fg-3 leading-relaxed">{description}</p>
      {action && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
        >
          {action}
        </button>
      )}
    </div>
  );
}
