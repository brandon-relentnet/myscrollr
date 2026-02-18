import { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { Trade, FeedMode } from '~/utils/types';

interface TradeItemProps {
  trade: Trade;
  mode: FeedMode;
}

function formatPrice(price: number | string): string {
  const num = typeof price === 'string' ? parseFloat(price) : price;
  return isNaN(num) ? String(price) : `$${num.toFixed(2)}`;
}

function formatChange(change: number | string | undefined): string {
  if (change == null) return '';
  const num = typeof change === 'string' ? parseFloat(change) : change;
  if (isNaN(num)) return String(change);
  const sign = num >= 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

/** Build a Google Finance URL for a symbol. Strips exchange prefixes like "BINANCE:". */
function googleFinanceUrl(symbol: string): string {
  const clean = symbol.includes(':') ? symbol.split(':').pop()! : symbol;
  return `https://www.google.com/finance/quote/${encodeURIComponent(clean)}`;
}

/** Format a timestamp as relative time (e.g. "12s ago", "5m ago"). */
function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return 'now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function TradeItem({ trade, mode }: TradeItemProps) {
  const isUp = trade.direction === 'up';
  const isDown = trade.direction === 'down';

  // Track previous price for flash animation
  const prevPriceRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const currentPrice = typeof trade.price === 'string' ? parseFloat(trade.price) : trade.price;
    const prevPrice = prevPriceRef.current;

    if (prevPrice !== null && !isNaN(currentPrice) && currentPrice !== prevPrice) {
      setFlash(currentPrice > prevPrice ? 'up' : 'down');
      const timer = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(timer);
    }

    prevPriceRef.current = currentPrice;
  }, [trade.price]);

  // Update ref after flash logic (separate from the effect to avoid stale ref)
  useEffect(() => {
    const currentPrice = typeof trade.price === 'string' ? parseFloat(trade.price) : trade.price;
    prevPriceRef.current = currentPrice;
  }, [trade.price]);

  const dirColor = isUp ? 'text-up' : isDown ? 'text-down' : 'text-fg-3';

  if (mode === 'compact') {
    return (
      <a
        href={googleFinanceUrl(trade.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 bg-surface text-xs font-mono transition-colors duration-700 hover:bg-surface-hover',
          flash === 'up' && 'bg-up/8',
          flash === 'down' && 'bg-down/8',
        )}
      >
        <span className="font-bold text-fg min-w-[52px] tracking-wide">
          {trade.symbol}
        </span>
        <span className="text-fg-2 tabular-nums">{formatPrice(trade.price)}</span>
        <span className={clsx('tabular-nums', dirColor)}>
          {formatChange(trade.percentage_change)}
        </span>
      </a>
    );
  }

  // Comfort mode
  return (
    <a
      href={googleFinanceUrl(trade.symbol)}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'flex items-center justify-between px-3 py-2 bg-surface transition-colors duration-700 hover:bg-surface-hover border-l-2',
        flash === 'up' && 'bg-up/6',
        flash === 'down' && 'bg-down/6',
        isUp && 'border-l-up/40',
        isDown && 'border-l-down/40',
        !isUp && !isDown && 'border-l-transparent',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-mono font-bold text-sm text-fg tracking-wide">
          {trade.symbol}
        </span>
        {trade.previous_close != null && (
          <span className="text-[10px] font-mono text-fg-3 tabular-nums">
            prev {formatPrice(trade.previous_close)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm font-mono font-medium text-fg tabular-nums">
          {formatPrice(trade.price)}
        </span>
        <div className="flex items-center gap-2">
          <span className={clsx('text-[11px] font-mono font-medium tabular-nums', dirColor)}>
            {formatChange(trade.percentage_change)}
          </span>
          {trade.last_updated && (
            <span className="text-[9px] font-mono text-fg-4 tabular-nums">
              {timeAgo(trade.last_updated)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
