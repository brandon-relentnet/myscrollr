import {
  Activity,
  Layers,
  LayoutGrid,
  Settings,
  User,
} from "lucide-react";
import clsx from "clsx";

export type Section = "feed" | "channels" | "dashboard" | "settings" | "account";

interface SidebarProps {
  active: Section;
  onNavigate: (section: Section) => void;
  tickerAlive: boolean;
  onToggleTicker: () => void;
}

const NAV_ITEMS: { id: Section; label: string; icon: typeof Activity }[] = [
  { id: "feed", label: "Feed", icon: Activity },
  { id: "channels", label: "Channels", icon: Layers },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "settings", label: "Settings", icon: Settings },
  { id: "account", label: "Account", icon: User },
];

// EKG heartbeat path — exaggerated peaks for visual impact
const EKG_PATH = "M0,8 L6,8 L9,2 L12,14 L15,4 L18,12 L21,8 L32,8";

export default function Sidebar({
  active,
  onNavigate,
  tickerAlive,
  onToggleTicker,
}: SidebarProps) {
  return (
    <aside className="flex flex-col w-[200px] shrink-0 border-r border-edge bg-surface-2 h-full">
      {/* Logo + ticker control — single row, tall for presence */}
      <div
        className={clsx(
          "relative flex items-center gap-3 px-4 h-16 shrink-0 overflow-hidden transition-all duration-500",
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
              "radial-gradient(ellipse at 20% 50%, rgba(52,211,153,0.07) 0%, transparent 75%)",
          }}
        />

        {/* EKG monitor — large */}
        <svg viewBox="0 0 32 16" fill="none" className="relative w-11 h-7 shrink-0">
          <defs>
            {/* Channel color gradient: finance → sports → rss → fantasy */}
            <linearGradient id="ekg-grad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="33%" stopColor="#ff4757" />
              <stop offset="66%" stopColor="#00d4ff" />
              <stop offset="100%" stopColor="#a855f7" />
            </linearGradient>
            {/* Dim version for the base trace */}
            <linearGradient id="ekg-grad-dim" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
              <stop offset="33%" stopColor="#ff4757" stopOpacity="0.15" />
              <stop offset="66%" stopColor="#00d4ff" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
            </linearGradient>
            {/* Glow filter — blurs rendered colors for a color-matched halo */}
            <filter id="ekg-glow">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Base trace — dim gradient, always visible */}
          <path
            d={EKG_PATH}
            stroke={tickerAlive ? "url(#ekg-grad-dim)" : "var(--color-fg-4)"}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={clsx(!tickerAlive && "opacity-20")}
          />
          {/* Animated bright sweep — gradient glow */}
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
            "font-mono text-[15px] font-bold tracking-[0.15em] uppercase select-none transition-colors duration-500 min-w-0",
            tickerAlive ? "text-fg" : "text-fg-3",
          )}
        >
          scrollr
        </span>

        {/* Toggle switch — pushed right */}
        <button
          role="switch"
          aria-checked={tickerAlive}
          aria-label="Toggle ticker widget"
          className="toggle-switch relative z-10 ml-auto"
          data-checked={tickerAlive}
          onClick={onToggleTicker}
        />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1 p-2 flex-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              active === id
                ? "bg-accent/10 text-accent"
                : "text-fg-2 hover:text-fg hover:bg-surface-hover",
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      {/* Version */}
      <div className="px-4 py-3 border-t border-edge">
        <span className="text-[10px] font-mono text-fg-4">v0.1.0</span>
      </div>
    </aside>
  );
}
