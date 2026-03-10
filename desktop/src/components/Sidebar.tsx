import {
  Activity,
  Layers,
  LayoutGrid,
  Settings,
  User,
  Palette,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import clsx from "clsx";

export type Section = "feed" | "channels" | "dashboard" | "settings" | "account";
export type SettingsTab = "appearance" | "behavior" | "account";

interface SidebarProps {
  active: Section;
  onNavigate: (section: Section) => void;
  tickerAlive: boolean;
  onToggleTicker: () => void;
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

export default function Sidebar({
  active,
  onNavigate,
  tickerAlive,
  onToggleTicker,
  settingsTab,
  onSettingsTabChange,
  appVersion,
}: SidebarProps) {
  return (
    <aside className="flex flex-col w-[200px] shrink-0 border-r border-edge bg-surface-2 h-full">
      {/* Logo — clickable, toggles the standalone ticker */}
      <button
        onClick={onToggleTicker}
        aria-label="Toggle ticker widget"
        className={clsx(
          "relative flex items-center gap-3 px-4 h-14 shrink-0 overflow-hidden transition-all duration-500 w-full cursor-pointer",
          tickerAlive ? "border-b border-accent/15" : "border-b border-edge",
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
        <svg viewBox="0 0 32 16" fill="none" className="relative w-10 h-6 shrink-0">
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

        {/* Brand */}
        <span
          className={clsx(
            "font-mono text-[15px] font-bold tracking-[0.15em] uppercase select-none transition-colors duration-500",
            tickerAlive ? "text-fg" : "text-fg-3",
          )}
        >
          scrollr
        </span>
      </button>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <div key={id}>
            <button
              onClick={() => onNavigate(id)}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full",
                active === id
                  ? "bg-accent/10 text-accent"
                  : "text-fg-2 hover:text-fg hover:bg-surface-hover",
              )}
            >
              <Icon size={18} strokeWidth={1.75} />
              {label}
            </button>

            {/* Settings sub-items — shown when Settings is active */}
            {id === "settings" && active === "settings" && (
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
        ))}
      </nav>

      {/* Version */}
      {appVersion && (
        <div className="px-4 py-3 border-t border-edge">
          <span className="text-[10px] font-mono text-fg-4">v{appVersion}</span>
        </div>
      )}
    </aside>
  );
}
