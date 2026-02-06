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

export default function TradeItem({ trade, mode }: TradeItemProps) {
  const isUp = trade.direction === 'up';
  const isDown = trade.direction === 'down';

  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-xs">
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
      </div>
    );
  }

  // Comfort mode
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-zinc-900">
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
      </div>
    </div>
  );
}
