import { useState } from "react";
import {
  Activity,
  Layers,
  LayoutGrid,
  Settings,
  User,
  Palette,
  SlidersHorizontal,
  UserCog,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import clsx from "clsx";
import { loadPref, savePref } from "../preferences";

export type Section = "feed" | "channels" | "dashboard" | "settings" | "account";
export type SettingsTab = "appearance" | "behavior" | "account";

interface SidebarProps {
  active: Section;
  onNavigate: (section: Section) => void;
  tickerAlive: boolean;
  settingsTab: SettingsTab;
  onSettingsTabChange: (tab: SettingsTab) => void;
  appVersion?: string;
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "feed", label: "Feed", icon: Activity },
  { id: "channels", label: "Channels", icon: Layers },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "account", label: "Account", icon: User },
];

const SETTINGS_SUBS: { id: SettingsTab; label: string; icon: typeof Palette }[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "behavior", label: "Behavior", icon: SlidersHorizontal },
  { id: "account", label: "Account", icon: UserCog },
];

// EKG heartbeat path — exaggerated peaks for visual impact
const EKG_PATH = "M0,8 L6,8 L9,2 L12,14 L15,4 L18,12 L21,8 L32,8";

// Platform-aware modifier key for shortcut hints
const MOD =
  ((navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS" ||
  /Mac/.test(navigator.platform))
    ? "\u2318"
    : "Ctrl+";

export default function Sidebar({
  active,
  onNavigate,
  tickerAlive,
  settingsTab,
  onSettingsTabChange,
  appVersion,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => loadPref("sidebarCollapsed", false),
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    savePref("sidebarCollapsed", next);
  }

  return (
    <aside
      className={clsx(
        "flex flex-col shrink-0 border-r border-edge bg-surface-2 h-full transition-[width] duration-200 ease-out overflow-hidden",
        collapsed ? "w-[52px]" : "w-[200px]",
      )}
    >
      {/* Logo — navigates to Feed */}
      <button
        onClick={() => onNavigate("feed")}
        aria-label="Go to Feed"
        title={collapsed ? "Scrollr — Go to Feed" : undefined}
        className={clsx(
          "relative flex items-center gap-3 px-4 h-14 shrink-0 overflow-hidden transition-all duration-500 w-full cursor-pointer",
          tickerAlive ? "border-b border-accent/15" : "border-b border-edge",
          collapsed && "justify-center px-0",
        )}
      >
        {/* Ambient radial glow (only when live) */}
        <div
          className={clsx(
            "absolute inset-0 pointer-events-none transition-opacity duration-700",
            tickerAlive ? "opacity-100" : "opacity-0",
          )}
          style={{
            background:
              "radial-gradient(ellipse at 25% 50%, rgba(52,211,153,0.07) 0%, transparent 75%)",
          }}
        />

        {/* EKG monitor */}
        <svg
          viewBox="0 0 32 16"
          fill="none"
          aria-hidden="true"
          className="relative w-10 h-6 shrink-0"
        >
          <defs>
            <linearGradient id="ekg-grad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="33%" stopColor="#ff4757" />
              <stop offset="66%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            <linearGradient id="ekg-grad-dim" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
              <stop offset="33%" stopColor="#ff4757" stopOpacity="0.15" />
              <stop offset="66%" stopColor="#00d4ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
            </linearGradient>
            <filter id="ekg-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path
            d={EKG_PATH}
            stroke={tickerAlive ? "url(#ekg-grad-dim)" : "var(--color-fg-4)"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx(!tickerAlive && "opacity-20")}
          />
          {tickerAlive && (
            <path
              d={EKG_PATH}
              stroke="url(#ekg-grad)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              strokeDasharray="20 80"
              className="ekg-trace"
              filter="url(#ekg-glow)"
            />
          )}
        </svg>

        {/* Brand (hidden when collapsed) */}
        {!collapsed && (
          <span
            className={clsx(
              "font-mono text-[15px] font-bold tracking-[0.15em] uppercase select-none transition-colors duration-500 whitespace-nowrap",
              tickerAlive ? "text-fg" : "text-fg-3",
            )}
          >
            scrollr
          </span>
        )}
      </button>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex flex-col gap-1 p-2 flex-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }, idx) => {
          const shortcut = `${MOD}${idx + 1}`;
          return (
          <div key={id}>
            <button
              onClick={() => onNavigate(id)}
              title={collapsed ? `${label}  (${shortcut})` : shortcut}
              className={clsx(
                "flex items-center gap-3 rounded-lg text-sm font-medium transition-colors w-full",
                collapsed ? "justify-center px-0 py-2" : "px-3 py-2",
                active === id
                  ? "bg-accent/10 text-accent"
                  : "text-fg-2 hover:text-fg hover:bg-surface-hover",
              )}
            >
              <Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {!collapsed && label}
            </button>

            {/* Settings sub-items — shown when Settings is active and not collapsed */}
            {!collapsed && id === "settings" && active === "settings" && (
              <div className="flex flex-col gap-0.5 mt-1 ml-4 pl-3 border-l border-edge/50">
                {SETTINGS_SUBS.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => onSettingsTabChange(sub.id)}
                    className={clsx(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors w-full",
                      settingsTab === sub.id
                        ? "text-accent bg-accent/5"
                        : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                    )}
                  >
                    <sub.icon size={14} strokeWidth={1.75} />
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
        })}
      </nav>

      {/* Footer: collapse toggle + version */}
      <div className={clsx(
        "border-t border-edge shrink-0",
        collapsed ? "flex flex-col items-center py-2 gap-1" : "flex items-center justify-between px-4 py-3",
      )}>
        {!collapsed && appVersion && (
          <span className="text-[11px] font-mono text-fg-4">v{appVersion}</span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex items-center justify-center w-7 h-7 rounded-md text-fg-4 hover:text-fg-2 hover:bg-surface-hover transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>
    </aside>
  );
}
