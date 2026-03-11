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
import type { SettingsTab } from "./components/Sidebar";
import SettingsPanel from "./components/SettingsPanel";
import ScrollrTicker from "./components/ScrollrTicker";
import AppTaskbar from "./components/AppTaskbar";
import { getWebChannel, getAllWebChannels } from "./channels/webRegistry";
import { getChannel } from "~/channels/registry";
import { getWidget, getAllWidgets } from "./widgets/registry";
import WidgetConfigPanel from "./widgets/WidgetConfigPanel";
import { useWidgetTickerData } from "./hooks/useWidgetTickerData";
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

import { API_BASE as API_URL } from "./config";

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

// ── Helpers ─────────────────────────────────────────────────────

/** Resolve a human-readable name for the active item. */
function getActiveItemName(
  activeItem: string,
  channels: Channel[],
  allChannelManifests: ReturnType<typeof getAllWebChannels>,
): string {
  if (activeItem === "settings") return "Settings";

  // Channel?
  const chManifest = allChannelManifests.find((m) => m.id === activeItem);
  if (chManifest) return chManifest.name;

  // Widget?
  const widget = getWidget(activeItem);
  if (widget) return widget.name;

  return activeItem;
}

// ── App ─────────────────────────────────────────────────────────

export default function MainApp() {
  // ── Navigation ──────────────────────────────────────────────
  // activeItem: channel ID, widget ID, or "settings"
  // sourceTab: which tab is active for channels/widgets
  type SourceTab = "feed" | "info" | "configuration";

  const [activeItem, setActiveItem] = useState<string>(() => {
    const saved = loadPref<string>("activeItem", "");
    // Migration: old values "feed" / "channels" / "dashboard" / "account"
    // no longer valid — will be resolved after channels load
    if (!saved || saved === "feed" || saved === "channels" || saved === "dashboard" || saved === "account") {
      return ""; // Empty = resolve after data loads
    }
    return saved;
  });
  const [sourceTab, setSourceTab] = useState<SourceTab>("feed");
  const configuring = sourceTab === "configuration";

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

  // ── Derived data ──────────────────────────────────────────────

  const allChannelManifests = useMemo(() => getAllWebChannels(), []);
  const allWidgets = useMemo(() => getAllWidgets(), []);

  const sortedChannels = useMemo(
    () =>
      [...channels]
        .filter((ch) => ch.enabled && ch.visible)
        .sort(
          (a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
        ),
    [channels],
  );

  const enabledWidgets = prefs.widgets.enabledWidgets;

  // ── Resolve empty activeItem after data loads ─────────────────
  // If activeItem is empty (first launch or migrated from old layout),
  // pick the first available source.

  useEffect(() => {
    if (activeItem !== "" || loading) return;

    const firstChannel = sortedChannels[0]?.channel_type;
    const firstWidget = enabledWidgets[0];
    const fallback = firstChannel ?? firstWidget ?? "settings";

    setActiveItem(fallback);
    savePref("activeItem", fallback);
  }, [activeItem, loading, sortedChannels, enabledWidgets]);

  // ── Active item identity ──────────────────────────────────────

  const isChannelActive = channels.some(
    (ch) => ch.channel_type === activeItem,
  );
  const activeWidget = getWidget(activeItem);
  const isWidgetActive = !!activeWidget && enabledWidgets.includes(activeItem);
  const isSettingsActive = activeItem === "settings";

  const activeItemName = useMemo(
    () => getActiveItemName(activeItem, channels, allChannelManifests),
    [activeItem, channels, allChannelManifests],
  );

  // ── Theme & scale application ────────────────────────────────

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

      // Always attempt to get a valid token — handles silent refresh
      // even when isAuthenticated() returned false at init (expired
      // access token with a valid refresh token).
      const token = await getValidToken();

      if (token) {
        // Sync auth + tier state (covers silent refresh from expired state)
        if (!authenticatedRef.current) {
          setAuthenticated(true);
        }
        const currentTier = getTier();
        setTier(currentTier);

        const res = await fetch(`${API_URL}/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          // Token rejected by server — fall back to anonymous
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
      } else {
        // No token available (not logged in, or refresh failed)
        if (authenticatedRef.current) {
          setAuthenticated(false);
          setTier("free");
        }
        const res = await fetch(`${API_URL}/public/feed`);
        if (res.ok) {
          const data = await res.json();
          setDashboard({ data: data.data });
          if (data.channels) setChannels(data.channels);
        } else {
          setFetchError(`Server returned ${res.status}`);
        }
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

  const handleSelectItem = useCallback((id: string) => {
    setActiveItem(id);
    savePref("activeItem", id);
  }, []);

  const handleConfigureChannel = useCallback((channelType: string) => {
    setActiveItem(channelType);
    setSourceTab("configuration");
    savePref("activeItem", channelType);
  }, []);

  const handleConfigureWidget = useCallback((widgetId: string) => {
    setActiveItem(widgetId);
    setSourceTab("configuration");
    savePref("activeItem", widgetId);
  }, []);

  const handleSettingsTab = useCallback((tab: SettingsTab) => {
    setSettingsTab(tab);
    savePref("settingsTab", tab);
  }, []);

  // ── Keyboard shortcuts ──────────────────────────────────────
  // Escape: dismiss overlays, exit configure mode.

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape → dismiss login overlay, session banner, or exit configure mode
      if (e.key === "Escape") {
        if (loggingIn) {
          setLoggingIn(false);
          return;
        }
        if (sessionExpired) {
          setSessionExpired(false);
          return;
        }
        if (sourceTab !== "feed") {
          setSourceTab("feed");
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loggingIn, sessionExpired, configuring]);

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
        // Navigate to the new channel
        setActiveItem(channelType);
        setSourceTab("feed");
        savePref("activeItem", channelType);
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
        setChannels((prev) => {
          const remaining = prev.filter(
            (ch) => ch.channel_type !== channelType,
          );
          // Navigate to first remaining source
          if (activeItem === channelType) {
            const firstCh = remaining.find((ch) => ch.enabled && ch.visible);
            const fallback =
              firstCh?.channel_type ??
              enabledWidgets[0] ??
              "settings";
            setActiveItem(fallback);
            setSourceTab("feed");
            savePref("activeItem", fallback);
          }
          return remaining;
        });
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [activeItem, enabledWidgets],
  );

  const handleChannelUpdate = useCallback(
    (updated: Channel) => {
      setChannels((prev) =>
        prev.map((ch) =>
          ch.channel_type === updated.channel_type ? updated : ch,
        ),
      );
      fetchDashboard();
    },
    [fetchDashboard],
  );

  // ── Widget toggle handler ───────────────────────────────────

  const handleToggleWidget = useCallback(
    (widgetId: string) => {
      const isEnabled = enabledWidgets.includes(widgetId);
      const nextEnabled = isEnabled
        ? enabledWidgets.filter((id) => id !== widgetId)
        : [...enabledWidgets, widgetId];

      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, enabledWidgets: nextEnabled },
      };
      setPrefs(next);
      savePrefs(next);

      // If enabling, navigate to the widget
      if (!isEnabled) {
        setActiveItem(widgetId);
        setSourceTab("feed");
        savePref("activeItem", widgetId);
      }
      // If disabling the active widget, navigate away
      if (isEnabled && activeItem === widgetId) {
        const firstCh = sortedChannels[0]?.channel_type;
        const firstWidget = nextEnabled[0];
        const fallback = firstCh ?? firstWidget ?? "settings";
        setActiveItem(fallback);
        setSourceTab("feed");
        savePref("activeItem", fallback);
      }
    },
    [prefs, enabledWidgets, activeItem, sortedChannels],
  );

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

  // ── Derived: active tabs for ticker (channels + enabled widgets) ──

  const activeTabs = useMemo(
    () => [
      ...channels
        .filter((ch) => ch.enabled && ch.visible)
        .map((ch) => ch.channel_type),
      ...prefs.widgets.enabledWidgets,
    ],
    [channels, prefs.widgets.enabledWidgets],
  );

  // ── Widget ticker data (local polling for clock/weather/sysmon) ──
  const widgetData = useWidgetTickerData(prefs.widgets);

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

  // ── Content rendering helpers ────────────────────────────────

  function renderContent() {
    // Settings
    if (isSettingsActive) {
      return (
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
      );
    }

    // Not authenticated — prompt sign in
    if (!authenticated && isChannelActive) {
      return (
        <EmptyState
          title="Sign in to view your feed"
          description="Connect your account to see live data from your channels."
          action="Sign in"
          onAction={handleLogin}
        />
      );
    }

    // Loading
    if (loading && !isWidgetActive) {
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

    // Fetch error (only for channel content)
    if (fetchError && isChannelActive) {
      return <ErrorState message={fetchError} onRetry={fetchDashboard} />;
    }

    // Info tab — channels and widgets
    if (sourceTab === "info" && (isChannelActive || isWidgetActive)) {
      const manifest = isChannelActive
        ? allChannelManifests.find((m) => m.id === activeItem)
        : activeWidget;
      const info = manifest?.info;
      const Icon = manifest && "icon" in manifest ? manifest.icon : null;
      const hex = manifest?.hex ?? "var(--color-fg-3)";

      return (
        <div className="p-6 max-w-xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            {Icon && (
              <span
                className="flex items-center justify-center w-10 h-10 rounded-xl"
                style={{ backgroundColor: `${hex}15`, color: hex }}
              >
                <Icon size={20} />
              </span>
            )}
            <div>
              <h2 className="text-lg font-semibold">{manifest?.name}</h2>
              <p className="text-sm text-fg-3">
                {"description" in (manifest ?? {})
                  ? (manifest as { description: string }).description
                  : ""}
              </p>
            </div>
          </div>

          {/* About */}
          {info && (
            <div className="space-y-4">
              <section>
                <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
                  About
                </h3>
                <p className="text-sm text-fg-2 leading-relaxed">
                  {info.about}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-mono font-bold text-fg-3 uppercase tracking-wider mb-2">
                  How to use
                </h3>
                <ul className="space-y-2">
                  {info.usage.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-fg-2">
                      <span
                        className="flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 mt-0.5"
                        style={{ backgroundColor: `${hex}15`, color: hex }}
                      >
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      );
    }

    // Channel — configure mode (DashboardTab)
    if (isChannelActive && configuring) {
      const channel = channels.find((c) => c.channel_type === activeItem);
      const webChannel = getWebChannel(activeItem);

      if (channel && webChannel) {
        return (
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin dashboard-content">
            <webChannel.DashboardTab
              channel={channel}
              getToken={getToken}
              onToggle={() =>
                handleToggleChannel(channel.channel_type, !channel.visible)
              }
              onDelete={() =>
                handleDeleteChannel(activeItem as ChannelType)
              }
              onChannelUpdate={handleChannelUpdate}
              connected={deliveryMode === "sse"}
              subscriptionTier={tier}
              hex={webChannel.hex}
            />
          </div>
        );
      }

      return (
        <EmptyState
          title="Configuration unavailable"
          description="This channel does not have a configuration panel."
        />
      );
    }

    // Channel — feed mode
    if (isChannelActive) {
      const channelModule = getChannel(activeItem);
      const FeedTabComponent = channelModule?.FeedTab;

      if (!FeedTabComponent) {
        return (
          <EmptyState
            title="No feed available"
            description="This channel doesn't have a feed view yet."
          />
        );
      }

      const initialItems = dashboard?.data?.[activeItem] ?? [];
      const hasChannel = channels.some(
        (ch) => ch.channel_type === activeItem && ch.enabled,
      );
      const channelConfig = {
        __initialItems: initialItems,
        __dashboardLoaded: dashboard !== null,
        __hasConfig: hasChannel,
      };

      return <FeedTabComponent mode="comfort" channelConfig={channelConfig} />;
    }

    // Widget — configure mode
    if (isWidgetActive && configuring) {
      return (
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin dashboard-content">
          <WidgetConfigPanel
            widgetId={activeItem}
            prefs={prefs}
            onPrefsChange={handlePrefsChange}
          />
        </div>
      );
    }

    // Widget — feed mode
    if (isWidgetActive && activeWidget) {
      const channelConfig = {
        __initialItems: [],
        __dashboardLoaded: true,
      };
      return <activeWidget.FeedTab mode="comfort" channelConfig={channelConfig} />;
    }

    // Empty state — no sources at all
    if (sortedChannels.length === 0 && enabledWidgets.length === 0) {
      if (!authenticated) {
        return (
          <EmptyState
            title="Welcome to Scrollr"
            description="Sign in to add channels, or enable a widget from the sidebar to get started."
            action="Sign in"
            onAction={handleLogin}
          />
        );
      }
      return (
        <EmptyState
          title="No sources yet"
          description="Add a channel or enable a widget from the sidebar to get started."
        />
      );
    }

    // Fallback
    return (
      <EmptyState
        title="Select a source"
        description="Choose a channel or widget from the sidebar."
      />
    );
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
        channels={channels}
        allChannelManifests={allChannelManifests}
        allWidgets={allWidgets}
        enabledWidgets={enabledWidgets}
        activeItem={activeItem}
        configuring={configuring}
        tickerAlive={prefs.ticker.showTicker}
        authenticated={authenticated}
        appVersion={appVersion}
        onSelectItem={handleSelectItem}
        onConfigureChannel={handleConfigureChannel}
        onAddChannel={handleAddChannel}
        onToggleWidget={handleToggleWidget}
        onConfigureWidget={handleConfigureWidget}
        onLogin={handleLogin}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Ticker preview (independent of standalone ticker window) */}
        {showAppTicker &&
          Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
            <ScrollrTicker
              key={`app-row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.ticker.tickerDirection}-${prefs.ticker.scrollMode}-${prefs.ticker.stepPause}-${prefs.appearance.tickerRows}`}
              dashboard={dashboard}
              activeTabs={activeTabs}
              widgetData={widgetData}
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
            onNavigateToWidget={handleSelectItem}
          />
        )}

        {/* Header */}
        <header className="flex items-center justify-between px-6 h-14 border-b border-edge shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-base font-semibold truncate">
              {activeItemName}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Feed / Configuration tabs — channels and widgets */}
            {(isChannelActive || isWidgetActive) && (
              <div className="flex gap-1">
                {(["feed", "info", "configuration"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setSourceTab(tab)}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                      sourceTab === tab
                        ? "bg-accent/10 text-accent"
                        : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
            {/* Settings tab switcher */}
            {isSettingsActive && (
              <div className="flex gap-1">
                {(["general", "ticker", "account"] as SettingsTab[]).map(
                  (tab) => (
                    <button
                      key={tab}
                      onClick={() => handleSettingsTab(tab)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                        settingsTab === tab
                          ? "bg-accent/10 text-accent"
                          : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                      )}
                    >
                      {tab}
                    </button>
                  ),
                )}
              </div>
            )}
            {!authenticated && !isSettingsActive && !(isChannelActive || isWidgetActive) && (
              <button
                onClick={handleLogin}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
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
          {renderContent()}
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
