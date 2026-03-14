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

// ── Scroll S logo ───────────────────────────────────────────────
// Solid mint when idle; animated channel-color gradient + glow when alive.

const SCROLL_PATH =
  "M4870 6321 c-100 -32 -157 -70 -215 -140 l-29 -36 41 37 c329 291 807 -68 501 -375 -132 -132 -60 -130 -1750 -66 -1538 57 -1544 57 -1792 9 -1687 -328 -1763 -2552 -101 -2980 253 -65 227 -64 1750 -65 1531 0 1427 4 1568 -66 371 -184 376 -666 9 -858 -160 -83 43 -75 -2157 -81 -2131 -6 -2047 -4 -2225 -61 -234 -74 -312 -243 -250 -539 54 -254 193 -701 256 -821 145 -275 578 -316 759 -72 l28 38 -39 -36 c-279 -257 -732 -25 -564 289 84 158 228 208 560 195 354 -13 3176 -93 3313 -93 895 0 1529 475 1690 1264 188 928 -386 1701 -1383 1862 -108 18 -198 19 -1510 19 l-1395 0 -78 22 c-556 158 -528 849 38 968 60 12 287 15 1525 15 1678 0 1780 4 1990 72 190 61 284 172 283 333 -2 156 -215 857 -302 991 -105 164 -326 238 -521 175z";

function ScrollLogo({ alive }: { alive: boolean }) {
  return (
    <svg
      viewBox="0 0 639 639"
      aria-hidden="true"
      className={clsx("w-6 h-6 shrink-0", alive && "scroll-logo-alive")}
    >
      {alive && (
        <defs>
          <linearGradient id="sb-scroll-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%">
              <animate
                attributeName="stop-color"
                values="#34d399;#ff4757;#00d4ff;#a855f7;#34d399"
                dur="8s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="50%">
              <animate
                attributeName="stop-color"
                values="#00d4ff;#a855f7;#34d399;#ff4757;#00d4ff"
                dur="8s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%">
              <animate
                attributeName="stop-color"
                values="#a855f7;#34d399;#ff4757;#00d4ff;#a855f7"
                dur="8s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
        </defs>
      )}
      <g
        transform="translate(0,639) scale(0.1,-0.1)"
        fill={alive ? "url(#sb-scroll-grad)" : "var(--color-primary)"}
        stroke="none"
      >
        <path d={SCROLL_PATH} />
      </g>
      <circle cx="492" cy="39" r="20" fill="var(--color-fg)" className={clsx(!alive && "opacity-60")} />
      <circle cx="97" cy="599" r="20" fill="var(--color-fg)" className={clsx(!alive && "opacity-60")} />
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
          <ScrollLogo alive={tickerAlive} />
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
            <div className="flex items-center gap-1.5">
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
            <div className="flex items-center gap-1.5">
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
