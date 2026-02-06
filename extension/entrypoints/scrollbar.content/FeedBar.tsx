import { useState, useCallback, useRef, useEffect } from 'react';
import { clsx } from 'clsx';
import type {
  Trade,
  Game,
  ConnectionStatus,
  FeedPosition,
  FeedMode,
  FeedBehavior,
  FeedCategory,
} from '~/utils/types';
import FeedTabs from './FeedTabs';
import TradeItem from './TradeItem';
import GameItem from './GameItem';
import ConnectionIndicator from './ConnectionIndicator';

interface FeedBarProps {
  trades: Trade[];
  games: Game[];
  connectionStatus: ConnectionStatus;
  position: FeedPosition;
  height: number;
  mode: FeedMode;
  collapsed: boolean;
  behavior: FeedBehavior;
  activeTabs: FeedCategory[];
  onToggleCollapse: () => void;
  onHeightChange: (height: number) => void;
  onHeightCommit: (height: number) => void;
}

const COLLAPSED_HEIGHT = 32;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 600;

export default function FeedBar({
  trades,
  games,
  connectionStatus,
  position,
  height,
  mode,
  collapsed,
  behavior,
  activeTabs,
  onToggleCollapse,
  onHeightChange,
  onHeightCommit,
}: FeedBarProps) {
  const [activeTab, setActiveTab] = useState<FeedCategory>(activeTabs[0] ?? 'finance');
  const [isDragging, setIsDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Sync activeTab when activeTabs changes (e.g., user disables current tab in options)
  useEffect(() => {
    if (activeTabs.length > 0 && !activeTabs.includes(activeTab)) {
      setActiveTab(activeTabs[0]);
    }
  }, [activeTabs, activeTab]);

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

  const effectiveHeight = collapsed ? COLLAPSED_HEIGHT : height;

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

      {/* Content */}
      {!collapsed && (
        <div className="overflow-y-auto overflow-x-hidden" style={{ height: `${height - COLLAPSED_HEIGHT}px` }}>
          {activeTab === 'finance' && (
            <div className={clsx(
              'grid gap-px bg-zinc-800',
              mode === 'compact'
                ? 'grid-cols-1'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
            )}>
              {trades.length === 0 && (
                <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
                  Waiting for trade data...
                </div>
              )}
              {trades.map((trade) => (
                <TradeItem key={trade.symbol} trade={trade} mode={mode} />
              ))}
            </div>
          )}

          {activeTab === 'sports' && (
            <div className={clsx(
              'grid gap-px bg-zinc-800',
              mode === 'compact'
                ? 'grid-cols-1'
                : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}>
              {games.length === 0 && (
                <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
                  Waiting for game data...
                </div>
              )}
              {games.map((game) => (
                <GameItem key={String(game.id)} game={game} mode={mode} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
