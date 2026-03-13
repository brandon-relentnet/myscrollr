/**
 * Root layout route — the persistent app shell.
 *
 * Renders IconRail, TopNav, ticker, taskbar around an <Outlet />
 * for route-specific content. Navigation overhaul: top-level views
 * (Feed, Ticker, Account) replace the old sidebar-driven paradigm.
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

// Shell components
import TitleBar from "../components/TitleBar";
import IconRail from "../components/IconRail";
import TopNav from "../components/TopNav";
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

type ActiveView = "feed" | "ticker" | "settings" | "account" | "none";

function parseRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [kind, itemId] = segments;

  if (kind === "feed" || pathname === "/") {
    return {
      activeItem: "",
      activeView: "feed" as ActiveView,
      isChannel: false,
      isWidget: false,
      isFeed: true,
      isTicker: false,
      isSettings: false,
      isAccount: false,
    };
  }
  if (kind === "channel" && itemId) {
    return {
      activeItem: itemId,
      activeView: "none" as ActiveView,
      isChannel: true,
      isWidget: false,
      isFeed: false,
      isTicker: false,
      isSettings: false,
      isAccount: false,
    };
  }
  if (kind === "widget" && itemId) {
    return {
      activeItem: itemId,
      activeView: "none" as ActiveView,
      isChannel: false,
      isWidget: true,
      isFeed: false,
      isTicker: false,
      isSettings: false,
      isAccount: false,
    };
  }
  if (kind === "ticker") {
    return {
      activeItem: "",
      activeView: "ticker" as ActiveView,
      isChannel: false,
      isWidget: false,
      isFeed: false,
      isTicker: true,
      isSettings: false,
      isAccount: false,
    };
  }
  if (kind === "settings") {
    return {
      activeItem: "settings",
      activeView: "settings" as ActiveView,
      isChannel: false,
      isWidget: false,
      isFeed: false,
      isTicker: false,
      isSettings: true,
      isAccount: false,
    };
  }
  if (kind === "account") {
    return {
      activeItem: "",
      activeView: "account" as ActiveView,
      isChannel: false,
      isWidget: false,
      isFeed: false,
      isTicker: false,
      isSettings: false,
      isAccount: true,
    };
  }
  return {
    activeItem: "",
    activeView: "feed" as ActiveView,
    isChannel: false,
    isWidget: false,
    isFeed: true,
    isTicker: false,
    isSettings: false,
    isAccount: false,
  };
}

// ── Root Layout ─────────────────────────────────────────────────

function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);

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

  // ── Resolve empty route — redirect / to /feed ───────────────
  useEffect(() => {
    if (location.pathname === "/" && !loading) {
      navigate({ to: "/feed" });
    }
  }, [location.pathname, loading, navigate]);

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
      if (id === "settings") {
        navigate({ to: "/settings" });
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
      navigate({ to: "/feed" });
    },
    [channels, navigate],
  );

  const handleNavigateToFeed = useCallback(() => {
    navigate({ to: "/feed" });
  }, [navigate]);

  const handleNavigateToTicker = useCallback(() => {
    navigate({ to: "/ticker" });
  }, [navigate]);

  const handleNavigateToSettings = useCallback(() => {
    navigate({ to: "/settings" });
  }, [navigate]);

  const handleNavigateToAccount = useCallback(() => {
    navigate({ to: "/account" });
  }, [navigate]);

  // ── Keyboard shortcuts ──────────────────────────────────────

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (loggingIn) { setLoggingIn(false); return; }
        if (sessionExpired) { setSessionExpired(false); return; }
        // If on a channel/widget detail sub-tab, go back to feed tab
        if (route.isChannel || route.isWidget) {
          const segments = location.pathname.split("/").filter(Boolean);
          const tab = segments[2];
          if (tab && tab !== "feed") {
            if (route.isChannel) {
              navigate({
                to: "/channel/$type/$tab",
                params: { type: route.activeItem, tab: "feed" },
              });
            } else {
              navigate({
                to: "/widget/$id/$tab",
                params: { id: route.activeItem, tab: "feed" },
              });
            }
            return;
          }
          // If already on feed tab, go back to dashboard
          navigate({ to: "/feed" });
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loggingIn, sessionExpired, route, location.pathname, navigate]);

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
        navigate({ to: "/feed" });
      } catch (err) {
        console.error("[Scrollr] Channel delete failed:", err);
      }
    },
    [fetchDashboard, navigate],
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
        navigate({ to: "/feed" });
      }
    },
    [prefs, enabledWidgets, route.activeItem, navigate],
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

  // ── Shell context value ─────────────────────────────────────

  const shellValue = useMemo(
    () => ({
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
      // New navigation overhaul additions
      channels: channels as any,
      dashboard,
      allChannelManifests: allChannelManifests as any,
      allWidgets: allWidgets as any,
      onToggleChannelTicker: handleToggleChannel,
      onToggleWidgetTicker: handleToggleWidgetTicker,
      onAddChannel: handleAddChannel,
      onDeleteChannel: handleDeleteChannel,
      onToggleWidget: handleToggleWidget,
      fetchDashboard: () => { fetchDashboard(); },
      onSelectItem: handleSelectItem,
    }),
    [
      prefs, handlePrefsChange, authenticated, tier,
      handleLogin, handleLogout, autostartOn, handleAutostartChange,
      showAppTicker, showTaskbar, appVersion, getToken,
      channels, dashboard, allChannelManifests, allWidgets,
      handleToggleChannel, handleToggleWidgetTicker,
      handleAddChannel, handleDeleteChannel, handleToggleWidget,
      fetchDashboard, handleSelectItem,
    ],
  );

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
        <IconRail
          channels={channels as any}
          allChannelManifests={allChannelManifests as any}
          allWidgets={allWidgets as any}
          enabledWidgets={enabledWidgets}
          activeItem={route.activeItem}
          tickerAlive={prefs.ticker.showTicker}
          onSelectItem={handleSelectItem}
          onNavigateToFeed={handleNavigateToFeed}
          onNavigateToSettings={handleNavigateToSettings}
          isSettings={route.isSettings}
          isFeed={route.isFeed}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {/* Top navigation */}
          <TopNav
            activeView={route.activeView}
            authenticated={authenticated}
            tier={tier}
            onNavigateToFeed={handleNavigateToFeed}
            onNavigateToTicker={handleNavigateToTicker}
            onNavigateToSettings={handleNavigateToSettings}
            onNavigateToAccount={handleNavigateToAccount}
            onLogin={handleLogin}
          />

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
            <ShellContext.Provider value={shellValue}>
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
