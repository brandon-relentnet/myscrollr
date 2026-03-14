import { memo } from "react";
import { clsx } from "clsx";
import type { Trade } from "../../types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";
import { formatPrice, formatChange, formatPriceChange } from "../../utils/format";

interface TradeChipProps {
  trade: Trade;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

const TradeChip = memo(function TradeChip({ trade, comfort, colorMode = "channel", onClick }: TradeChipProps) {
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
}, (prev, next) =>
  prev.comfort === next.comfort &&
  prev.colorMode === next.colorMode &&
  prev.onClick === next.onClick &&
  prev.trade.symbol === next.trade.symbol &&
  prev.trade.price === next.trade.price &&
  prev.trade.percentage_change === next.trade.percentage_change &&
  prev.trade.direction === next.trade.direction &&
  prev.trade.previous_close === next.trade.previous_close &&
  prev.trade.price_change === next.trade.price_change
);

export default TradeChip;
