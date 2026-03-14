/**
 * Shared sysmon utilities — temp sensor finders and formatters.
 *
 * Used by both the sysmon FeedTab and the ticker data hook.
 */
import type { SystemInfo } from "../../hooks/useSysmonData";

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
 * Format a component temperature with unit conversion.
 * Returns e.g. "72°C" or "162°F".
 */
export function formatComponentTemp(
  tempCelsius: number,
  unit: string,
): string {
  const temp =
    unit === "fahrenheit"
      ? Math.round(tempCelsius * 9 / 5 + 32)
      : Math.round(tempCelsius);
  const suffix = unit === "fahrenheit" ? "\u00B0F" : "\u00B0C";
  return `${temp}${suffix}`;
}
