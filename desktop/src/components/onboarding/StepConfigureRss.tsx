import clsx from "clsx";
import { RECOMMENDED_FEEDS } from "./curated-picks";

interface StepConfigureRssProps {
  selected: Set<string>;
  onToggle: (url: string) => void;
  /** Maximum selectable feeds. undefined = unlimited. */
  maxItems?: number;
}

export default function StepConfigureRss({ selected, onToggle, maxItems }: StepConfigureRssProps) {
  const atLimit = maxItems !== undefined && selected.size >= maxItems;

  const grouped = RECOMMENDED_FEEDS.reduce<Record<string, typeof RECOMMENDED_FEEDS>>((acc, f) => {
    (acc[f.category] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {/* Counter */}
      <div className={clsx("text-xs font-medium", atLimit ? "text-amber-400" : "text-fg-4")}>
        {maxItems !== undefined ? `${selected.size} / ${maxItems} selected` : `${selected.size} selected`}
        {atLimit && (
          <span className="ml-2 text-[10px] text-amber-400/80">
            Free tier limit reached — upgrade for more
          </span>
        )}
      </div>

      {Object.entries(grouped).map(([category, feeds]) => (
        <div key={category}>
          <h3 className="text-xs font-medium text-fg-3 uppercase tracking-wider mb-2">{category}</h3>
          <div className="flex flex-col gap-1.5">
            {feeds.map((feed) => {
              const active = selected.has(feed.url);
              const disabled = !active && atLimit;
              return (
                <button
                  key={feed.url}
                  onClick={() => !disabled && onToggle(feed.url)}
                  disabled={disabled}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-left",
                    disabled
                      ? "border-edge bg-surface-2/30 opacity-40 cursor-not-allowed"
                      : active
                        ? "border-accent bg-accent/5"
                        : "border-edge bg-surface-2/50 hover:border-fg-4",
                  )}
                >
                  <div
                    className={clsx(
                      "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      disabled
                        ? "border-fg-5"
                        : active ? "border-accent bg-accent" : "border-fg-4",
                    )}
                  >
                    {active && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <span className={clsx("text-sm", disabled ? "text-fg-4" : "text-fg")}>{feed.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
