/**
 * Sidebar — collapsible labeled navigation sidebar.
 *
 * Replaces IconRail + TopNav + AppTaskbar. Single navigation system
 * with text labels, clear sections, and a status footer.
 * Collapses to a 48px icon-only rail with tooltips.
 */
import { useState, useMemo } from "react";
import { LayoutDashboard, Settings, User, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import clsx from "clsx";
import Tooltip from "./Tooltip";
import type { ChannelManifest, WidgetManifest, DeliveryMode } from "../types";
import type { Channel } from "../api/client";
import { CHANNEL_ORDER } from "../channels/registry";
import { WIDGET_ORDER } from "../widgets/registry";
import { loadPref, savePref } from "../preferences";

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
  const [collapsed, setCollapsed] = useState(() =>
    loadPref("sidebarCollapsed", false),
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    savePref("sidebarCollapsed", next);
  }

  // Sort channels by canonical order, only show enabled
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
    <aside
      className={clsx(
        "flex flex-col shrink-0 border-r border-edge bg-surface-2 h-full overflow-hidden select-none transition-[width] duration-200 ease-out",
        collapsed ? "w-[48px]" : "w-[200px]",
      )}
    >
      {/* App header — logo + name */}
      <Tooltip content={collapsed ? "Dashboard" : undefined} side="right">
      <button
        onClick={onNavigateToFeed}
        aria-label="Scrollr — go to dashboard"
        className={clsx(
          "flex items-center w-full h-12 shrink-0 transition-colors",
          collapsed ? "justify-center px-0" : "gap-2.5 px-4",
          isFeed
            ? "border-b border-accent/30 bg-accent/5"
            : tickerAlive
              ? "border-b border-accent/15"
              : "border-b border-edge",
        )}
      >
        <EkgLogo alive={tickerAlive} />
        {!collapsed && (
          <span className="text-sm font-semibold text-fg tracking-tight">Scrollr</span>
        )}
      </button>
      </Tooltip>

      {/* Navigation items */}
      <nav
        aria-label="Main navigation"
        className={clsx(
          "flex-1 overflow-y-auto scrollbar-thin py-2",
          collapsed ? "px-1" : "px-2",
        )}
      >
        {/* Dashboard */}
        <NavItem
          icon={<LayoutDashboard size={15} />}
          label="Dashboard"
          active={isFeed}
          collapsed={collapsed}
          onClick={onNavigateToFeed}
        />

        {/* Channels section */}
        {sortedChannels.length > 0 && (
          <>
            {!collapsed && <SectionHeader label="Channels" />}
            {collapsed && <Divider />}
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
                  collapsed={collapsed}
                  onClick={() => onSelectItem(ch.channel_type)}
                />
              );
            })}
          </>
        )}

        {/* Widgets section */}
        {sortedWidgets.length > 0 && (
          <>
            {!collapsed && <SectionHeader label="Widgets" />}
            {collapsed && <Divider />}
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
                  collapsed={collapsed}
                  onClick={() => onSelectItem(widget.id)}
                />
              );
            })}
          </>
        )}
      </nav>

      {/* Footer — settings, account, collapse toggle, status */}
      <div
        className={clsx(
          "shrink-0 border-t border-edge py-2 space-y-0.5",
          collapsed ? "px-1" : "px-2",
        )}
      >
        <NavItem
          icon={<Settings size={15} />}
          label="Settings"
          active={isSettings}
          collapsed={collapsed}
          onClick={onNavigateToSettings}
        />
        <NavItem
          icon={<User size={15} />}
          label="Account"
          active={isAccount}
          collapsed={collapsed}
          onClick={onNavigateToAccount}
        />

        {/* Collapse toggle */}
        <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={clsx(
            "flex items-center w-full rounded-lg text-fg-4 hover:text-fg-2 hover:bg-surface-hover transition-colors",
            collapsed
              ? "justify-center py-1.5"
              : "gap-2.5 px-2.5 py-1.5",
          )}
        >
          <span className="shrink-0 flex items-center justify-center w-5 h-5">
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </span>
          {!collapsed && (
            <span className="text-[12px] font-medium">Collapse</span>
          )}
        </button>
        </Tooltip>

        {/* Status footer — informational only */}
        <div
          className={clsx(
            "flex items-center pt-2 mt-1 border-t border-edge/30",
            collapsed ? "flex-col gap-1.5 px-0 justify-center" : "gap-3 px-2.5",
          )}
        >
          <Tooltip content={deliveryMode === "sse" ? "Receiving updates live" : "Polling for updates"} side="right">
          <div
            className="flex items-center gap-1.5"
          >
            <div
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0",
                deliveryMode === "sse"
                  ? "bg-info"
                  : "bg-warn",
              )}
            />
            {!collapsed && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-fg-4">
                {deliveryMode === "sse" ? "Live" : "Polling"}
              </span>
            )}
          </div>
          </Tooltip>
          <Tooltip content={tickerAlive ? "Ticker is running" : "Ticker is off"} side="right">
          <div
            className="flex items-center gap-1.5"
          >
            <div
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-500",
                tickerAlive
                  ? "bg-accent"
                  : "bg-fg-4/30",
              )}
            />
            {!collapsed && (
              <span className="text-[10px] font-mono uppercase tracking-wider text-fg-4">
                {tickerAlive ? "Ticker" : "Off"}
              </span>
            )}
          </div>
          </Tooltip>
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

// ── Divider (collapsed mode separator) ──────────────────────────

function Divider() {
  return <div className="w-5 h-px bg-edge mx-auto my-2 shrink-0" />;
}

// ── Nav item ────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  accentColor,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  accentColor?: string;
  collapsed?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={collapsed ? label : undefined} side="right">
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={clsx(
        "relative flex items-center w-full rounded-lg font-medium transition-colors",
        collapsed
          ? "justify-center py-1.5 px-0"
          : "gap-2.5 px-2.5 py-1.5 text-[13px]",
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
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
    </Tooltip>
  );
}
