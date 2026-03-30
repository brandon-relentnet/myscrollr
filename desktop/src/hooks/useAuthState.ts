/**
 * Auth state management for the app window.
 *
 * Manages authentication state, login/logout handlers, session expiry
 * tracking, and tier synchronization on dashboard load.
 */
import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  login as authLogin,
  logout as authLogout,
  isAuthenticated as checkAuth,
  getTier,
} from "../auth";
import { queryKeys } from "../api/queries";
import type { SubscriptionTier } from "../auth";
import type { DashboardResponse } from "../types";

interface UseAuthStateReturn {
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

export function useAuthState(): UseAuthStateReturn {
  const queryClient = useQueryClient();
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
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      } else {
        toast.error("Sign-in failed — please try again");
      }
    } finally {
      setLoggingIn(false);
    }
  }, [queryClient]);

  const handleLogout = useCallback(async () => {
    await invoke("stop_sse").catch(() => {});
    authLogout();
    setAuthenticated(false);
    setTier("free");
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  }, [queryClient]);

  const syncAuthFromDashboard = useCallback(
    (dashboard: DashboardResponse | undefined) => {
      if (dashboard) {
        const isAuth = checkAuth();
        if (isAuth !== authenticatedRef.current) {
          // Was authenticated and now isn't — show session expired banner
          if (authenticatedRef.current && !isAuth) {
            setSessionExpired(true);
          }
          setAuthenticated(isAuth);
        }
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
