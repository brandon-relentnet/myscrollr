/**
 * Sidebar — collapsible navigation rail.
 *
 * The rail is split into three labeled groups so a long list of
 * unrelated nav items doesn't read as a single undifferentiated
 * column:
 *
 *   ┌──────────┐
 *   │ SOURCES  │
 *   │ Finance  │
 *   │ Sports   │
 *   │ Weather  │
 *   ├──────────┤
 *   │ WORKSPACE│
 *   │ + Add    │  ← drilled into Catalog
 *   │ Settings │
 *   │ Ticker   │
 *   ├──────────┤
 *   │ ACCOUNT  │
 *   │ Account  │
 *   │ Support  │
 *   ├──────────┤
 *   │ Collapse │
 *   └──────────┘
 *
 * Home navigation lives on the Scrollr brand mark in the TopBar;
 * connection/ticker status lives in the TopBar too. The sidebar
 * stays minimal and navigational.
 *
 * Collapses to a 48px icon-only rail with tooltips. Group headings
 * are hidden in the collapsed state (they'd just be empty rows) but
 * the divider lines stay so the grouping survives visually.
 */
import { useState } from "react";
import { Settings, LifeBuoy, PanelLeftClose, PanelLeftOpen, Plus, RadioTower, UserCircle } from "lucide-react";
import clsx from "clsx";
import { motion } from "motion/react";
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
  /** Whether the settings page is active. */
  isSettings: boolean;
  /** Whether the ticker settings page is active. */
  isTicker: boolean;
  /** Whether the account page is active. */
  isAccount: boolean;
  /** Whether the catalog page is active. Drives the "+ Add source"
   *  button's active state. */
  isMarketplace: boolean;
  /** Whether the support page is active. */
  isSupport: boolean;
  /** Currently active channel or widget ID (for highlighting). */
  activeItem: string;

  /** Resolved enabled-source manifest data, in canonical order. */
  sources: SidebarSource[];

  /** Navigate to the catalog page (used by "+ Add source"). */
  onNavigateToMarketplace: () => void;
  /** Navigate to the settings page. */
  onNavigateToSettings: () => void;
  /** Navigate to the ticker page. */
  onNavigateToTicker: () => void;
  /** Navigate to the account page. */
  onNavigateToAccount: () => void;
  /** Navigate to the support page. */
  onNavigateToSupport: () => void;
  /** Navigate to a specific source (channel or widget) feed. */
  onSelectItem: (id: string, kind: "channel" | "widget") => void;
}

// ── Component ───────────────────────────────────────────────────

export default function Sidebar({
  isSettings,
  isTicker,
  isAccount,
  isMarketplace,
  isSupport,
  activeItem,
  sources,
  onNavigateToMarketplace,
  onNavigateToSettings,
  onNavigateToTicker,
  onNavigateToAccount,
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
      {/* ── Sources ─────────────────────────────────────────────
          The user's enabled channels and widgets in canonical
          order. Scrollable when long. */}
      <NavGroup
        ariaLabel="Sources"
        heading="Sources"
        collapsed={collapsed}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        {sources.length > 0 ? (
          sources.map((source) => (
            <NavItem
              key={source.id}
              icon={
                <span style={{ color: source.hex }}>
                  <source.icon size={15} />
                </span>
              }
              label={source.name}
              active={activeItem === source.id}
              collapsed={collapsed}
              onClick={() => onSelectItem(source.id, source.kind)}
            />
          ))
        ) : (
          !collapsed && (
            <p className="px-2.5 text-ui-meta leading-snug">
              No sources yet. Use{" "}
              <span className="font-medium text-accent">Add source</span>{" "}
              to get started.
            </p>
          )
        )}
      </NavGroup>

      {/* ── Workspace ─────────────────────────────────────────── */}
      <NavGroup
        ariaLabel="Workspace"
        heading="Workspace"
        collapsed={collapsed}
        bordered
      >
        <NavItem
          icon={<Plus size={15} strokeWidth={2.5} />}
          label="Add source"
          active={isMarketplace}
          collapsed={collapsed}
          accent
          onClick={onNavigateToMarketplace}
        />
        <NavItem
          icon={<Settings size={15} />}
          label="Settings"
          active={isSettings}
          collapsed={collapsed}
          onClick={onNavigateToSettings}
        />
        <NavItem
          icon={<RadioTower size={15} />}
          label="Ticker"
          active={isTicker}
          collapsed={collapsed}
          onClick={onNavigateToTicker}
        />
      </NavGroup>

      {/* ── Account ───────────────────────────────────────────── */}
      <NavGroup
        ariaLabel="Account"
        heading="Account"
        collapsed={collapsed}
        bordered
      >
        <NavItem
          icon={<UserCircle size={15} />}
          label="Account"
          active={isAccount}
          collapsed={collapsed}
          onClick={onNavigateToAccount}
        />
        <NavItem
          icon={<LifeBuoy size={15} />}
          label="Support"
          active={isSupport}
          collapsed={collapsed}
          onClick={onNavigateToSupport}
        />
      </NavGroup>

      {/* ── Collapse toggle ───────────────────────────────────────
          Lives outside the three labeled groups because it's chrome,
          not navigation. Connection status + ticker status live in
          the TopBar — see components/TopBar.tsx. */}
      <div
        className={clsx(
          "shrink-0 border-t border-edge py-2",
          collapsed ? "px-1" : "px-2",
        )}
      >
        <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={clsx(
              "flex items-center w-full rounded-lg text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
              "transition-all duration-150 active:scale-[0.97]",
              collapsed
                ? "justify-center py-1.5"
                : "gap-2.5 px-2.5 py-1.5",
            )}
          >
            <span className="shrink-0 flex items-center justify-center w-5 h-5">
              {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            </span>
            {!collapsed && (
              <span className="text-ui-meta font-medium">Collapse</span>
            )}
          </button>
        </Tooltip>
      </div>
    </aside>
  );
}

// ── Nav group ───────────────────────────────────────────────────
// A labeled section of nav items. Hides the heading when collapsed
// (a single-character label looks like a glyph). The optional
// `bordered` flag adds a top divider so visually distinct groups
// don't blur into each other. Sources is the only group that scrolls
// — the rest stay shrink-0 so they always sit at their natural size.

function NavGroup({
  ariaLabel,
  heading,
  collapsed,
  bordered = false,
  className,
  children,
}: {
  ariaLabel: string;
  heading: string;
  collapsed: boolean;
  bordered?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={clsx(
        "shrink-0 py-2 space-y-0.5",
        collapsed ? "px-1" : "px-2",
        bordered && "border-t border-edge",
        className,
      )}
    >
      {!collapsed && (
        <h2 className="px-2.5 mb-1 text-ui-section">{heading}</h2>
      )}
      {children}
    </nav>
  );
}

// ── Nav item ────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  collapsed,
  accent = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed?: boolean;
  /** Accent variant for CTA-like items (currently "Add source"). */
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip content={collapsed ? label : undefined} side="right">
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        className={clsx(
          "relative flex items-center w-full rounded-lg font-medium",
          "transition-all duration-150 active:scale-[0.97]",
          collapsed
            ? "justify-center py-1.5 px-0"
            : "gap-2.5 px-2.5 py-1.5 text-ui-body",
          active
            ? accent
              ? "bg-accent/15 text-accent"
              : "bg-accent/10 text-fg"
            : accent
              ? "text-accent/85 hover:bg-accent/10 hover:text-accent"
              : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
        )}
      >
        {/* Active indicator — left accent bar. Uses motion's
            layoutId so it slides between nav items when the active
            page changes, instead of popping in/out. The accent CTA
            already carries its own active treatment so we suppress
            the bar there to avoid double-emphasis. */}
        {active && !accent && (
          <motion.span
            layoutId="sidebar-active-indicator"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
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
