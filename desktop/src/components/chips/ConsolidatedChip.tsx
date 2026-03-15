/**
 * ConsolidatedChip — generic ticker chip for clock, weather, sysmon, and uptime widgets.
 *
 * Replaces the three nearly-identical ClockConsolidatedChip,
 * WeatherConsolidatedChip, and SysmonConsolidatedChip components.
 */
import { clsx } from "clsx";
import { Pin, PinOff } from "lucide-react";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";
import type {
  ClockChipData,
  WeatherChipData,
  SysmonChipData,
  UptimeChipData,
} from "../../types";

// ── Item shape union ────────────────────────────────────────────

type ChipItem = ClockChipData | WeatherChipData | SysmonChipData | UptimeChipData;

// ── Type guards ─────────────────────────────────────────────────

function isWeather(item: ChipItem): item is WeatherChipData {
  return "temp" in item;
}

function isSysmon(item: ChipItem): item is SysmonChipData {
  return "hot" in item;
}

function isUptime(item: ChipItem): item is UptimeChipData {
  return "status" in item && "uptime" in item;
}

// ── Uptime status dot color ─────────────────────────────────────

const UPTIME_DOT_COLORS: Record<string, string> = {
  up: "bg-up",
  down: "bg-down",
  pending: "bg-warning",
  maintenance: "bg-info",
};

// ── Props ───────────────────────────────────────────────────────

interface ConsolidatedChipProps {
  type: "clock" | "weather" | "sysmon" | "uptime";
  items: ChipItem[];
  comfort?: boolean;
  colorMode?: ChipColorMode;
  pinned?: boolean;
  onTogglePin?: () => void;
  onClick?: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function ConsolidatedChip({
  type,
  items,
  comfort,
  colorMode = "channel",
  pinned = false,
  onTogglePin,
  onClick,
}: ConsolidatedChipProps) {
  if (items.length === 0) return null;

  const c = getChipColors(colorMode, type);
  const PinIcon = pinned ? PinOff : Pin;
  const anyHot = type === "sysmon" && items.some((item) => isSysmon(item) && item.hot);
  const anyDown = type === "uptime" && items.some((item) => isUptime(item) && item.status === "down");

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group relative",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        c.bg, c.border, c.hoverBorder,
        anyHot && "border-error/30",
        anyDown && "border-down/30",
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

      {/* Row 1: all items inline */}
      <div className={clsx("flex items-center", comfort && "text-[13px]")}>
        {items.map((item, i) => (
          <div key={"id" in item ? item.id : i} className="flex items-center">
            {i > 0 && <span className={clsx("mx-2 text-[10px]", c.textFaint)}>|</span>}
            <span className={clsx("font-semibold text-[11px] uppercase tracking-wider mr-1.5", c.textDim)}>
              {"label" in item ? item.label : ""}
            </span>
            {isUptime(item) ? (
              <>
                <span className={clsx("w-1.5 h-1.5 rounded-full inline-block mr-1", UPTIME_DOT_COLORS[item.status] ?? "bg-fg-4")} />
                <span className={c.text}>{item.uptime}</span>
              </>
            ) : isWeather(item) ? (
              <>
                <span className={c.text}>{item.temp}</span>
                <span className="text-[13px] leading-none ml-1">{item.icon}</span>
              </>
            ) : isSysmon(item) ? (
              <span className={clsx(item.hot ? "text-error" : c.text)}>
                {item.value}
              </span>
            ) : (
              <span className={c.text}>{"value" in item ? item.value : ""}</span>
            )}
          </div>
        ))}
      </div>

      {/* Row 2: detail (comfort only) */}
      {comfort && (
        <div className={clsx("flex items-center text-[10px]", type === "weather" && "min-h-4", c.textFaint)}>
          {items.map((item, i) =>
            item.detail ? (
              <div key={"id" in item ? item.id : i} className="flex items-center">
                {i > 0 && <span className="mx-2">|</span>}
                <span>{item.detail}</span>
              </div>
            ) : null
          )}
        </div>
      )}
    </button>
  );
}
