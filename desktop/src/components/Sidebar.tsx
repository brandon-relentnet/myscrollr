import { useState, useRef, useEffect, useCallback } from "react";
import { Settings, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import clsx from "clsx";
import type { Channel, ChannelType } from "../api/client";
import type { ChannelManifest } from "@/channels/types";
import type { WidgetManifest } from "~/widgets/types";
import { loadPref, savePref } from "../preferences";

// ── Types ───────────────────────────────────────────────────────

export type SettingsTab = "general" | "ticker" | "account";

interface SidebarProps {
  /** User's added channels (from API) */
  channels: Channel[];
  /** All available channel manifests (for "+" popover) */
  allChannelManifests: ChannelManifest[];
  /** All registered widget manifests */
  allWidgets: WidgetManifest[];
  /** IDs of enabled widgets (from prefs) */
  enabledWidgets: string[];
  /** Currently selected item ID (channel ID, widget ID, or "settings") */
  activeItem: string;
  /** Whether the active channel is in configure mode */
  configuring: boolean;
  /** Whether the standalone ticker is running (for EKG animation) */
  tickerAlive: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** App version string */
  appVersion?: string;
  /** Select a source (channel or widget) or "settings" */
  onSelectItem: (id: string) => void;
  /** Enter configure mode for a channel */
  onConfigureChannel: (channelType: string) => void;
  /** Add a new channel via API */
  onAddChannel: (channelType: ChannelType) => void;
  /** Toggle a widget on/off */
  onToggleWidget: (widgetId: string) => void;
  /** Trigger sign-in flow */
  onLogin: () => void;
}

// ── EKG heartbeat path ──────────────────────────────────────────

const EKG_PATH = "M0,8 L6,8 L9,2 L12,14 L15,4 L18,12 L21,8 L32,8";

// ── Canonical display orders ────────────────────────────────────

const CHANNEL_ORDER = ["finance", "sports", "rss", "fantasy"];
const WIDGET_ORDER = ["clock", "timer", "weather", "sysmon"];

// ── Popover anchor ──────────────────────────────────────────────

interface PopoverAnchor {
  x: number;
  y: number;
}

// ── Component ───────────────────────────────────────────────────

export default function Sidebar({
  channels,
  allChannelManifests,
  allWidgets,
  enabledWidgets,
  activeItem,
  configuring,
  tickerAlive,
  authenticated,
  appVersion,
  onSelectItem,
  onConfigureChannel,
  onAddChannel,
  onToggleWidget,
  onLogin,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(
    () => loadPref("sidebarCollapsed", false),
  );
  const [channelPopAnchor, setChannelPopAnchor] = useState<PopoverAnchor | null>(null);
  const [widgetPopAnchor, setWidgetPopAnchor] = useState<PopoverAnchor | null>(null);
  const channelPopRef = useRef<HTMLDivElement>(null);
  const widgetPopRef = useRef<HTMLDivElement>(null);
  const channelBtnRef = useRef<HTMLButtonElement>(null);
  const widgetBtnRef = useRef<HTMLButtonElement>(null);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    savePref("sidebarCollapsed", next);
  }

  // Open channel popover anchored to the "+" button position
  const openChannelPopover = useCallback(() => {
    if (!authenticated) {
      onLogin();
      return;
    }
    if (channelBtnRef.current) {
      const rect = channelBtnRef.current.getBoundingClientRect();
      setChannelPopAnchor({ x: rect.right + 6, y: rect.top });
      setWidgetPopAnchor(null);
    }
  }, [authenticated, onLogin]);

  // Open widget popover anchored to the "+" button position
  const openWidgetPopover = useCallback(() => {
    if (widgetBtnRef.current) {
      const rect = widgetBtnRef.current.getBoundingClientRect();
      setWidgetPopAnchor({ x: rect.right + 6, y: rect.top });
      setChannelPopAnchor(null);
    }
  }, []);

  // Close popovers on click-outside
  useEffect(() => {
    if (!channelPopAnchor && !widgetPopAnchor) return;

    function onMouseDown(e: MouseEvent) {
      if (
        channelPopAnchor &&
        channelPopRef.current &&
        !channelPopRef.current.contains(e.target as Node) &&
        channelBtnRef.current &&
        !channelBtnRef.current.contains(e.target as Node)
      ) {
        setChannelPopAnchor(null);
      }
      if (
        widgetPopAnchor &&
        widgetPopRef.current &&
        !widgetPopRef.current.contains(e.target as Node) &&
        widgetBtnRef.current &&
        !widgetBtnRef.current.contains(e.target as Node)
      ) {
        setWidgetPopAnchor(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [channelPopAnchor, widgetPopAnchor]);

  // Close popovers on Escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setChannelPopAnchor(null);
        setWidgetPopAnchor(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Derived data ────────────────────────────────────────────

  const addedTypes = new Set(channels.map((ch) => ch.channel_type));
  const availableChannels = allChannelManifests.filter(
    (m) => !addedTypes.has(m.id as ChannelType),
  );

  const enabledSet = new Set(enabledWidgets);
  const availableWidgets = allWidgets.filter((w) => !enabledSet.has(w.id));

  const sortedChannels = [...channels].sort(
    (a, b) =>
      CHANNEL_ORDER.indexOf(a.channel_type) -
      CHANNEL_ORDER.indexOf(b.channel_type),
  );

  const sortedEnabledWidgets = enabledWidgets
    .map((id) => allWidgets.find((w) => w.id === id))
    .filter((w): w is WidgetManifest => w != null)
    .sort(
      (a, b) => WIDGET_ORDER.indexOf(a.id) - WIDGET_ORDER.indexOf(b.id),
    );

  // First available source for logo click
  const firstSource =
    sortedChannels[0]?.channel_type ?? sortedEnabledWidgets[0]?.id;

  // ── Shared EKG SVG ──────────────────────────────────────────

  function EkgLogo({ idPrefix }: { idPrefix: string }) {
    return (
      <svg viewBox="0 0 32 16" fill="none" aria-hidden="true" className="w-10 h-6 shrink-0">
        <defs>
          <linearGradient id={`${idPrefix}-grad`} x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="33%" stopColor="#ff4757" />
            <stop offset="66%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={`${idPrefix}-dim`} x1="0" y1="0" x2="32" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.15" />
            <stop offset="33%" stopColor="#ff4757" stopOpacity="0.15" />
            <stop offset="66%" stopColor="#00d4ff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.15" />
          </linearGradient>
          <filter id={`${idPrefix}-glow`}>
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d={EKG_PATH}
          stroke={tickerAlive ? `url(#${idPrefix}-dim)` : "var(--color-fg-4)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx(!tickerAlive && "opacity-20")}
        />
        {tickerAlive && (
          <path
            d={EKG_PATH}
            stroke={`url(#${idPrefix}-grad)`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            strokeDasharray="20 80"
            className="ekg-trace"
            filter={`url(#${idPrefix}-glow)`}
          />
        )}
      </svg>
    );
  }

  // ── Collapsed render ────────────────────────────────────────

  if (collapsed) {
    return (
      <aside className="flex flex-col items-center shrink-0 border-r border-edge bg-surface-2 h-full w-[52px] overflow-hidden">
        {/* Logo */}
        <button
          onClick={() => firstSource && onSelectItem(firstSource)}
          aria-label="Scrollr"
          title="Scrollr"
          className={clsx(
            "relative flex items-center justify-center w-full h-14 shrink-0 cursor-pointer",
            tickerAlive ? "border-b border-accent/15" : "border-b border-edge",
          )}
        >
          <EkgLogo idPrefix="ekg-c" />
        </button>

        {/* Source dots */}
        <div className="flex flex-col items-center gap-0.5 py-3 w-full flex-1 overflow-y-auto scrollbar-thin">
          {/* Channel dots */}
          {sortedChannels.map((ch) => {
            const manifest = allChannelManifests.find(
              (m) => m.id === ch.channel_type,
            );
            const isActive = activeItem === ch.channel_type;
            return (
              <button
                key={ch.channel_type}
                onClick={() => onSelectItem(ch.channel_type)}
                title={manifest?.name ?? ch.channel_type}
                className={clsx(
                  "w-7 h-7 flex items-center justify-center rounded-md transition-colors shrink-0",
                  isActive ? "bg-accent/10" : "hover:bg-surface-hover",
                )}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: manifest?.hex ?? "var(--color-fg-4)" }}
                />
              </button>
            );
          })}

          {/* Separator between channels and widgets */}
          {sortedChannels.length > 0 && sortedEnabledWidgets.length > 0 && (
            <div className="w-4 h-px bg-edge my-1 shrink-0" />
          )}

          {/* Widget dots */}
          {sortedEnabledWidgets.map((widget) => {
            const isActive = activeItem === widget.id;
            return (
              <button
                key={widget.id}
                onClick={() => onSelectItem(widget.id)}
                title={widget.name}
                className={clsx(
                  "w-7 h-7 flex items-center justify-center rounded-md transition-colors shrink-0",
                  isActive ? "bg-accent/10" : "hover:bg-surface-hover",
                )}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: widget.hex }}
                />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col items-center py-2 gap-1 border-t border-edge shrink-0 w-full">
          <button
            onClick={() => onSelectItem("settings")}
            title="Settings"
            className={clsx(
              "w-7 h-7 flex items-center justify-center rounded-md transition-colors",
              activeItem === "settings"
                ? "text-accent bg-accent/10"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            <Settings size={14} />
          </button>
          <button
            onClick={toggleCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            className="w-7 h-7 flex items-center justify-center rounded-md text-fg-4 hover:text-fg-2 hover:bg-surface-hover transition-colors"
          >
            <PanelLeftOpen size={14} />
          </button>
        </div>
      </aside>
    );
  }

  // ── Expanded render ─────────────────────────────────────────

  return (
    <aside className="flex flex-col shrink-0 border-r border-edge bg-surface-2 h-full w-[220px]">
      {/* Logo */}
      <button
        onClick={() => firstSource && onSelectItem(firstSource)}
        aria-label="Go to Feed"
        className={clsx(
          "relative flex items-center gap-3 px-5 h-14 shrink-0 overflow-hidden transition-all duration-500 w-full cursor-pointer",
          tickerAlive ? "border-b border-accent/15" : "border-b border-edge",
        )}
      >
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
        <EkgLogo idPrefix="ekg" />
        <span
          className={clsx(
            "font-mono text-[15px] font-bold tracking-[0.15em] uppercase select-none transition-colors duration-500 whitespace-nowrap",
            tickerAlive ? "text-fg" : "text-fg-3",
          )}
        >
          scrollr
        </span>
      </button>

      {/* Source tree */}
      <nav
        aria-label="Source navigation"
        className="flex flex-col flex-1 overflow-y-auto scrollbar-thin py-3"
      >
        {/* ── CHANNELS ────────────────────────────────────── */}
        <div className="px-3 mb-2">
          <div className="flex items-center justify-between pl-1 pr-0.5 mb-1.5">
            <span className="text-[11px] font-mono font-bold text-fg-3 uppercase tracking-wider">
              Channels
            </span>
            <button
              ref={channelBtnRef}
              onClick={() => {
                if (channelPopAnchor) {
                  setChannelPopAnchor(null);
                } else if (availableChannels.length > 0) {
                  openChannelPopover();
                } else if (!authenticated) {
                  onLogin();
                }
              }}
              title={
                !authenticated
                  ? "Sign in to add channels"
                  : availableChannels.length === 0
                    ? "All channels added"
                    : "Add channel"
              }
              className={clsx(
                "w-6 h-6 flex items-center justify-center rounded-md transition-colors",
                availableChannels.length === 0 && authenticated
                  ? "text-fg-4/30 cursor-default"
                  : "text-fg-3 hover:text-fg hover:bg-surface-hover cursor-pointer",
                channelPopAnchor && "text-accent bg-accent/10",
              )}
              disabled={availableChannels.length === 0 && authenticated}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Channel items */}
          {sortedChannels.length === 0 ? (
            <p className="pl-1 py-1.5 text-[11px] text-fg-4/60 italic">
              {authenticated ? "No channels added" : "Sign in to add"}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sortedChannels.map((ch) => {
                const manifest = allChannelManifests.find(
                  (m) => m.id === ch.channel_type,
                );
                const isActive = activeItem === ch.channel_type;
                const isConfiguring = isActive && configuring;
                return (
                  <div key={ch.channel_type} className="group flex items-center">
                    <button
                      onClick={() => onSelectItem(ch.channel_type)}
                      className={clsx(
                        "flex items-center gap-2.5 flex-1 min-w-0 pl-3 pr-2 py-1.5 rounded-md text-[12px] font-medium transition-colors",
                        isActive
                          ? "text-accent bg-accent/8"
                          : "text-fg-2 hover:text-fg hover:bg-surface-hover",
                      )}
                    >
                      <div
                        className={clsx(
                          "w-2 h-2 rounded-full shrink-0 transition-opacity",
                          isActive ? "opacity-100" : "opacity-60",
                        )}
                        style={{
                          background: manifest?.hex ?? "var(--color-fg-4)",
                        }}
                      />
                      <span className="truncate">
                        {manifest?.name ?? ch.channel_type}
                      </span>
                      {isConfiguring && (
                        <span className="text-[8px] text-accent/50 ml-auto shrink-0">
                          config
                        </span>
                      )}
                    </button>
                    {/* Gear icon — configure channel */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfigureChannel(ch.channel_type);
                      }}
                      title={`Configure ${manifest?.name ?? ch.channel_type}`}
                      className={clsx(
                        "w-7 h-7 flex items-center justify-center rounded-md transition-all shrink-0",
                        isActive
                          ? "text-fg-3 opacity-60 hover:opacity-100 hover:text-fg-2 hover:bg-surface-hover"
                          : "text-fg-4 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-fg-2 hover:bg-surface-hover",
                      )}
                    >
                      <Settings size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── WIDGETS ─────────────────────────────────────── */}
        <div className="px-3 mt-2 mb-2">
          <div className="flex items-center justify-between pl-1 pr-0.5 mb-1.5">
            <span className="text-[11px] font-mono font-bold text-fg-3 uppercase tracking-wider">
              Widgets
            </span>
            <button
              ref={widgetBtnRef}
              onClick={() => {
                if (widgetPopAnchor) {
                  setWidgetPopAnchor(null);
                } else if (availableWidgets.length > 0) {
                  openWidgetPopover();
                }
              }}
              title={
                availableWidgets.length === 0
                  ? "All widgets enabled"
                  : "Add widget"
              }
              className={clsx(
                "w-6 h-6 flex items-center justify-center rounded-md transition-colors",
                availableWidgets.length === 0
                  ? "text-fg-4/30 cursor-default"
                  : "text-fg-3 hover:text-fg hover:bg-surface-hover cursor-pointer",
                widgetPopAnchor && "text-accent bg-accent/10",
              )}
              disabled={availableWidgets.length === 0}
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* Widget items */}
          {sortedEnabledWidgets.length === 0 ? (
            <p className="pl-1 py-1.5 text-[11px] text-fg-4/60 italic">
              No widgets enabled
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {sortedEnabledWidgets.map((widget) => {
                const isActive = activeItem === widget.id;
                return (
                  <button
                    key={widget.id}
                    onClick={() => onSelectItem(widget.id)}
                    className={clsx(
                      "flex items-center gap-2.5 w-full pl-3 pr-2 py-1.5 rounded-md text-[12px] font-medium transition-colors text-left",
                      isActive
                        ? "text-accent bg-accent/8"
                        : "text-fg-2 hover:text-fg hover:bg-surface-hover",
                    )}
                  >
                    <div
                      className={clsx(
                        "w-2 h-2 rounded-full shrink-0 transition-opacity",
                        isActive ? "opacity-100" : "opacity-60",
                      )}
                      style={{ background: widget.hex }}
                    />
                    <span className="truncate">{widget.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-edge shrink-0">
        <button
          onClick={() => onSelectItem("settings")}
          className={clsx(
            "flex items-center gap-3 w-full px-5 py-3 text-[13px] font-medium transition-colors",
            activeItem === "settings"
              ? "text-accent bg-accent/5"
              : "text-fg-2 hover:text-fg hover:bg-surface-hover",
          )}
        >
          <Settings size={16} strokeWidth={1.75} />
          Settings
        </button>

        <div className="flex items-center justify-between px-5 py-2">
          {appVersion && (
            <span className="text-[11px] font-mono text-fg-4">
              v{appVersion}
            </span>
          )}
          <button
            onClick={toggleCollapsed}
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
            className="flex items-center justify-center w-7 h-7 rounded-md text-fg-4 hover:text-fg-2 hover:bg-surface-hover transition-colors ml-auto"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
      </div>

      {/* ── Fixed-position popovers (rendered outside scroll container) ── */}

      {/* Channel add popover */}
      {channelPopAnchor && availableChannels.length > 0 && (
        <div
          ref={channelPopRef}
          className="fixed z-[100] min-w-[200px] rounded-xl bg-surface-2 border border-edge shadow-xl overflow-hidden"
          style={{ left: channelPopAnchor.x, top: channelPopAnchor.y }}
        >
          <div className="px-3 py-2 border-b border-edge/50">
            <p className="text-[10px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
              Add Channel
            </p>
          </div>
          {availableChannels.map((manifest) => (
            <button
              key={manifest.id}
              onClick={() => {
                onAddChannel(manifest.id as ChannelType);
                setChannelPopAnchor(null);
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: manifest.hex }}
              />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-fg-2 truncate">
                  {manifest.name}
                </p>
                <p className="text-[10px] text-fg-4 truncate">
                  {manifest.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Widget add popover */}
      {widgetPopAnchor && availableWidgets.length > 0 && (
        <div
          ref={widgetPopRef}
          className="fixed z-[100] min-w-[200px] rounded-xl bg-surface-2 border border-edge shadow-xl overflow-hidden"
          style={{ left: widgetPopAnchor.x, top: widgetPopAnchor.y }}
        >
          <div className="px-3 py-2 border-b border-edge/50">
            <p className="text-[10px] font-mono font-semibold text-fg-4 uppercase tracking-wider">
              Enable Widget
            </p>
          </div>
          {availableWidgets.map((widget) => (
            <button
              key={widget.id}
              onClick={() => {
                onToggleWidget(widget.id);
                setWidgetPopAnchor(null);
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: widget.hex }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-fg-2 truncate">
                  {widget.name}
                </p>
              </div>
              {widget.desktopOnly && (
                <span className="text-[9px] text-fg-4 bg-surface border border-edge rounded px-1.5 py-0.5 shrink-0">
                  Desktop
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}
