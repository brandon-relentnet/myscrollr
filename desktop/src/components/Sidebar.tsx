/**
 * Sidebar — 200px labeled navigation sidebar.
 *
 * Replaces IconRail + TopNav + AppTaskbar. Single navigation system
 * with text labels, clear sections, and a status footer.
 */
import { useMemo } from "react";
import { LayoutDashboard, Settings, User } from "lucide-react";
import clsx from "clsx";
import type { ChannelManifest, WidgetManifest, DeliveryMode } from "../types";
import type { Channel } from "../api/client";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";

// ── EKG heartbeat logo ──────────────────────────────────────────

const EKG_PATH = "M0,8 L6,8 L9,2 L12,14 L15,4 L18,12 L21,8 L32,8";

function EkgLogo({ alive }: { alive: boolean }) {
  return (
    <svg viewBox="0 0 32 16" fill="none" aria-hidden="true" className="w-7 h-4 shrink-0">
      <defs>
        <linearGradient id="sb-grad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="33%" stopColor="#ff4757" />
          <stop offset="66%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="sb-dim" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
          <stop offset="33%" stopColor="#ff4757" stopOpacity="0.15" />
          <stop offset="66%" stopColor="#00d4ff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
        </linearGradient>
        <filter id="sb-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={EKG_PATH}
        stroke={alive ? "url(#sb-dim)" : "var(--color-fg-4)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={clsx(!alive && "opacity-20")}
      />
      {alive && (
        <path
          d={EKG_PATH}
          stroke="url(#sb-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray="20 80"
          className="ekg-trace"
          filter="url(#sb-glow)"
        />
      )}
    </svg>
  );
}

// ── Props ───────────────────────────────────────────────────────

interface SidebarProps {
  /** Currently selected channel/widget ID, or empty string. */
  activeItem: string;
  /** Whether the feed dashboard is active. */
  isFeed: boolean;
  /** Whether the settings page is active. */
  isSettings: boolean;
  /** Whether the account page is active. */
  isAccount: boolean;

  /** User's configured channels from the API. */
  channels: Channel[];
  /** IDs of widgets the user has enabled. */
  enabledWidgets: string[];
  /** All registered channel manifests (static). */
  allChannelManifests: ChannelManifest[];
  /** All registered widget manifests (static). */
  allWidgets: WidgetManifest[];

  /** Current data delivery mode for status footer. */
  deliveryMode: DeliveryMode;
  /** Whether the standalone ticker window is alive. */
  tickerAlive: boolean;

  /** Navigate to a specific channel or widget by ID. */
  onSelectItem: (id: string) => void;
  /** Navigate to the feed dashboard. */
  onNavigateToFeed: () => void;
  /** Navigate to the settings page. */
  onNavigateToSettings: () => void;
  /** Navigate to the account page. */
  onNavigateToAccount: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function Sidebar({
  activeItem,
  isFeed,
  isSettings,
  isAccount,
  channels,
  enabledWidgets,
  allChannelManifests,
  allWidgets,
  deliveryMode,
  tickerAlive,
  onSelectItem,
  onNavigateToFeed,
  onNavigateToSettings,
  onNavigateToAccount,
}: SidebarProps) {
  // Sort channels by canonical order, only show enabled+visible
  const sortedChannels = useMemo(
    () =>
      [...channels]
        .filter((ch) => ch.enabled)
        .sort(
          (a, b) =>
            CHANNEL_ORDER.indexOf(a.channel_type) -
            CHANNEL_ORDER.indexOf(b.channel_type),
        ),
    [channels],
  );

  // Sort widgets by canonical order
  const sortedWidgets = useMemo(
    () =>
      enabledWidgets
        .map((id) => allWidgets.find((w) => w.id === id))
        .filter((w): w is WidgetManifest => w != null)
        .sort(
          (a, b) => WIDGET_ORDER.indexOf(a.id) - WIDGET_ORDER.indexOf(b.id),
        ),
    [enabledWidgets, allWidgets],
  );

  return (
    <aside className="flex flex-col shrink-0 border-r border-edge bg-surface-2 h-full w-[200px] overflow-hidden select-none">
      {/* App header — logo + name */}
      <button
        onClick={onNavigateToFeed}
        aria-label="Scrollr — go to dashboard"
        className={clsx(
          "flex items-center gap-2.5 w-full h-12 px-4 shrink-0 transition-colors",
          isFeed
            ? "border-b border-accent/30 bg-accent/5"
            : tickerAlive
              ? "border-b border-accent/15"
              : "border-b border-edge",
        )}
      >
        <EkgLogo alive={tickerAlive} />
        <span className="text-sm font-semibold text-fg tracking-tight">Scrollr</span>
      </button>

      {/* Navigation items */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-2 px-2">
        {/* Dashboard */}
        <NavItem
          icon={<LayoutDashboard size={15} />}
          label="Dashboard"
          active={isFeed}
          onClick={onNavigateToFeed}
        />

        {/* Channels section */}
        {sortedChannels.length > 0 && (
          <>
            <SectionHeader label="Channels" />
            {sortedChannels.map((ch) => {
              const manifest = allChannelManifests.find(
                (m) => m.id === ch.channel_type,
              );
              const isActive = activeItem === ch.channel_type;
              const Icon = manifest?.icon;
              return (
                <NavItem
                  key={ch.channel_type}
                  icon={
                    Icon ? (
                      <span style={{ color: manifest!.hex }}>
                        <Icon size={15} />
                      </span>
                    ) : (
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: manifest?.hex ?? "var(--color-fg-4)" }}
                      />
                    )
                  }
                  label={manifest?.name ?? ch.channel_type}
                  active={isActive}
                  accentColor={manifest?.hex}
                  onClick={() => onSelectItem(ch.channel_type)}
                />
              );
            })}
          </>
        )}

        {/* Widgets section */}
        {sortedWidgets.length > 0 && (
          <>
            <SectionHeader label="Widgets" />
            {sortedWidgets.map((widget) => {
              const isActive = activeItem === widget.id;
              return (
                <NavItem
                  key={widget.id}
                  icon={
                    <span style={{ color: widget.hex }}>
                      <widget.icon size={15} />
                    </span>
                  }
                  label={widget.name}
                  active={isActive}
                  accentColor={widget.hex}
                  onClick={() => onSelectItem(widget.id)}
                />
              );
            })}
          </>
        )}
      </nav>

      {/* Footer — settings, account, status */}
      <div className="shrink-0 border-t border-edge px-2 py-2 space-y-0.5">
        <NavItem
          icon={<Settings size={15} />}
          label="Settings"
          active={isSettings}
          onClick={onNavigateToSettings}
        />
        <NavItem
          icon={<User size={15} />}
          label="Account"
          active={isAccount}
          onClick={onNavigateToAccount}
        />

        {/* Status footer — informational only */}
        <div className="flex items-center gap-3 px-2.5 pt-2 mt-1 border-t border-edge/30">
          <div className="flex items-center gap-1.5">
            <div
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0",
                deliveryMode === "sse"
                  ? "bg-info"
                  : "bg-warn",
              )}
            />
            <span
              className={clsx(
                "text-[10px] font-mono uppercase tracking-wider",
                deliveryMode === "sse" ? "text-fg-4" : "text-fg-4",
              )}
            >
              {deliveryMode === "sse" ? "Live" : "Polling"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500",
                tickerAlive
                  ? "bg-accent"
                  : "bg-fg-4/30",
              )}
            />
            <span className="text-[10px] font-mono uppercase tracking-wider text-fg-4">
              {tickerAlive ? "Ticker" : "Off"}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ── Section header ──────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-4 mt-4 mb-1 px-2.5">
      {label}
    </h3>
  );
}

// ── Nav item ────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  accentColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  accentColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={clsx(
        "relative flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors",
        active
          ? "bg-accent/10 text-fg"
          : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
      )}
    >
      {/* Active indicator — left accent bar */}
      {active && (
        <span
          className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full"
          style={{ background: accentColor ?? "var(--color-accent)" }}
        />
      )}
      <span className="shrink-0 flex items-center justify-center w-5 h-5">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
