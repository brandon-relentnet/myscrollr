import { useState, useRef, useEffect } from "react";
import { Filter } from "lucide-react";
import clsx from "clsx";

interface CategoryFilterProps {
  /** All available categories with their feed counts */
  categories: Array<{ name: string; count: number }>;
  /** Currently selected category names (empty = show all) */
  selected: Set<string>;
  /** Toggle a category on/off */
  onToggle: (category: string) => void;
  /** Clear all filters (show all) */
  onClearAll: () => void;
  /** Align dropdown to right edge of button (default: left) */
  alignRight?: boolean;
}

export default function CategoryFilter({
  categories,
  selected,
  onToggle,
  onClearAll,
  alignRight = false,
}: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const activeCount = selected.size;

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors cursor-pointer whitespace-nowrap",
          activeCount > 0
            ? "border-accent/50 text-accent"
            : "border-edge/40 text-fg-3 hover:text-fg-2 hover:border-edge/60",
        )}
      >
        <Filter size={12} />
        <span>Categories</span>
        {activeCount > 0 && (
          <span className="bg-accent/20 text-accent rounded-full px-1.5 text-[10px] font-medium">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className={clsx(
            "absolute top-full mt-1 w-52 bg-surface-2 border border-edge/50 rounded-lg shadow-lg z-[5] py-1 max-h-64 overflow-y-auto",
            alignRight ? "right-0" : "left-0",
          )}
        >
          {categories.map((cat) => {
            const isActive = selected.has(cat.name);
            return (
              <button
                key={cat.name}
                onClick={() => onToggle(cat.name)}
                className={clsx(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer",
                  isActive
                    ? "text-fg-2"
                    : "text-fg-4 hover:text-fg-3",
                )}
              >
                <span
                  className={clsx(
                    "w-3.5 h-3.5 rounded border flex items-center justify-center text-[10px] shrink-0",
                    isActive
                      ? "bg-accent/25 border-accent/50 text-accent"
                      : "border-edge/50",
                  )}
                >
                  {isActive && "\u2713"}
                </span>
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-[10px] text-fg-3 tabular-nums">{cat.count}</span>
              </button>
            );
          })}
          {activeCount > 0 && (
            <>
              <div className="h-px bg-edge/40 my-1" />
              <button
                onClick={() => {
                  onClearAll();
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-[11px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
