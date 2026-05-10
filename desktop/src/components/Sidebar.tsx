/**
 * Sidebar — collapsible navigation rail.
 *
 * The Scrollr brand mark + wordmark moved to the TopBar (always-visible
 * chrome) post-IA-refactor polish pass. The sidebar is now pure
 * navigation: + Add source, Home, Catalog, dynamic per-source items,
 * Settings, Support, collapse toggle.
 *
 * Collapses to a 48px icon-only rail with tooltips.
 */
import { useState } from "react";
import { Home, LayoutGrid, Settings, LifeBuoy, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import clsx from "clsx";
import Tooltip from "./Tooltip";
import type { ChannelManifest, WidgetManifest } from "../types";
import { loadPref, savePref } from "../preferences";

// ── Props ───────────────────────────────────────────────────────

interface SidebarSource {
  id: string;
  name: string;
  hex: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  kind: "channel" | "widget";
}

interface SidebarProps {
  /** Whether the home/dashboard page is active. */
  isFeed: boolean;
  /** Whether the settings page is active. */
  isSettings: boolean;
  /** Whether the catalog page is active. */
  isMarketplace: boolean;
  /** Whether the support page is active. */
  isSupport: boolean;
  /** Currently active channel or widget ID (for pinned item highlighting). */
  activeItem: string;

  /** Resolved enabled-source manifest data, in canonical order. */
  sources: SidebarSource[];

  /** Navigate to the home dashboard. */
  onNavigateToFeed: () => void;
  /** Navigate to the settings page. */
  onNavigateToSettings: () => void;
  /** Navigate to the catalog page. */
  onNavigateToMarketplace: () => void;
  /** Navigate to the support page. */
  onNavigateToSupport: () => void;
  /** Navigate to a specific source (channel or widget) feed. */
  onSelectItem: (id: string, kind: "channel" | "widget") => void;
}

// ── Component ───────────────────────────────────────────────────

export default function Sidebar({
  isFeed,
  isSettings,
  isMarketplace,
  isSupport,
  activeItem,
  sources,
  onNavigateToFeed,
  onNavigateToSettings,
  onNavigateToMarketplace,
  onNavigateToSupport,
  onSelectItem,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(() =>
    loadPref("sidebarCollapsed", false),
  );

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    savePref("sidebarCollapsed", next);
  }

  return (
    <aside
      className={clsx(
        "flex flex-col shrink-0 border-r border-edge bg-surface-2 h-full overflow-hidden select-none transition-[width] duration-200 ease-out",
        collapsed ? "w-[48px]" : "w-[200px]",
      )}
    >
      {/* Navigation items — sidebar starts straight into the nav now
          that branding is up in the TopBar. */}
      <nav
        aria-label="Main navigation"
        className={clsx(
          "flex-1 overflow-y-auto scrollbar-thin py-3",
          collapsed ? "px-1" : "px-2",
        )}
      >
        {/* Add source — primary, persistent affordance. Catalog is the
            canonical "add" surface; this just makes the action visible
            from anywhere in the app, in chrome. */}
        <Tooltip content={collapsed ? "Add source" : undefined} side="right">
          <button
            onClick={onNavigateToMarketplace}
            aria-label="Add source"
            className={clsx(
              "flex items-center w-full rounded-lg font-semibold transition-colors mb-2",
              "bg-accent/10 text-accent hover:bg-accent/15 hover:text-accent",
              collapsed
                ? "justify-center py-1.5 px-0"
                : "gap-2.5 px-2.5 py-1.5 text-[13px]",
            )}
          >
            <span className="shrink-0 flex items-center justify-center w-5 h-5">
              <Plus size={15} strokeWidth={2.5} />
            </span>
            {!collapsed && <span className="truncate">Add source</span>}
          </button>
        </Tooltip>

        <NavItem
          icon={<Home size={15} />}
          label="Home"
          active={isFeed}
          collapsed={collapsed}
          onClick={onNavigateToFeed}
        />

        <NavItem
          icon={<LayoutGrid size={15} />}
          label="Catalog"
          active={isMarketplace}
          collapsed={collapsed}
          onClick={onNavigateToMarketplace}
        />

        {/* Enabled channels + widgets */}
        {sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-edge/20 space-y-0.5">
            {sources.map((source) => (
              <NavItem
                key={source.id}
                icon={<span style={{ color: source.hex }}><source.icon size={15} /></span>}
                label={source.name}
                active={activeItem === source.id}
                collapsed={collapsed}
                onClick={() => onSelectItem(source.id, source.kind)}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Footer — settings, collapse toggle, status */}
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
          icon={<LifeBuoy size={15} />}
          label="Support"
          active={isSupport}
          collapsed={collapsed}
          onClick={onNavigateToSupport}
        />

        {/* Collapse toggle. Connection status + ticker status are now
            in the ControlStrip (always-visible chrome below the title
            bar) — see components/ControlStrip.tsx. The sidebar footer
            stays minimal. */}
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
      </div>
    </aside>
  );
}

// ── Nav item ────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  collapsed,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
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
            className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-accent"
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
