/**
 * Root layout route — the persistent app shell.
 *
 * Renders sidebar, header bar, ticker, taskbar around an <Outlet />
 * for route-specific content. Migrated from MainApp.tsx — all
 * navigation now uses TanStack Router instead of internal state.
 */
import {
  createRootRouteWithContext,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import clsx from "clsx";
import { Trash2 } from "lucide-react";
import { motion } from "motion/react";

// Shell components
import TitleBar from "../components/TitleBar";
import Sidebar from "../components/Sidebar";
import type { SettingsTab } from "../components/Sidebar";
import ScrollrTicker from "../components/ScrollrTicker";
import AppTaskbar from "../components/AppTaskbar";

// Registries
import { getAllChannels } from "../channels/registry";
import { getAllWidgets, getWidget } from "../widgets/registry";

// Data
import { dashboardQueryOptions } from "../api/queries";
import { channelsApi } from "../api/client";
import type { ChannelType } from "../api/client";

// Auth
import {
  login as authLogin,
  logout as authLogout,
  getValidToken,
  isAuthenticated as checkAuth,
  getTier,
} from "../auth";
import type { SubscriptionTier } from "../auth";

// Preferences
import {
  loadPref,
  savePref,
  loadPrefs,
  savePrefs,
  resolveTheme,
  TICKER_GAPS,
} from "../preferences";
import type { AppPreferences } from "../preferences";

// Types
import type { DeliveryMode } from "../types";

// Hooks
import { useWidgetTickerData } from "../hooks/useWidgetTickerData";

// Shell context
import { ShellContext } from "../shell-context";

// ── Route context ────────────────────────────────────────────────

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

// ── Platform detection ──────────────────────────────────────────

const IS_MACOS =
  (navigator as { userAgentData?: { platform?: string } }).userAgentData
    ?.platform === "macOS" || /Mac/.test(navigator.platform);

// ── URL helpers ─────────────────────────────────────────────────

type SourceTab = "feed" | "info" | "configuration";

function parseRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [kind, itemId, tab] = segments;

  if (kind === "channel" && itemId) {
    return {
      activeItem: itemId,
      sourceTab: (["feed", "info", "configuration"].includes(tab) ? tab : "feed") as SourceTab,
      settingsTab: "general" as SettingsTab,
      isChannel: true,
      isWidget: false,
      isSettings: false,
      isIndex: false,
    };
  }
  if (kind === "widget" && itemId) {
    return {
      activeItem: itemId,
      sourceTab: (["feed", "info", "configuration"].includes(tab) ? tab : "feed") as SourceTab,
      settingsTab: "general" as SettingsTab,
      isChannel: false,
      isWidget: true,
      isSettings: false,
      isIndex: false,
    };
  }
  if (kind === "settings") {
    const validTabs: SettingsTab[] = ["general", "ticker", "account"];
    return {
      activeItem: "settings",
      sourceTab: "feed" as SourceTab,
      settingsTab: (validTabs.includes(itemId as SettingsTab) ? itemId : "general") as SettingsTab,
      isChannel: false,
      isWidget: false,
      isSettings: true,
      isIndex: false,
    };
  }
  return {
    activeItem: "",
    sourceTab: "feed" as SourceTab,
    settingsTab: "general" as SettingsTab,
    isChannel: false,
    isWidget: false,
    isSettings: false,
    isIndex: true,
  };
}

// ── Root Layout ─────────────────────────────────────────────────

function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);

  const configuring = route.sourceTab === "configuration";

  // ── Auth state ──────────────────────────────────────────────
  const [authenticated, setAuthenticated] = useState(() => checkAuth());
  const [tier, setTier] = useState<SubscriptionTier>(() =>
    checkAuth() ? getTier() : "free",
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // ── Dashboard data (TanStack Query) ─────────────────────────
  const {
    data: dashboard,
    isLoading: loading,
    error: queryError,
    refetch: fetchDashboard,
  } = useQuery(dashboardQueryOptions());

  const channels = useMemo(() => dashboard?.channels ?? [], [dashboard]);

  const sortedChannels = useMemo(() => {
    const ORDER = ["finance", "sports", "rss", "fantasy"];
    return [...channels]
      .filter((ch) => ch.enabled && ch.visible)
      .sort(
        (a, b) =>
          ORDER.indexOf(a.channel_type) - ORDER.indexOf(b.channel_type),
      );
  }, [channels]);

  // ── Manifests ───────────────────────────────────────────────
  const allChannelManifests = useMemo(() => getAllChannels(), []);
  const allWidgets = useMemo(() => getAllWidgets(), []);

  // ── Preferences ─────────────────────────────────────────────
  const [prefs, setPrefs] = useState<AppPreferences>(loadPrefs);
  const [autostartOn, setAutostartOn] = useState(false);
  const enabledWidgets = prefs.widgets.enabledWidgets;

  const [showAppTicker, setShowAppTicker] = useState(() =>
    loadPref("showAppTicker", true),
  );
  const [showTaskbar, setShowTaskbar] = useState(() =>
    loadPref("showTaskbar", true),
  );

  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(() =>
    loadPref<DeliveryMode>("deliveryMode", "polling"),
  );

  // Delete arm state (double-click confirm)
  const [deleteArmed, setDeleteArmed] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for stable closures
  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

  // ── Auth sync — refresh tier on dashboard load ──────────────
  useEffect(() => {
    if (dashboard) {
      const isAuth = checkAuth();
      if (isAuth !== authenticated) setAuthenticated(isAuth);
      if (isAuth) setTier(getTier());
    }
  }, [dashboard]);

  // ── Resolve empty route after data loads ────────────────────
  useEffect(() => {
    if (!route.isIndex || loading) return;

    const firstChannel = sortedChannels[0]?.channel_type;
    const firstWidget = enabledWidgets[0];

    if (firstChannel) {
      navigate({ to: "/channel/$type/$tab", params: { type: firstChannel, tab: "feed" } });
    } else if (firstWidget) {
      navigate({ to: "/widget/$id/$tab", params: { id: firstWidget, tab: "feed" } });
    }
    // If nothing available, stay on index (welcome page)
  }, [route.isIndex, loading, sortedChannels, enabledWidgets, navigate]);

  // ── Active item identity ────────────────────────────────────

  const isChannelActive = route.isChannel && channels.some(
    (ch) => ch.channel_type === route.activeItem,
  );
  const activeWidget = route.isWidget ? getWidget(route.activeItem) : undefined;
  const isWidgetActive = !!activeWidget && enabledWidgets.includes(route.activeItem);

  const activeItemName = useMemo(() => {
    if (route.isSettings) return "Settings";
    const chManifest = allChannelManifests.find((m) => m.id === route.activeItem);
    if (chManifest) return chManifest.name;
    const widget = getWidget(route.activeItem);
    if (widget) return widget.name;
    return route.activeItem;
  }, [route.activeItem, route.isSettings, allChannelManifests]);

  // ── Theme & scale ───────────────────────────────────────────

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
    savePref("theme", resolved);

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

  useEffect(() => {
    const shell = document.getElementById("app-shell");
    if (!shell) return;
    shell.style.zoom =
      prefs.appearance.uiScale === 100
        ? ""
        : `${prefs.appearance.uiScale}%`;
  }, [prefs.appearance.uiScale]);

  // ── Cross-window sync ───────────────────────────────────────

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "scrollr:settings" && e.newValue) {
        try {
          setPrefs(JSON.parse(e.newValue) as AppPreferences);
        } catch { /* ignore */ }
      }
      if (e.key === "scrollr:deliveryMode" && e.newValue) {
        try {
          setDeliveryMode(JSON.parse(e.newValue) as DeliveryMode);
        } catch { /* ignore */ }
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    isAutostartEnabled().then(setAutostartOn).catch(() => {});
  }, []);

  // ── Navigation handlers ─────────────────────────────────────

  const handleSelectItem = useCallback(
    (id: string) => {
      setDeleteArmed(false);
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);

      if (id === "settings") {
        navigate({ to: "/settings/$tab", params: { tab: "general" } });
        return;
      }

      // Channel?
      if (channels.some((ch) => ch.channel_type === id)) {
        navigate({ to: "/channel/$type/$tab", params: { type: id, tab: "feed" } });
        return;
      }

      // Widget?
      if (getWidget(id)) {
        navigate({ to: "/widget/$id/$tab", params: { id, tab: "feed" } });
        return;
      }

      navigate({ to: "/" });
    },
    [channels, navigate],
  );

  const handleConfigureChannel = useCallback(
    (channelType: string) => {
      navigate({
        to: "/channel/$type/$tab",
        params: { type: channelType, tab: "configuration" },
      });
    },
    [navigate],
  );

  const handleConfigureWidget = useCallback(
    (widgetId: string) => {
      navigate({
        to: "/widget/$id/$tab",
        params: { id: widgetId, tab: "configuration" },
      });
    },
    [navigate],
  );

  const handleSettingsTab = useCallback(
    (tab: SettingsTab) => {
      navigate({ to: "/settings/$tab", params: { tab } });
    },
    [navigate],
  );

  // ── Keyboard shortcuts ──────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (loggingIn) { setLoggingIn(false); return; }
        if (sessionExpired) { setSessionExpired(false); return; }
        if (route.sourceTab !== "feed" && (route.isChannel || route.isWidget)) {
          navigate({
            to: route.isChannel
              ? "/channel/$type/$tab"
              : "/widget/$id/$tab",
            params: route.isChannel
              ? { type: route.activeItem, tab: "feed" }
              : { id: route.activeItem, tab: "feed" },
          });
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loggingIn, sessionExpired, route, navigate]);

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
          { enabled: true, visible },
          () => Promise.resolve(token),
        );
        fetchDashboard();
      } catch (err) {
        console.error("[Scrollr] Channel toggle failed:", err);
      }
    },
    [fetchDashboard],
  );

  const handleAddChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.create(
          channelType,
          {},
          () => Promise.resolve(token),
        );
        fetchDashboard();
        navigate({
          to: "/channel/$type/$tab",
          params: { type: channelType, tab: "feed" },
        });
      } catch (err) {
        console.error("[Scrollr] Channel add failed:", err);
      }
    },
    [fetchDashboard, navigate],
  );

  const handleDeleteChannel = useCallback(
    async (channelType: ChannelType) => {
      const token = await getValidToken();
      if (!token) return;
      try {
        await channelsApi.delete(channelType, () => Promise.resolve(token));
        await fetchDashboard();
        // Navigate to first remaining source
        const firstCh = sortedChannels.find(
          (ch) => ch.channel_type !== channelType,
        );
        const fallback =
          firstCh?.channel_type ?? enabledWidgets[0] ?? "settings";
        handleSelectItem(fallback);
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [sortedChannels, enabledWidgets, fetchDashboard, handleSelectItem],
  );

  // ── Widget handlers ─────────────────────────────────────────

  const handleToggleWidgetTicker = useCallback(
    (widgetId: string) => {
      const onTicker = prefs.widgets.widgetsOnTicker;
      const nextOnTicker = onTicker.includes(widgetId)
        ? onTicker.filter((id) => id !== widgetId)
        : [...onTicker, widgetId];
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, widgetsOnTicker: nextOnTicker },
      };
      setPrefs(next);
      savePrefs(next);
    },
    [prefs],
  );

  const handleToggleWidget = useCallback(
    (widgetId: string) => {
      const isEnabled = enabledWidgets.includes(widgetId);
      const nextEnabled = isEnabled
        ? enabledWidgets.filter((id) => id !== widgetId)
        : [...enabledWidgets, widgetId];
      const nextOnTicker = isEnabled
        ? prefs.widgets.widgetsOnTicker.filter((id) => id !== widgetId)
        : [...prefs.widgets.widgetsOnTicker, widgetId];
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          enabledWidgets: nextEnabled,
          widgetsOnTicker: nextOnTicker,
        },
      };
      setPrefs(next);
      savePrefs(next);

      if (!isEnabled) {
        navigate({
          to: "/widget/$id/$tab",
          params: { id: widgetId, tab: "feed" },
        });
      }
      if (isEnabled && route.activeItem === widgetId) {
        const firstCh = sortedChannels[0]?.channel_type;
        const firstWidget = nextEnabled[0];
        const fallback = firstCh ?? firstWidget ?? "settings";
        handleSelectItem(fallback);
      }
    },
    [prefs, enabledWidgets, route.activeItem, sortedChannels, navigate, handleSelectItem],
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

  // ── Stable getToken ─────────────────────────────────────────

  const getToken = useCallback(() => getValidToken(), []);

  // ── Ticker data ─────────────────────────────────────────────

  const activeTabs = useMemo(
    () => [
      ...channels
        .filter((ch) => ch.enabled && ch.visible)
        .map((ch) => ch.channel_type),
      ...prefs.widgets.widgetsOnTicker,
    ],
    [channels, prefs.widgets.widgetsOnTicker],
  );

  const widgetData = useWidgetTickerData(prefs.widgets);

  const handleTogglePin = useCallback((widgetId: string) => {
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
  }, []);

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

  // ── Header tab navigation ───────────────────────────────────

  function handleSourceTab(tab: SourceTab) {
    if (route.isChannel) {
      navigate({
        to: "/channel/$type/$tab",
        params: { type: route.activeItem, tab },
      });
    } else if (route.isWidget) {
      navigate({
        to: "/widget/$id/$tab",
        params: { id: route.activeItem, tab },
      });
    }
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
          channels={channels as any}
          allChannelManifests={allChannelManifests as any}
          allWidgets={allWidgets as any}
          enabledWidgets={enabledWidgets}
          activeItem={route.activeItem}
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
          {/* App ticker */}
          {showAppTicker &&
            Array.from({ length: prefs.appearance.tickerRows }, (_, i) => (
              <ScrollrTicker
                key={`app-row${i}-${prefs.ticker.tickerGap}-${prefs.ticker.tickerSpeed}-${prefs.ticker.hoverSpeed}-${prefs.ticker.tickerMode}-${prefs.ticker.mixMode}-${prefs.ticker.chipColors}-${prefs.ticker.tickerDirection}-${prefs.ticker.scrollMode}-${prefs.ticker.stepPause}-${prefs.appearance.tickerRows}`}
                dashboard={dashboard as any}
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

              {/* Channel ticker toggle */}
              {isChannelActive &&
                (() => {
                  const ch = channels.find(
                    (c) => c.channel_type === route.activeItem,
                  );
                  const manifest = allChannelManifests.find(
                    (m) => m.id === route.activeItem,
                  );
                  const active = ch?.visible ?? false;
                  const hex = manifest?.hex ?? "var(--color-fg-3)";
                  return (
                    <button
                      onClick={() =>
                        handleToggleChannel(
                          route.activeItem as ChannelType,
                          !active,
                        )
                      }
                      className="shrink-0"
                      title={active ? "Visible on ticker" : "Hidden from ticker"}
                      aria-label={active ? "Hide from ticker" : "Show on ticker"}
                    >
                      <span
                        className="block h-4 w-7 rounded-full relative transition-colors"
                        style={{ background: active ? hex : undefined }}
                      >
                        {!active && (
                          <span className="absolute inset-0 rounded-full bg-fg-4/25" />
                        )}
                        <motion.span
                          className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
                          animate={{ x: active ? 12 : 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                          }}
                        />
                      </span>
                    </button>
                  );
                })()}

              {/* Widget ticker toggle */}
              {isWidgetActive &&
                (() => {
                  const active = prefs.widgets.widgetsOnTicker.includes(
                    route.activeItem,
                  );
                  const hex = activeWidget?.hex ?? "var(--color-fg-3)";
                  return (
                    <button
                      onClick={() =>
                        handleToggleWidgetTicker(route.activeItem)
                      }
                      className="shrink-0"
                      title={active ? "Visible on ticker" : "Hidden from ticker"}
                      aria-label={active ? "Hide from ticker" : "Show on ticker"}
                    >
                      <span
                        className="block h-4 w-7 rounded-full relative transition-colors"
                        style={{ background: active ? hex : undefined }}
                      >
                        {!active && (
                          <span className="absolute inset-0 rounded-full bg-fg-4/25" />
                        )}
                        <motion.span
                          className="absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white"
                          animate={{ x: active ? 12 : 0 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 30,
                          }}
                        />
                      </span>
                    </button>
                  );
                })()}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Feed / About / Settings tabs */}
              {(isChannelActive || isWidgetActive) && (
                <div className="flex gap-1">
                  {(
                    [
                      { key: "feed", label: "Feed" },
                      { key: "info", label: "About" },
                      { key: "configuration", label: "Settings" },
                    ] as const
                  ).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => handleSourceTab(key)}
                      className={clsx(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        route.sourceTab === key
                          ? "bg-accent/10 text-accent"
                          : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Settings tab switcher */}
              {route.isSettings && (
                <div className="flex gap-1">
                  {(["general", "ticker", "account"] as SettingsTab[]).map(
                    (tab) => (
                      <button
                        key={tab}
                        onClick={() => handleSettingsTab(tab)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize",
                          route.settingsTab === tab
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

              {/* Sign-in for unauthenticated on index */}
              {!authenticated &&
                route.isIndex && (
                  <button
                    onClick={handleLogin}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
                  >
                    Sign in
                  </button>
                )}

              {/* Delete — double-tap confirm */}
              {(isChannelActive || isWidgetActive) && (
                <button
                  onClick={() => {
                    if (deleteArmed) {
                      if (deleteTimerRef.current)
                        clearTimeout(deleteTimerRef.current);
                      if (isChannelActive) {
                        handleDeleteChannel(route.activeItem as ChannelType);
                      } else {
                        handleToggleWidget(route.activeItem);
                      }
                      setDeleteArmed(false);
                    } else {
                      setDeleteArmed(true);
                      deleteTimerRef.current = setTimeout(
                        () => setDeleteArmed(false),
                        3000,
                      );
                    }
                  }}
                  className={clsx(
                    "px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5",
                    deleteArmed
                      ? "text-red-500 bg-red-500/10"
                      : "text-fg-4/40 hover:text-red-500",
                  )}
                  title={
                    deleteArmed
                      ? "Click again to confirm removal"
                      : isChannelActive
                        ? "Remove this channel"
                        : "Remove this widget"
                  }
                >
                  <Trash2 size={14} />
                  {deleteArmed && (
                    <span className="text-[11px] font-medium">Remove?</span>
                  )}
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

          {/* Content — route outlet */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <ShellContext.Provider
              value={{
                prefs,
                onPrefsChange: handlePrefsChange,
                authenticated,
                tier,
                onLogin: handleLogin,
                onLogout: handleLogout,
                autostartEnabled: autostartOn,
                onAutostartChange: handleAutostartChange,
                showAppTicker,
                onToggleAppTicker: (v: boolean) => {
                  setShowAppTicker(v);
                  savePref("showAppTicker", v);
                },
                showTaskbar,
                onToggleTaskbar: (v: boolean) => {
                  setShowTaskbar(v);
                  savePref("showTaskbar", v);
                },
                appVersion,
                getToken,
              }}
            >
              <Outlet />
            </ShellContext.Provider>
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
                  Signing you in...
                </p>
                <p className="text-xs text-fg-3 mt-1">
                  Finish signing in from your browser
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
