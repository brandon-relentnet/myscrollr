import clsx from "clsx";
import { POPULAR_STOCKS, POPULAR_CRYPTO } from "./curated-picks";
import type { StockPick } from "./curated-picks";

interface StepConfigureFinanceProps {
  selected: Set<string>;
  onToggle: (symbol: string) => void;
  /** Maximum selectable items. undefined = unlimited. */
  maxItems?: number;
}

function SymbolGrid({ items, selected, onToggle, label, atLimit }: {
  items: StockPick[];
  selected: Set<string>;
  onToggle: (s: string) => void;
  label: string;
  atLimit: boolean;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-2">{label}</h3>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const active = selected.has(item.symbol);
          const disabled = !active && atLimit;
          return (
            <button
              key={item.symbol}
              onClick={() => !disabled && onToggle(item.symbol)}
              disabled={disabled}
              className={clsx(
                "px-3 py-2 rounded-lg border text-center transition-all",
                disabled
                  ? "border-edge bg-surface-2/30 opacity-40 cursor-not-allowed"
                  : active
                    ? "border-accent bg-accent/5 text-fg"
                    : "border-edge bg-surface-2/50 text-fg-3 hover:border-fg-4",
              )}
            >
              <p className="text-xs font-mono font-medium">{item.symbol}</p>
              <p className="text-[10px] text-fg-4 mt-0.5 truncate">{item.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function StepConfigureFinance({ selected, onToggle, maxItems }: StepConfigureFinanceProps) {
  const atLimit = maxItems !== undefined && selected.size >= maxItems;

  return (
    <div className="flex flex-col gap-5">
      {/* Counter */}
      <div className={clsx("text-xs font-medium", atLimit ? "text-amber-400" : "text-fg-4")}>
        {maxItems !== undefined ? `${selected.size} / ${maxItems} selected` : `${selected.size} selected`}
        {atLimit && (
          <span className="ml-2 text-[10px] text-amber-400/80">
            Free tier limit reached — upgrade for more
          </span>
        )}
      </div>

      <SymbolGrid items={POPULAR_STOCKS} selected={selected} onToggle={onToggle} label="Popular Stocks" atLimit={atLimit} />
      <SymbolGrid items={POPULAR_CRYPTO} selected={selected} onToggle={onToggle} label="Crypto" atLimit={atLimit} />
    </div>
  );
}
