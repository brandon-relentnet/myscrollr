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
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
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

  const flashClass = flash === 'up'
    ? 'bg-emerald-500/20'
    : flash === 'down'
      ? 'bg-red-500/20'
      : '';

  if (mode === 'compact') {
    return (
      <a
        href={googleFinanceUrl(trade.symbol)}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-xs transition-colors duration-700 hover:bg-zinc-800',
          flashClass,
        )}
      >
        <span className="font-semibold text-zinc-100 min-w-[52px]">
          {trade.symbol}
        </span>
        <span className="text-zinc-300">{formatPrice(trade.price)}</span>
        <span
          className={clsx(
            'font-medium',
            isUp && 'text-emerald-400',
            isDown && 'text-red-400',
            !isUp && !isDown && 'text-zinc-500',
          )}
        >
          {isUp ? '\u25B2' : isDown ? '\u25BC' : '\u2500'}
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
        'flex items-center justify-between px-3 py-2 bg-zinc-900 transition-colors duration-700 hover:bg-zinc-800',
        flashClass,
      )}
    >
      <div className="flex flex-col">
        <span className="font-semibold text-sm text-zinc-100">
          {trade.symbol}
        </span>
        {trade.previous_close != null && (
          <span className="text-xs text-zinc-500">
            prev: {formatPrice(trade.previous_close)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end">
        <span className="text-sm font-medium text-zinc-200">
          {formatPrice(trade.price)}
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={clsx(
              'text-xs font-medium',
              isUp && 'text-emerald-400',
              isDown && 'text-red-400',
              !isUp && !isDown && 'text-zinc-500',
            )}
          >
            {isUp ? '\u25B2 ' : isDown ? '\u25BC ' : ''}
            {formatChange(trade.percentage_change)}
          </span>
          {trade.last_updated && (
            <span className="text-[10px] text-zinc-600">
              {timeAgo(trade.last_updated)}
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
