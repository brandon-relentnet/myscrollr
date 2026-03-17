/**
 * Shared sysmon utilities — temp sensor finders and formatters.
 *
 * Used by both the sysmon FeedTab and the ticker data hook.
 */
import type { SystemInfo } from "../../hooks/useSysmonData";
import { formatTemp } from "../../utils/format";

// ── Types ───────────────────────────────────────────────────────

type ComponentTemp = SystemInfo["components"][number];

export interface TempReading {
  temp: number;
  critical: number | null;
}

// ── Sensor finders ──────────────────────────────────────────────

/** Find CPU package/die temperature sensor. */
export function findCpuTemp(components: ComponentTemp[]): TempReading | null {
  const m = components.find((c) =>
    /package id|^tctl$|^tdie$/i.test(c.label),
  );
  return m ? { temp: m.temp, critical: m.critical } : null;
}

/** Find GPU temperature sensor (AMD edge/junction, nvidia, intel). */
export function findGpuTemp(components: ComponentTemp[]): TempReading | null {
  const m = components.find((c) =>
    /^edge$|^junction$|gpu/i.test(c.label),
  );
  return m ? { temp: m.temp, critical: m.critical } : null;
}

/**
 * Usage color — returns a hex color based on usage percentage.
 * Green < 50%, yellow < 75%, red >= 75%.
 */
export function usageColor(pct: number): string {
  if (pct < 50) return "#34d399";
  if (pct < 75) return "#fbbf24";
  return "#f87171";
}

/** Usage color as Tailwind text class — same thresholds as usageColor. */
export function usageColorClass(pct: number): string {
  if (pct < 50) return "text-emerald-400";
  if (pct < 75) return "text-amber-400";
  return "text-red-400";
}

/** Temperature color class based on distance from critical threshold. */
export function tempColorClass(temp: number, critical: number | null): string {
  if (critical && temp >= critical * 0.9) return "text-red-400";
  if (temp >= 80) return "text-red-400";
  if (temp >= 60) return "text-amber-400";
  return "text-emerald-400";
}

/** Format MHz as GHz when >= 1000, otherwise MHz. */
export function formatFreq(mhz: number): string {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)} GHz`;
  return `${mhz} MHz`;
}

/** Format watts, rounding to nearest integer. */
export function formatWatts(w: number): string {
  return `${Math.round(w)}W`;
}

/** Format network throughput from bytes per interval. */
export function formatRate(bytesPerInterval: number, intervalMs: number): string {
  const bytesPerSec = bytesPerInterval / (intervalMs / 1000);
  if (bytesPerSec < 1024) return `${Math.round(bytesPerSec)} B/s`;
  const kbps = bytesPerSec / 1024;
  if (kbps < 1024) return `${kbps.toFixed(1)} KB/s`;
  const mbps = kbps / 1024;
  return `${mbps.toFixed(1)} MB/s`;
}

/**
 * Format a component temperature with unit conversion.
 * Returns e.g. "72°C" or "162°F".
 * @deprecated Use `formatTemp(celsius, unit, true)` from `utils/format` instead.
 */
export function formatComponentTemp(
  tempCelsius: number,
  unit: string,
): string {
  return formatTemp(tempCelsius, unit, true);
}
