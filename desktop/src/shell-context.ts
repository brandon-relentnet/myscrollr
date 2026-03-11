/**
 * Shell context — shared state between the root layout and child routes.
 *
 * Routes that need preferences, auth state, or shell handlers consume
 * this context via useShell(). The root layout provides it.
 */
import { createContext, useContext } from "react";
import type { AppPreferences } from "./preferences";
import type { SubscriptionTier } from "./auth";

export interface ShellState {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
  authenticated: boolean;
  tier: SubscriptionTier;
  onLogin: () => void;
  onLogout: () => void;
  autostartEnabled: boolean;
  onAutostartChange: (enabled: boolean) => void;
  showAppTicker: boolean;
  onToggleAppTicker: (enabled: boolean) => void;
  showTaskbar: boolean;
  onToggleTaskbar: (enabled: boolean) => void;
  appVersion: string;
  getToken: () => Promise<string | null>;
}

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within RootLayout");
  return ctx;
}
