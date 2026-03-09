import { clsx } from "clsx";
import type { Trade } from "~/utils/types";

interface TradeChipProps {
  trade: Trade;
  onClick?: () => void;
}

function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  return isNaN(num) ? String(price) : `$${num.toFixed(2)}`;
}

function formatChange(change: number | string | undefined): string {
  if (change == null) return "";
  const num = typeof change === "string" ? parseFloat(change) : change;
  if (isNaN(num)) return String(change);
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

export default function TradeChip({ trade, onClick }: TradeChipProps) {
  const isUp = trade.direction === "up";
  const changeStr = formatChange(trade.percentage_change);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group flex items-center gap-2",
        "px-3 py-1 rounded-sm border",
        "text-[13px] font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-primary/[0.06] border-primary/25 hover:border-primary/40"
      )}
    >
      <span className="font-semibold text-primary">{trade.symbol}</span>
      <span className="text-primary/60">{formatPrice(trade.price)}</span>
      {changeStr && (
        <span
          className={clsx(
            "font-medium text-[12px]",
            isUp ? "text-up" : "text-down"
          )}
        >
          {isUp ? "\u25B2" : "\u25BC"}
          {changeStr}
        </span>
      )}
    </button>
  );
}
