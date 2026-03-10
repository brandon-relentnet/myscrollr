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
import { TIER_LABELS } from "./auth";
import type { SubscriptionTier } from "./auth";
import type { Channel, ChannelType } from "./api/client";
import { channelsApi } from "./api/client";
import {
  loadPref,
  savePref,
  loadPrefs,
  savePrefs,
  TICKER_GAPS,
} from "./preferences";
import type { AppPreferences } from "./preferences";
import type { FeedMode, DashboardResponse, DeliveryMode } from "~/utils/types";

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
  const [section, setSection] = useState<Section>(
    () => loadPref<Section>("appSection", "feed"),
  );
  const [settingsTab, setSettingsTab] = useState<SettingsTab>(
    () => loadPref<SettingsTab>("settingsTab", "appearance"),
  );

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
  const [feedMode] = useState<FeedMode>(
    () => loadPref<FeedMode>("feedMode", "comfort"),
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

  // Loading state
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);

  // Data delivery mode (synced from ticker window)
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(
    () => loadPref<DeliveryMode>("deliveryMode", "polling"),
  );

  // Refs for stable closures
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  // ── Theme & scale application ────────────────────────────────
  // Apply theme to the DOM and broadcast for cross-window sync.

  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell) return;

    // Resolve theme: "system" follows OS preference
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
    try {
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
      }
    } catch (err) {
      console.error("[Scrollr] Dashboard fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount and when auth changes
  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, authenticated]);

  // Re-fetch when window gains focus
  useEffect(() => {
    function onFocus() {
      fetchDashboard();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchDashboard]);

  // Check autostart on mount
  useEffect(() => {
    isAutostartEnabled().then(setAutostartOn).catch(() => {});
  }, []);

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

  // ── Navigation ──────────────────────────────────────────────

  function handleNavigate(next: Section) {
    setSection(next);
    savePref("appSection", next);
  }

  function handleSettingsTab(tab: SettingsTab) {
    setSettingsTab(tab);
    savePref("settingsTab", tab);
  }

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
        onToggleTicker={handleToggleStandaloneTicker}
        settingsTab={settingsTab}
        onSettingsTabChange={handleSettingsTab}
        appVersion={appVersion}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Ticker preview (independent of standalone ticker window) */}
        {showAppTicker &&
          Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
            <ScrollrTicker
              key={`app-row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.appearance.tickerRows}`}
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
          {!authenticated && section !== "account" && (
            <button
              onClick={handleLogin}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
            >
              Sign in
            </button>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {section === "feed" && (
            <FeedSection
              authenticated={authenticated}
              loading={loading}
              channels={channels}
              dashboard={dashboard}
              feedMode={feedMode}
              activeTab={activeTab}
              onActiveTabChange={(tab) => {
                setActiveTab(tab);
                savePref("activeTab", tab);
              }}
              onLogin={handleLogin}
              onNavigateToChannels={() => handleNavigate("channels")}
            />
          )}

          {section === "channels" && (
            <ChannelsSection
              authenticated={authenticated}
              channels={channels}
              onToggle={handleToggleChannel}
              onAdd={handleAddChannel}
              onDelete={handleDeleteChannel}
              onLogin={handleLogin}
            />
          )}

          {section === "dashboard" && (
            <DashboardSection
              authenticated={authenticated}
              channels={channels}
              activeTab={activeTab}
              onActiveTabChange={(tab) => {
                setActiveTab(tab);
                savePref("activeTab", tab);
              }}
              getToken={getToken}
              tier={tier}
              onToggle={() => {
                const ch = channels.find((c) => c.channel_type === activeTab);
                if (ch) handleToggleChannel(ch.channel_type, !ch.visible);
              }}
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

          {section === "account" && (
            <AccountSection
              authenticated={authenticated}
              tier={tier}
              appVersion={appVersion}
              onLogin={handleLogin}
              onLogout={handleLogout}
            />
          )}
        </div>

        {/* Login overlay */}
        {loggingIn && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-surface/80 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-fg-2">
                Waiting for login...
              </p>
              <p className="text-xs text-fg-3 mt-1">
                Complete sign-in in your browser
              </p>
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
  channels,
  dashboard,
  feedMode,
  activeTab,
  onActiveTabChange,
  onLogin,
  onNavigateToChannels,
}: {
  authenticated: boolean;
  loading: boolean;
  channels: Channel[];
  dashboard: DashboardResponse | null;
  feedMode: FeedMode;
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
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
          <div key={i} className="flex items-center gap-3 animate-pulse">
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
      <div className="flex gap-1 px-4 py-2 border-b border-edge/50 shrink-0">
        {[...visibleChannels]
          .sort((a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
          )
          .map((ch) => {
            const manifest = getChannel(ch.channel_type);
            return (
              <button
                key={ch.channel_type}
                onClick={() => onActiveTabChange(ch.channel_type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === ch.channel_type
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover"
                }`}
              >
                {manifest?.tabLabel ?? ch.channel_type}
              </button>
            );
          })}
      </div>

      {/* Feed content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {FeedTabComponent ? (
          <FeedTabComponent mode={feedMode} channelConfig={channelConfig} />
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

function ChannelsSection({
  authenticated,
  channels,
  onToggle,
  onAdd,
  onDelete,
  onLogin,
}: {
  authenticated: boolean;
  channels: Channel[];
  onToggle: (channelType: ChannelType, visible: boolean) => void;
  onAdd: (channelType: ChannelType) => void;
  onDelete: (channelType: ChannelType) => void;
  onLogin: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const allManifests = getAllWebChannels();

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

  const addedTypes = new Set(channels.map((ch) => ch.channel_type));

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-base font-semibold text-fg">Your Channels</h2>
        <p className="text-xs text-fg-3 mt-1">
          Toggle channels on and off, or add new data sources.
        </p>
      </div>

      {/* Active channels */}
      {channels.length > 0 && (
        <div className="space-y-2">
          {[...channels]
            .sort((a, b) =>
              CHANNEL_ORDER.indexOf(a.channel_type) -
              CHANNEL_ORDER.indexOf(b.channel_type),
            )
            .map((ch) => {
              const manifest = getWebChannel(ch.channel_type);
              return (
                <div
                  key={ch.channel_type}
                  className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-edge"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: manifest?.hex ?? "#34d399" }}
                    />
                    <div>
                      <p className="text-sm font-medium text-fg">
                        {manifest?.name ?? ch.channel_type}
                      </p>
                      <p className="text-xs text-fg-3">
                        {manifest?.description ?? "Data channel"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Toggle visibility */}
                    <button
                      onClick={() => onToggle(ch.channel_type, !ch.visible)}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        ch.visible
                          ? "bg-accent/10 text-accent"
                          : "bg-surface-hover text-fg-3"
                      }`}
                    >
                      {ch.visible ? "Active" : "Hidden"}
                    </button>

                    {/* Delete */}
                    {confirmDelete === ch.channel_type ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onDelete(ch.channel_type);
                            setConfirmDelete(null);
                          }}
                          className="px-2 py-1 rounded-lg text-xs font-medium bg-error/10 text-error hover:bg-error/20 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1 rounded-lg text-xs font-medium text-fg-3 hover:text-fg-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(ch.channel_type)}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-fg-4 hover:text-error hover:bg-error/5 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Available channels to add */}
      {allManifests.filter((m) => !addedTypes.has(m.id as ChannelType)).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-fg-3 uppercase tracking-wider">
            Available
          </h3>
          {allManifests
            .filter((m) => !addedTypes.has(m.id as ChannelType))
            .map((manifest) => (
              <div
                key={manifest.id}
                className="flex items-center justify-between p-4 rounded-xl bg-surface-2/50 border border-edge/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 opacity-40"
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
      )}

      {channels.length === 0 && (
        <EmptyState
          title="No channels yet"
          description="Add your first channel to start receiving live data."
        />
      )}
    </div>
  );
}

// ── Dashboard Section ────────────────────────────────────────────

function DashboardSection({
  authenticated,
  channels,
  activeTab,
  onActiveTabChange,
  getToken,
  tier,
  onToggle,
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
  onToggle: () => void;
  onDelete: () => void;
  onChannelUpdate: (updated: Channel) => void;
  onLogin: () => void;
}) {
  if (!authenticated) {
    return (
      <EmptyState
        title="Sign in to configure channels"
        description="Connect your account to customize your data sources."
        action="Sign in"
        onAction={onLogin}
      />
    );
  }

  if (channels.length === 0) {
    return (
      <EmptyState
        title="No channels configured"
        description="Add channels first, then configure them here."
      />
    );
  }

  const channel = channels.find((c) => c.channel_type === activeTab);
  const webChannel = getWebChannel(activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Channel tabs */}
      <div className="flex gap-1 px-4 py-2 border-b border-edge/50 shrink-0">
        {[...channels]
          .sort((a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
          )
          .map((ch) => {
            const manifest = getWebChannel(ch.channel_type);
            return (
              <button
                key={ch.channel_type}
                onClick={() => onActiveTabChange(ch.channel_type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === ch.channel_type
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover"
                }`}
              >
                {manifest?.tabLabel ?? ch.channel_type}
              </button>
            );
          })}
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
            connected={false}
            subscriptionTier={tier}
            hex={webChannel.hex}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-fg-3 font-mono">
              No dashboard available for this channel
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Account Section ──────────────────────────────────────────────

function AccountSection({
  authenticated,
  tier,
  appVersion,
  onLogin,
  onLogout,
}: {
  authenticated: boolean;
  tier: SubscriptionTier;
  appVersion: string;
  onLogin: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <div>
        <h2 className="text-base font-semibold text-fg">Account</h2>
        <p className="text-xs text-fg-3 mt-1">
          Manage your Scrollr account and subscription.
        </p>
      </div>

      <div className="space-y-3">
        {authenticated ? (
          <>
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-edge">
              <div>
                <p className="text-xs text-fg-3">Plan</p>
                <p className="text-sm font-semibold text-accent">
                  {TIER_LABELS[tier]}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-2 border border-edge">
              <div>
                <p className="text-xs text-fg-3">Session</p>
                <p className="text-sm text-fg-2">Signed in</p>
              </div>
              <button
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-error/80 hover:text-error hover:bg-error/5 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
              <span className="text-accent text-lg font-bold">S</span>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-fg">
                Sign in to Scrollr
              </p>
              <p className="text-xs text-fg-3 mt-1">
                Unlock personalized channels, dashboard access, and real-time data.
              </p>
            </div>
            <button
              onClick={onLogin}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent text-surface hover:brightness-110 transition-all"
            >
              Sign in
            </button>
          </div>
        )}

        {/* Version info */}
        <div className="pt-4 border-t border-edge/50">
          <div className="flex items-center justify-between text-xs text-fg-4">
            <span>Version</span>
            <span className="font-mono">{appVersion ? `v${appVersion}` : ""}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-fg-4 mt-1">
            <span>Runtime</span>
            <span className="font-mono">Tauri v2</span>
          </div>
        </div>
      </div>
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
