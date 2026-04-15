import { useState, useRef, useEffect, useCallback } from "react";
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
}

export default function CategoryFilter({
  categories,
  selected,
  onToggle,
  onClearAll,
}: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  // Position the menu using fixed coords from button rect
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: 208,
    });
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    updatePosition();
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, updatePosition]);

  const activeCount = selected.size;

  return (
    <div>
      <button
        ref={buttonRef}
        onClick={() => {
          if (!open) updatePosition();
          setOpen(!open);
        }}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[11px] transition-colors cursor-pointer whitespace-nowrap",
          activeCount > 0
            ? "border-accent/30 text-accent"
            : "border-edge/30 text-fg-4 hover:text-fg-3 hover:border-edge/50",
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
        <div ref={menuRef} style={menuStyle} className="bg-surface-2 border border-edge/30 rounded-lg shadow-lg z-50 py-1">
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
                      ? "bg-accent/20 border-accent/40 text-accent"
                      : "border-edge/40",
                  )}
                >
                  {isActive && "✓"}
                </span>
                <span className="flex-1 truncate">{cat.name}</span>
                <span className="text-[10px] text-fg-4/50 tabular-nums">{cat.count}</span>
              </button>
            );
          })}
          {activeCount > 0 && (
            <>
              <div className="h-px bg-edge/20 my-1" />
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
