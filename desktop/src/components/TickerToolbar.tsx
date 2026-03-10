import { ChevronUp, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { TickerPosition } from "../preferences";

interface TickerToolbarProps {
  position: TickerPosition;
  hovered: boolean;
  onTogglePosition: () => void;
}

export default function TickerToolbar({
  position,
  hovered,
  onTogglePosition,
}: TickerToolbarProps) {
  const Icon = position === "top" ? ChevronDown : ChevronUp;
  const label = position === "top" ? "Move to bottom" : "Move to top";

  return (
    <div
      className={clsx(
        "absolute right-0 top-0 bottom-0 z-50 flex items-center",
        "transition-opacity duration-200",
        hovered ? "opacity-100" : "opacity-0 pointer-events-none",
      )}
    >
      {/* Gradient fade from transparent to surface */}
      <div className="w-8 h-full bg-gradient-to-r from-transparent to-surface/80" />

      {/* Toolbar body */}
      <div className="h-full flex items-center pr-2 bg-surface/80 backdrop-blur-sm">
        <button
          onClick={onTogglePosition}
          aria-label={label}
          title={label}
          className={clsx(
            "w-7 h-7 flex items-center justify-center rounded-md",
            "text-fg-3 hover:text-fg hover:bg-surface-hover",
            "transition-colors duration-150",
          )}
        >
          <Icon size={16} />
        </button>
      </div>
    </div>
  );
}
