/**
 * Auth state management for the app window.
 *
 * Manages authentication state, login/logout handlers, session expiry
 * tracking, and tier synchronization on dashboard load.
 */
import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  login as authLogin,
  logout as authLogout,
  isAuthenticated as checkAuth,
  getTier,
} from "../auth";
import type { SubscriptionTier } from "../auth";
import type { DashboardResponse } from "../types";

interface AuthState {
  authenticated: boolean;
  tier: SubscriptionTier;
  loggingIn: boolean;
  setLoggingIn: (v: boolean) => void;
  sessionExpired: boolean;
  setSessionExpired: (v: boolean) => void;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  syncAuthFromDashboard: (dashboard: DashboardResponse | undefined) => void;
}

export function useAuthState(
  fetchDashboard: () => void,
): AuthState {
  const [authenticated, setAuthenticated] = useState(() => checkAuth());
  const [tier, setTier] = useState<SubscriptionTier>(() =>
    checkAuth() ? getTier() : "free",
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const authenticatedRef = useRef(authenticated);
  authenticatedRef.current = authenticated;

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

  const syncAuthFromDashboard = useCallback(
    (dashboard: DashboardResponse | undefined) => {
      if (dashboard) {
        const isAuth = checkAuth();
        if (isAuth !== authenticatedRef.current) setAuthenticated(isAuth);
        if (isAuth) setTier(getTier());
      }
    },
    [],
  );

  return {
    authenticated,
    tier,
    loggingIn,
    setLoggingIn,
    sessionExpired,
    setSessionExpired,
    handleLogin,
    handleLogout,
    syncAuthFromDashboard,
  };
}
