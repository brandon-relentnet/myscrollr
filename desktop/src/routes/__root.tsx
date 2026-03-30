/**
 * Root layout route — the persistent app shell.
 *
 * Renders TitleBar + Sidebar + content <Outlet />.
 * Single navigation paradigm via the labeled Sidebar component.
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
import {
  enable as enableAutostart,
  disable as disableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import clsx from "clsx";
import { Toaster, toast } from "sonner";

// Shell components
import TitleBar from "../components/TitleBar";
import Sidebar from "../components/Sidebar";

// Registries
import { getAllChannels } from "../channels/registry";
import { getAllWidgets, getWidget } from "../widgets/registry";

// Data
import { dashboardQueryOptions } from "../api/queries";

// Preferences
import {
  loadPref,
  loadPrefs,
  savePrefs,
} from "../preferences";
import type { AppPreferences } from "../preferences";

// Types
import type { DeliveryMode } from "../types";
import type { Channel } from "../api/client";

// Hooks
import { useTheme } from "../hooks/useTheme";
import { useAuthState } from "../hooks/useAuthState";
import { useChannelActions } from "../hooks/useChannelActions";
import { useWidgetActions } from "../hooks/useWidgetActions";

// Shell context
import { ShellContext, ShellDataContext } from "../shell-context";

// Store
import { onStoreChange } from "../lib/store";

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

function parseRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  const [kind, itemId] = segments;

  if (kind === "feed" || pathname === "/") {
    return {
      activeItem: "",
      isChannel: false, isWidget: false, isFeed: true,
      isTicker: false, isSettings: false, isAccount: false,
      isMarketplace: false,
    };
  }
  if (kind === "channel" && itemId) {
    return {
      activeItem: itemId,
      isChannel: true, isWidget: false, isFeed: false,
      isTicker: false, isSettings: false, isAccount: false,
      isMarketplace: false,
    };
  }
  if (kind === "widget" && itemId) {
    return {
      activeItem: itemId,
      isChannel: false, isWidget: true, isFeed: false,
      isTicker: false, isSettings: false, isAccount: false,
      isMarketplace: false,
    };
  }
  if (kind === "ticker") {
    return {
      activeItem: "ticker",
      isChannel: false, isWidget: false, isFeed: false,
      isTicker: true, isSettings: false, isAccount: false,
      isMarketplace: false,
    };
  }
  if (kind === "catalog") {
    return {
      activeItem: "",
      isChannel: false, isWidget: false, isFeed: false,
      isTicker: false, isSettings: false, isAccount: false,
      isMarketplace: true,
    };
  }
  if (kind === "settings") {
    return {
      activeItem: "settings",
      isChannel: false, isWidget: false, isFeed: false,
      isTicker: false, isSettings: true, isAccount: false,
      isMarketplace: false,
    };
  }
  if (kind === "account") {
    return {
      activeItem: "",
      isChannel: false, isWidget: false, isFeed: false,
      isTicker: false, isSettings: false, isAccount: true,
      isMarketplace: false,
    };
  }
  return {
    activeItem: "",
    isChannel: false, isWidget: false, isFeed: true,
    isTicker: false, isSettings: false, isAccount: false,
    isMarketplace: false,
  };
}

// ── Root Layout ─────────────────────────────────────────────────

function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = parseRoute(location.pathname);

  // ── Dashboard data (TanStack Query) ─────────────────────────
  const {
    data: dashboard,
    isLoading: loading,
  } = useQuery(dashboardQueryOptions());

  const channels: Channel[] = useMemo(() => dashboard?.channels ?? [], [dashboard]);

  // Filter to enabled channels only — Sidebar handles sorting by CHANNEL_ORDER
  const enabledChannels = useMemo(
    () => channels.filter((ch) => ch.enabled),
    [channels],
  );

  // ── Manifests ───────────────────────────────────────────────
  const allChannelManifests = useMemo(() => getAllChannels(), []);
  const allWidgets = useMemo(() => getAllWidgets(), []);

  // ── Preferences ─────────────────────────────────────────────
  const [prefs, setPrefs] = useState<AppPreferences>(loadPrefs);
  const [autostartOn, setAutostartOn] = useState(false);
  const enabledWidgets = prefs.widgets.enabledWidgets;

  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(() =>
    loadPref<DeliveryMode>("deliveryMode", "polling"),
  );

  // ── Extracted hooks ─────────────────────────────────────────

  const auth = useAuthState();
  const channelActions = useChannelActions();
  const widgetActions = useWidgetActions(prefs, setPrefs, route.activeItem);

  // Apply theme + UI scale
  useTheme("app-shell", prefs.appearance.theme, prefs.appearance.uiScale);

  // ── Auth sync — refresh tier on dashboard load ──────────────
  useEffect(() => {
    auth.syncAuthFromDashboard(dashboard);
  }, [dashboard]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve empty route — redirect / to /feed ───────────────
  useEffect(() => {
    if (location.pathname === "/" && !loading) {
      navigate({ to: "/feed" });
    }
  }, [location.pathname, loading, navigate]);

  // ── Cross-window sync ───────────────────────────────────────
  useEffect(() => {
    const unsub1 = onStoreChange<AppPreferences>("scrollr:settings", (val) => {
      if (val) setPrefs(val);
    });
    const unsub2 = onStoreChange<DeliveryMode>("scrollr:deliveryMode", (val) => {
      if (val) setDeliveryMode(val);
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    isAutostartEnabled().then(setAutostartOn).catch(() => {});
  }, []);

  // ── Navigation handlers ─────────────────────────────────────

  // Keep a ref to channels so handleSelectItem doesn't depend on
  // the volatile `channels` array, which changes every dashboard refetch.
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const handleSelectItem = useCallback(
    (id: string) => {
      if (id === "settings") {
        navigate({ to: "/settings" });
        return;
      }
      if (channelsRef.current.some((ch) => ch.channel_type === id)) {
        navigate({ to: "/channel/$type/$tab", params: { type: id, tab: "feed" } });
        return;
      }
      if (getWidget(id)) {
        navigate({ to: "/widget/$id/$tab", params: { id, tab: "feed" } });
        return;
      }
      navigate({ to: "/feed" });
    },
    [navigate],
  );

  const handleNavigateToFeed = useCallback(() => navigate({ to: "/feed" }), [navigate]);
  const handleNavigateToTicker = useCallback(() => navigate({ to: "/ticker" }), [navigate]);
  const handleNavigateToSettings = useCallback(() => navigate({ to: "/settings" }), [navigate]);
  const handleNavigateToAccount = useCallback(() => navigate({ to: "/account" }), [navigate]);
  const handleNavigateToMarketplace = useCallback(() => navigate({ to: "/catalog" }), [navigate]);

  // ── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+, → open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        navigate({ to: "/settings" });
        return;
      }

      // Ctrl+T → toggle standalone ticker visibility
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "t") {
        e.preventDefault();
        const next = {
          ...prefs,
          ticker: { ...prefs.ticker, showTicker: !prefs.ticker.showTicker },
        };
        setPrefs(next);
        savePrefs(next);
        return;
      }

      // Ctrl+Shift+T → cycle theme
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "T") {
        e.preventDefault();
        const cycle: Record<string, string> = { dark: "light", light: "system", system: "dark" };
        const nextTheme = cycle[prefs.appearance.theme] ?? "dark";
        const next = {
          ...prefs,
          appearance: { ...prefs.appearance, theme: nextTheme as AppPreferences["appearance"]["theme"] },
        };
        setPrefs(next);
        savePrefs(next);
        return;
      }

      if (e.key === "Escape") {
        if (auth.loggingIn) { auth.setLoggingIn(false); return; }
        if (auth.sessionExpired) { auth.setSessionExpired(false); return; }
        if (route.isChannel || route.isWidget) {
          const segments = location.pathname.split("/").filter(Boolean);
          const tab = segments[2];
          if (tab && tab !== "feed") {
            if (route.isChannel) {
              navigate({ to: "/channel/$type/$tab", params: { type: route.activeItem, tab: "feed" } });
            } else {
              navigate({ to: "/widget/$id/$tab", params: { id: route.activeItem, tab: "feed" } });
            }
            return;
          }
          navigate({ to: "/feed" });
          return;
        }
        if (route.isSettings || route.isAccount) {
          navigate({ to: "/feed" });
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [auth.loggingIn, auth.sessionExpired, route, location.pathname, navigate, prefs]); // eslint-disable-line react-hooks/exhaustive-deps

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
      toast.error("Couldn't update startup settings");
    }
  }, []);

  // ── Shell context values (split: stable + volatile) ────────

  const shellStableValue = useMemo(
    () => ({
      prefs,
      onPrefsChange: handlePrefsChange,
      authenticated: auth.authenticated,
      tier: auth.tier,
      onLogin: auth.handleLogin,
      onLogout: auth.handleLogout,
      autostartEnabled: autostartOn,
      onAutostartChange: handleAutostartChange,
      appVersion,
      allChannelManifests,
      allWidgets,
      onToggleChannelTicker: channelActions.handleToggleChannel,
      onToggleWidgetTicker: widgetActions.handleToggleWidgetTicker,
      onAddChannel: channelActions.handleAddChannel,
      onDeleteChannel: channelActions.handleDeleteChannel,
      onToggleWidget: widgetActions.handleToggleWidget,
      onSelectItem: handleSelectItem,
    }),
    [
      prefs, handlePrefsChange, auth.authenticated, auth.tier,
      auth.handleLogin, auth.handleLogout, autostartOn, handleAutostartChange,
      appVersion, allChannelManifests, allWidgets,
      channelActions.handleToggleChannel, widgetActions.handleToggleWidgetTicker,
      channelActions.handleAddChannel, channelActions.handleDeleteChannel,
      widgetActions.handleToggleWidget, handleSelectItem,
    ],
  );

  const shellDataValue = useMemo(
    () => ({ channels, dashboard }),
    [channels, dashboard],
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
        <Sidebar
          activeItem={route.activeItem}
          isFeed={route.isFeed}
          isTicker={route.isTicker}
          isSettings={route.isSettings}
          isAccount={route.isAccount}
          isMarketplace={route.isMarketplace}
          channels={enabledChannels}
          enabledWidgets={enabledWidgets}
          allChannelManifests={allChannelManifests}
          allWidgets={allWidgets}
          deliveryMode={deliveryMode}
          tickerAlive={prefs.ticker.showTicker}
          onSelectItem={handleSelectItem}
          onNavigateToFeed={handleNavigateToFeed}
          onNavigateToTicker={handleNavigateToTicker}
          onNavigateToSettings={handleNavigateToSettings}
          onNavigateToAccount={handleNavigateToAccount}
          onNavigateToMarketplace={handleNavigateToMarketplace}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {auth.sessionExpired && (
            <div className="flex items-center justify-between px-4 py-2 bg-warn/10 border-b border-warn/20 shrink-0">
              <span className="text-xs text-warn">
                Your session has expired. Sign in again to access your channels.
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  onClick={auth.handleLogin}
                  className="text-xs font-medium text-warn hover:text-fg transition-colors"
                >
                  Sign in
                </button>
                <button
                  onClick={() => auth.setSessionExpired(false)}
                  className="text-xs text-fg-4 hover:text-fg-3 transition-colors"
                  aria-label="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <ShellContext.Provider value={shellStableValue}>
              <ShellDataContext.Provider value={shellDataValue}>
                <Outlet />
              </ShellDataContext.Provider>
            </ShellContext.Provider>
          </div>

          <Toaster theme="dark" richColors position="bottom-right" />

          {auth.loggingIn && (
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
                  onClick={() => auth.setLoggingIn(false)}
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
