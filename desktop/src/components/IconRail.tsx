/**
 * IconRail — slim 48px icon-only sidebar.
 *
 * Replaces the old collapsible Sidebar. Always icon-only, no expand state.
 * Channel/widget icons with tooltips, active indicator via left accent bar.
 * Adding channels/widgets happens on the dashboard, not here.
 */
import { useMemo } from "react";
import { Settings } from "lucide-react";
import clsx from "clsx";
import type { ChannelManifest, WidgetManifest } from "../types";
import type { Channel } from "../api/client";

// ── Canonical display orders ────────────────────────────────────

const CHANNEL_ORDER = ["finance", "sports", "rss", "fantasy"];
const WIDGET_ORDER = ["clock", "weather", "sysmon"];

// ── EKG heartbeat path ──────────────────────────────────────────

const EKG_PATH = "M0,8 L6,8 L9,2 L12,14 L15,4 L18,12 L21,8 L32,8";

function EkgLogo({ alive }: { alive: boolean }) {
  return (
    <svg viewBox="0 0 32 16" fill="none" aria-hidden="true" className="w-8 h-5 shrink-0">
      <defs>
        <linearGradient id="rail-grad" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="33%" stopColor="#ff4757" />
          <stop offset="66%" stopColor="#00d4ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="rail-dim" x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
          <stop offset="33%" stopColor="#ff4757" stopOpacity="0.15" />
          <stop offset="66%" stopColor="#00d4ff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
        </linearGradient>
        <filter id="rail-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={EKG_PATH}
        stroke={alive ? "url(#rail-dim)" : "var(--color-fg-4)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={clsx(!alive && "opacity-20")}
      />
      {alive && (
        <path
          d={EKG_PATH}
          stroke="url(#rail-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray="20 80"
          className="ekg-trace"
          filter="url(#rail-glow)"
        />
      )}
    </svg>
  );
}

// ── Props ───────────────────────────────────────────────────────

interface IconRailProps {
  /** User's added channels (from API). */
  channels: Channel[];
  /** All registered channel manifests. */
  allChannelManifests: ChannelManifest[];
  /** All registered widget manifests. */
  allWidgets: WidgetManifest[];
  /** IDs of enabled widgets. */
  enabledWidgets: string[];
  /** Currently active item ID. */
  activeItem: string;
  /** Whether the standalone ticker is alive (for EKG animation). */
  tickerAlive: boolean;
  /** Navigate to a source or the feed dashboard. */
  onSelectItem: (id: string) => void;
  /** Navigate to the feed dashboard. */
  onNavigateToFeed: () => void;
  /** Navigate to settings. */
  onNavigateToSettings: () => void;
  /** Whether we're on the settings page. */
  isSettings: boolean;
  /** Whether we're on the feed dashboard. */
  isFeed: boolean;
}

// ── Component ───────────────────────────────────────────────────

export default function IconRail({
  channels,
  allChannelManifests,
  allWidgets,
  enabledWidgets,
  activeItem,
  tickerAlive,
  onSelectItem,
  onNavigateToFeed,
  onNavigateToSettings,
  isSettings,
  isFeed,
}: IconRailProps) {
  // Sort channels and widgets by canonical order
  const sortedChannels = useMemo(
    () =>
      [...channels].sort(
        (a, b) =>
          CHANNEL_ORDER.indexOf(a.channel_type) -
          CHANNEL_ORDER.indexOf(b.channel_type),
      ),
    [channels],
  );

  const sortedEnabledWidgets = useMemo(
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
    <aside className="flex flex-col items-center shrink-0 border-r border-edge bg-surface-2 h-full w-[48px] overflow-hidden">
      {/* Logo — click to go to Feed dashboard */}
      <button
        onClick={onNavigateToFeed}
        aria-label="Scrollr — go to dashboard"
        title="Dashboard"
        className={clsx(
          "relative flex items-center justify-center w-full h-12 shrink-0 cursor-pointer transition-all duration-500",
          isFeed
            ? "border-b border-accent/30 bg-accent/5"
            : tickerAlive
              ? "border-b border-accent/15"
              : "border-b border-edge",
        )}
      >
        <EkgLogo alive={tickerAlive} />
      </button>

      {/* Source icons */}
      <div className="flex flex-col items-center gap-0.5 py-3 w-full flex-1 overflow-y-auto scrollbar-thin">
        {/* Channel icons */}
        {sortedChannels.map((ch) => {
          const manifest = allChannelManifests.find(
            (m) => m.id === ch.channel_type,
          );
          const isActive = activeItem === ch.channel_type;
          const Icon = manifest?.icon;
          return (
             <button
              key={ch.channel_type}
              onClick={() => onSelectItem(ch.channel_type)}
              aria-label={manifest?.name ?? ch.channel_type}
              title={manifest?.name ?? ch.channel_type}
              className={clsx(
                "relative w-8 h-8 flex items-center justify-center rounded-md transition-colors shrink-0",
                isActive
                  ? "bg-accent/10"
                  : "hover:bg-surface-hover",
              )}
            >
              {/* Active indicator — left accent bar */}
              {isActive && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                  style={{ background: manifest?.hex ?? "var(--color-accent)" }}
                />
              )}
              {Icon ? (
                <span style={{ color: manifest!.hex }}>
                  <Icon size={16} />
                </span>
              ) : (
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "var(--color-fg-4)" }}
                />
              )}
            </button>
          );
        })}

        {/* Separator */}
        {sortedChannels.length > 0 && sortedEnabledWidgets.length > 0 && (
          <div className="w-4 h-px bg-edge my-1 shrink-0" />
        )}

        {/* Widget icons */}
        {sortedEnabledWidgets.map((widget) => {
          const isActive = activeItem === widget.id;
          return (
            <button
              key={widget.id}
              onClick={() => onSelectItem(widget.id)}
              aria-label={widget.name}
              title={widget.name}
              className={clsx(
                "relative w-8 h-8 flex items-center justify-center rounded-md transition-colors shrink-0",
                isActive
                  ? "bg-accent/10"
                  : "hover:bg-surface-hover",
              )}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
                  style={{ background: widget.hex }}
                />
              )}
              <span style={{ color: widget.hex }}>
                <widget.icon size={16} />
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer — settings */}
      <div className="flex flex-col items-center py-2 gap-1 border-t border-edge shrink-0 w-full">
        <button
          onClick={onNavigateToSettings}
          aria-label="Settings"
          title="Settings"
          className={clsx(
            "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
            isSettings
              ? "text-accent bg-accent/10"
              : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
          )}
        >
          <Settings size={16} />
        </button>
      </div>
    </aside>
  );
}
