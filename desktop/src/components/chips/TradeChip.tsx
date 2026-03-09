import { clsx } from "clsx";
import type { Trade } from "~/utils/types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

interface TradeChipProps {
  trade: Trade;
  comfort?: boolean;
  colorMode?: ChipColorMode;
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

function formatPriceChange(change: number | string | undefined): string {
  if (change == null) return "";
  const num = typeof change === "string" ? parseFloat(change) : change;
  if (isNaN(num)) return String(change);
  const sign = num >= 0 ? "+" : "";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

export default function TradeChip({ trade, comfort, colorMode = "channel", onClick }: TradeChipProps) {
  const c = getChipColors(colorMode, "finance");
  const isUp = trade.direction === "up";
  const changeStr = formatChange(trade.percentage_change);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        c.bg, c.border, c.hoverBorder,
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: symbol, price, change */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-semibold", c.text)}>{trade.symbol}</span>
        <span className={c.textDim}>{formatPrice(trade.price)}</span>
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
      </div>
      {/* Row 2: previous close + price change (comfort only) */}
      {comfort && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          {trade.previous_close != null && (
            <span>Prev {formatPrice(trade.previous_close)}</span>
          )}
          {trade.price_change != null && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span className={isUp ? "text-up/60" : "text-down/60"}>
                {formatPriceChange(trade.price_change)}
              </span>
            </>
          )}
        </div>
      )}
    </button>
  );
}
