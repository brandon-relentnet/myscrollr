import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import type {
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  DashboardResponse,
} from '~/utils/types';
import { getIntegration } from '~/integrations/registry';
import FeedTabs from './FeedTabs';
import ConnectionIndicator from './ConnectionIndicator';

interface FeedBarProps {
  /** Raw dashboard response — each FeedTab extracts its initial data from here. */
  dashboard: DashboardResponse | null;
  connectionStatus: ConnectionStatus;
  position: FeedPosition;
  height: number;
  mode: FeedMode;
  collapsed: boolean;
  behavior: FeedBehavior;
  /** Integration IDs that are visible (derived from user_streams). */
  activeTabs: string[];
  authenticated: boolean;
  onLogin: () => void;
  onToggleCollapse: () => void;
  onHeightChange: (height: number) => void;
  onHeightCommit: (height: number) => void;
}

const COLLAPSED_HEIGHT = 32;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;

/**
 * Map from integration ID → dashboard data key → initial items.
 * This is how we bridge the old dashboard response format to the
 * new per-integration FeedTab props.
 */
const DASHBOARD_KEY_MAP: Record<string, string> = {
  finance: 'finance',
  sports: 'sports',
  rss: 'rss',
};

export default function FeedBar({
  dashboard,
  connectionStatus,
  position,
  height,
  mode,
  collapsed,
  behavior,
  activeTabs,
  authenticated,
  onLogin,
  onToggleCollapse,
  onHeightChange,
  onHeightCommit,
}: FeedBarProps) {
  const [activeTab, setActiveTab] = useState<string>(activeTabs[0] ?? 'finance');
  const [isDragging, setIsDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync activeTab when activeTabs changes (e.g., user disables current tab)
  useEffect(() => {
    if (activeTabs.length > 0 && !activeTabs.includes(activeTab)) {
      setActiveTab(activeTabs[0]);
    }
  }, [activeTabs, activeTab]);

  // Build streamConfig for the active integration, injecting __initialItems
  const streamConfig = useMemo(() => {
    const dashboardKey = DASHBOARD_KEY_MAP[activeTab];
    const initialItems = dashboardKey
      ? (dashboard?.data?.[dashboardKey] as unknown[] | undefined) ?? []
      : [];
    return { __initialItems: initialItems, __dashboardLoaded: dashboard !== null };
  }, [activeTab, dashboard]);

  // Look up the active integration's FeedTab component
  const integration = getIntegration(activeTab);
  const FeedTabComponent = integration?.FeedTab ?? null;

  // ── Drag resize ────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);

      const startY = e.clientY;
      const startHeight = height;
      let currentHeight = height;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = position === 'bottom'
          ? startY - ev.clientY
          : ev.clientY - startY;
        currentHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeight + delta));
        onHeightChange(currentHeight); // Visual update only
      };

      const onMouseUp = () => {
        setIsDragging(false);
        onHeightCommit(currentHeight); // Persist to storage on drag end
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [height, position, onHeightChange, onHeightCommit],
  );

  const effectiveHeight = !authenticated
    ? COLLAPSED_HEIGHT
    : collapsed
      ? COLLAPSED_HEIGHT
      : height;

  // ── Unauthenticated: show a minimal CTA bar ──────────────────
  if (!authenticated) {
    return (
      <div
        ref={barRef}
        className={clsx(
          'fixed left-0 right-0 bg-surface text-fg font-sans',
          position === 'bottom' ? 'bottom-0' : 'top-0',
        )}
        style={{
          height: `${COLLAPSED_HEIGHT}px`,
          zIndex: 2147483647,
        }}
      >
        {/* Accent line */}
        <div className={clsx(
          'absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent',
          position === 'bottom' ? 'top-0' : 'bottom-0',
        )} />

        <div className="flex items-center justify-between h-full px-3">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-accent uppercase">
              scrollr
            </span>
            <span className="h-3 w-px bg-edge" />
            <span className="text-[11px] text-fg-3">
              Sign in for live data
            </span>
          </div>
          <button
            onClick={onLogin}
            className="text-[10px] font-bold uppercase tracking-[0.15em] px-3 py-1 bg-accent text-surface font-mono hover:bg-accent/90 transition-colors"
          >
            Connect
          </button>
        </div>
      </div>
    );
  }

  // ── Authenticated: full feed bar ──────────────────────────────
  return (
    <div
      ref={barRef}
      className={clsx(
        'fixed left-0 right-0 bg-surface text-fg font-sans',
        'transition-[height] duration-200 ease-out',
        position === 'bottom' ? 'bottom-0' : 'top-0',
        isDragging && 'select-none',
      )}
      style={{
        height: `${effectiveHeight}px`,
        zIndex: 2147483647,
      }}
    >
      {/* Accent line at visible edge */}
      <div className={clsx(
        'absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent',
        position === 'bottom' ? 'top-0' : 'bottom-0',
      )} />

      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className={clsx(
          'absolute left-0 right-0 h-2 cursor-row-resize group z-10',
          position === 'bottom' ? '-top-1' : '-bottom-1',
        )}
      >
        <div className="mx-auto mt-1 h-0.5 w-10 rounded-full bg-fg-4 group-hover:bg-accent/60 transition-colors" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between h-8 px-3 border-b border-edge shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-accent uppercase select-none">
            scrollr
          </span>
          <span className="h-3 w-px bg-edge" />
          <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} availableTabs={activeTabs} />
        </div>

        <div className="flex items-center gap-3">
          <ConnectionIndicator status={connectionStatus} />
          <span className="h-3 w-px bg-edge" />
          <button
            onClick={onToggleCollapse}
            className="text-fg-3 hover:text-accent transition-colors text-[10px] font-mono px-0.5"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (position === 'bottom' ? '\u25B2' : '\u25BC') : (position === 'bottom' ? '\u25BC' : '\u25B2')}
          </button>
        </div>
      </div>

      {/* Content — render the active integration's FeedTab */}
      {!collapsed && (
        <div className="overflow-y-auto overflow-x-hidden scrollbar-thin" style={{ height: `${height - COLLAPSED_HEIGHT}px` }}>
          {FeedTabComponent ? (
            <FeedTabComponent mode={mode} streamConfig={streamConfig} />
          ) : (
            <div className="text-center py-8 text-fg-3 text-xs font-mono">
              No integration selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
