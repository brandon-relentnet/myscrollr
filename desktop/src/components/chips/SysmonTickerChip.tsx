import { clsx } from "clsx";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";

// ── Types ────────────────────────────────────────────────────────

export interface SysmonChipData {
  id: string;
  label: string;       // "CPU", "RAM", "GPU"
  value: string;       // "23%", "65%", "120W"
  detail?: string;     // "5.4 GHz \u00B7 62\u00B0C" or "12.4 / 32 GB"
  hot?: boolean;       // true when value > 80% (for red tint)
}

interface SysmonTickerChipProps {
  data: SysmonChipData;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

// ── Component ────────────────────────────────────────────────────

export default function SysmonTickerChip({
  data,
  comfort,
  colorMode = "channel",
  onClick,
}: SysmonTickerChipProps) {
  const c = getChipColors(colorMode, "sysmon");

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
      {/* Row 1: metric label + value */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-semibold text-[11px] uppercase tracking-wider", c.textDim)}>
          {data.label}
        </span>
        <span className={clsx(data.hot ? "text-error" : c.text)}>
          {data.value}
        </span>
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
