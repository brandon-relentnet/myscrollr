import clsx from "clsx";
import { POPULAR_STOCKS, POPULAR_CRYPTO } from "./curated-picks";
import type { StockPick } from "./curated-picks";

interface StepConfigureFinanceProps {
  selected: Set<string>;
  onToggle: (symbol: string) => void;
}

function SymbolGrid({ items, selected, onToggle, label }: {
  items: StockPick[];
  selected: Set<string>;
  onToggle: (s: string) => void;
  label: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-2">{label}</h3>
      <div className="grid grid-cols-4 gap-2">
        {items.map((item) => {
          const active = selected.has(item.symbol);
          return (
            <button
              key={item.symbol}
              onClick={() => onToggle(item.symbol)}
              className={clsx(
                "px-3 py-2 rounded-lg border text-center transition-all",
                active
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

export default function StepConfigureFinance({ selected, onToggle }: StepConfigureFinanceProps) {
  return (
    <div className="flex flex-col gap-5">
      <SymbolGrid items={POPULAR_STOCKS} selected={selected} onToggle={onToggle} label="Popular Stocks" />
      <SymbolGrid items={POPULAR_CRYPTO} selected={selected} onToggle={onToggle} label="Crypto" />
    </div>
  );
}
