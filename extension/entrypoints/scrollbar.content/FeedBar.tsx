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
    return { __initialItems: initialItems };
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
          'fixed left-0 right-0 bg-zinc-900 text-zinc-100 shadow-2xl border-zinc-700 font-sans',
          position === 'bottom' ? 'bottom-0 border-t' : 'top-0 border-b',
        )}
        style={{
          height: `${COLLAPSED_HEIGHT}px`,
          zIndex: 2147483647,
        }}
      >
        <div className="flex items-center justify-between h-full px-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
              Scrollr
            </span>
            <span className="text-xs text-zinc-500">
              Sign in to see live market & sports data
            </span>
          </div>
          <button
            onClick={onLogin}
            className="text-xs font-medium px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Sign In
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
        'fixed left-0 right-0 bg-zinc-900 text-zinc-100 shadow-2xl border-zinc-700 font-sans',
        'transition-[height] duration-200 ease-out',
        position === 'bottom' ? 'bottom-0 border-t' : 'top-0 border-b',
        isDragging && 'select-none',
      )}
      style={{
        height: `${effectiveHeight}px`,
        zIndex: 2147483647,
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleDragStart}
        className={clsx(
          'absolute left-0 right-0 h-1.5 cursor-row-resize group hover:bg-indigo-500/30 transition-colors',
          position === 'bottom' ? '-top-1' : '-bottom-1',
        )}
      >
        <div className="mx-auto mt-0.5 h-0.5 w-12 rounded-full bg-zinc-600 group-hover:bg-indigo-400 transition-colors" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between h-8 px-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Scrollr
          </span>
          <FeedTabs activeTab={activeTab} onTabChange={setActiveTab} availableTabs={activeTabs} />
        </div>

        <div className="flex items-center gap-2">
          <ConnectionIndicator status={connectionStatus} />
          <button
            onClick={onToggleCollapse}
            className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs px-1"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (position === 'bottom' ? '\u25B2' : '\u25BC') : (position === 'bottom' ? '\u25BC' : '\u25B2')}
          </button>
        </div>
      </div>

      {/* Content — render the active integration's FeedTab */}
      {!collapsed && (
        <div className="overflow-y-auto overflow-x-hidden" style={{ height: `${height - COLLAPSED_HEIGHT}px` }}>
          {FeedTabComponent ? (
            <FeedTabComponent mode={mode} streamConfig={streamConfig} />
          ) : (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No integration selected
            </div>
          )}
        </div>
      )}
    </div>
  );
}
