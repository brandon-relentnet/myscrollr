import { clsx } from "clsx";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

// ── Types ────────────────────────────────────────────────────────

export interface ClockChipData {
  id: string;
  kind: "clock" | "timer";
  label: string;       // "NYC", "Local", "Timer"
  value: string;       // "3:45 PM", "12:30"
  detail?: string;     // "Eastern \u00B7 Mon, Mar 10" or "Pomodoro \u00B7 3/4 sessions"
}

interface ClockTickerChipProps {
  data: ClockChipData;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export default function ClockTickerChip({
  data,
  comfort,
  colorMode = "channel",
  onClick,
}: ClockTickerChipProps) {
  const colorKey = data.kind === "timer" ? "timer" : "clock";
  const c = getChipColors(colorMode, colorKey);

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
      {/* Row 1: label + time */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-semibold text-[11px] uppercase tracking-wider", c.textDim)}>
          {data.label}
        </span>
        <span className={c.text}>{data.value}</span>
      </div>
      {/* Row 2: detail (comfort only) */}
      {comfort && data.detail && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          <span>{data.detail}</span>
        </div>
      )}
    </button>
  );
}
