import { clsx } from "clsx";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

// ── Types ────────────────────────────────────────────────────────

export interface WeatherChipData {
  id: string;
  label: string;       // "NYC", "London"
  temp: string;        // "72\u00B0F", "22\u00B0C"
  icon: string;        // weather emoji "\u2600\uFE0F", "\u2601\uFE0F"
  detail?: string;     // "Sunny \u00B7 Feels 74\u00B0"
}

interface WeatherTickerChipProps {
  data: WeatherChipData;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export default function WeatherTickerChip({
  data,
  comfort,
  colorMode = "channel",
  onClick,
}: WeatherTickerChipProps) {
  const c = getChipColors(colorMode, "weather");

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
      {/* Row 1: city label + temp + icon */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-semibold text-[11px] uppercase tracking-wider", c.textDim)}>
          {data.label}
        </span>
        <span className={c.text}>{data.temp}</span>
        <span className="text-[13px] leading-none">{data.icon}</span>
      </div>
      {/* Row 2: condition detail (comfort only) */}
      {comfort && data.detail && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          <span>{data.detail}</span>
        </div>
      )}
    </button>
  );
}
