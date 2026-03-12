/**
 * Shell context — shared state between the root layout and child routes.
 *
 * Routes that need preferences, auth state, or shell handlers consume
 * this context via useShell(). The root layout provides it.
 */
import { createContext, useContext } from "react";
import type { AppPreferences } from "./preferences";
import type { SubscriptionTier } from "./auth";
import type { ChannelType, Channel } from "./api/client";
import type { DashboardResponse } from "./types";
import type { ChannelManifest, WidgetManifest } from "./types";

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

  // ── Navigation overhaul additions ──────────────────────────────
  /** User's channel records from the dashboard API. */
  channels: Channel[];
  /** Dashboard query response (for initial data snapshots). */
  dashboard: DashboardResponse | undefined;
  /** All registered channel manifests (static). */
  allChannelManifests: ChannelManifest[];
  /** All registered widget manifests (static). */
  allWidgets: WidgetManifest[];
  /** Toggle a channel's visibility on the ticker. */
  onToggleChannelTicker: (channelType: ChannelType, visible: boolean) => void;
  /** Toggle a widget's presence on the ticker. */
  onToggleWidgetTicker: (widgetId: string) => void;
  /** Add a new channel via API. */
  onAddChannel: (channelType: ChannelType) => void;
  /** Delete a channel via API. */
  onDeleteChannel: (channelType: ChannelType) => void;
  /** Toggle a widget on/off entirely. */
  onToggleWidget: (widgetId: string) => void;
  /** Refetch the dashboard data. */
  fetchDashboard: () => void;
  /** Navigate to a source by ID. */
  onSelectItem: (id: string) => void;
}

export const ShellContext = createContext<ShellState | null>(null);

export function useShell(): ShellState {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within RootLayout");
  return ctx;
}
