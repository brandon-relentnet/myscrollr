import { clsx } from "clsx";
import { Pin, PinOff } from "lucide-react";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";
// ── Types ────────────────────────────────────────────────────────

interface ClockChipData {
  id: string;
  kind: "clock" | "timer";
  label: string;
  value: string;
  detail?: string;
}

interface ClockConsolidatedChipProps {
  items: ClockChipData[];
  comfort?: boolean;
  colorMode?: ChipColorMode;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClick?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export default function ClockConsolidatedChip({
  items,
  comfort,
  colorMode = "channel",
  pinned = false,
  onTogglePin,
  onClick,
}: ClockConsolidatedChipProps) {
  if (items.length === 0) return null;

  const c = getChipColors(colorMode, "clock");
  const PinIcon = pinned ? PinOff : Pin;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group relative",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        c.bg, c.border, c.hoverBorder,
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Pin toggle (hover-only) */}
      {onTogglePin && (
        <span
          role="button"
          tabIndex={0}
          aria-label={pinned ? "Unpin widget" : "Pin widget"}
          onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onTogglePin(); } }}
          className={clsx(
            "absolute -top-1 -right-1 z-10 p-0.5 rounded-full border transition-opacity",
            "bg-surface border-edge/50",
            pinned ? "opacity-80" : "opacity-0 group-hover:opacity-80 focus:opacity-80",
          )}
        >
          <PinIcon size={10} className={c.textDim} />
        </span>
      )}

      {/* Row 1: all stats inline */}
      <div className={clsx("flex items-center", comfort && "text-[13px]")}>
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center">
            {i > 0 && <span className={clsx("mx-2 text-[10px]", c.textFaint)}>|</span>}
            <span className={clsx("font-semibold text-[11px] uppercase tracking-wider mr-1.5", c.textDim)}>
              {item.label}
            </span>
            <span className={c.text}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Row 2: detail (comfort only) */}
      {comfort && (
        <div className={clsx("flex items-center text-[10px]", c.textFaint)}>
          {items.map((item, i) => (
            item.detail ? (
              <div key={item.id} className="flex items-center">
                {i > 0 && <span className="mx-2">|</span>}
                <span>{item.detail}</span>
              </div>
            ) : null
          ))}
        </div>
      )}
    </button>
  );
}
