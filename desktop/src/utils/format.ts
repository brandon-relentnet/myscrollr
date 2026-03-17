/**
 * Shared formatting utilities.
 *
 * Canonical implementations — import from here instead of defining locally.
 */

/**
 * Format a date string as relative time.
 *
 * Returns "now" for < 1 min, "Xm" for minutes, "Xh" for hours,
 * "Xd" for days < 7, then a short date for older.
 *
 * @param includeSeconds  Show seconds granularity (e.g. "12s") for < 1 min.
 * @param suffix          Append " ago" to the result (e.g. "5m ago").
 */
export function timeAgo(
  dateStr: string | null | undefined,
  options?: { includeSeconds?: boolean; suffix?: boolean },
): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";

  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  const s = options?.suffix ? " ago" : "";

  if (options?.includeSeconds) {
    if (secs < 5) return "now";
    if (secs < 60) return `${secs}s${s}`;
  } else {
    if (mins < 1) return "now";
  }

  if (mins < 60) return `${mins}m${s}`;
  if (hours < 24) return `${hours}h${s}`;
  if (days < 7) return `${days}d${s}`;

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a price as USD with 2 decimal places.
 * Uses locale formatting for large numbers (>= 10,000).
 */
export function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(num)) return String(price);
  if (num >= 10_000) {
    return `$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${num.toFixed(2)}`;
}

/**
 * Format a percentage change with sign prefix (e.g. "+1.23%").
 */
export function formatChange(change: number | string | undefined): string {
  if (change == null) return "";
  const num = typeof change === "string" ? parseFloat(change) : change;
  if (isNaN(num)) return String(change);
  const sign = num >= 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
}

/**
 * Format a price change as signed USD (e.g. "+$1.23").
 */
export function formatPriceChange(change: number | string | undefined): string {
  if (change == null) return "";
  const num = typeof change === "string" ? parseFloat(change) : change;
  if (isNaN(num)) return String(change);
  const sign = num >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(num).toFixed(2)}`;
}

/**
 * Truncate text to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(text: string, maxLen: number): string {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "\u2026";
}

/**
 * Format a duration in seconds as human-readable uptime.
 * Returns "2d 5h", "3h 12m", or "45m".
 */
export function formatUptime(secs: number): string {
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Format a poll interval in seconds as human-readable duration.
 * Returns "2m", "2m 30s", or "30s".
 */
export function formatPollInterval(secs: number): string {
  if (secs >= 60) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  return `${secs}s`;
}

/**
 * Convert Celsius to Fahrenheit.
 */
export function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

/**
 * Format a temperature in the given unit.
 * @param showUnit  Append the unit letter (e.g. "72°F" vs "72°").
 */
export function formatTemp(celsius: number, unit: "celsius" | "fahrenheit", showUnit = false): string {
  const val = unit === "fahrenheit" ? toFahrenheit(celsius) : celsius;
  const suffix = showUnit ? (unit === "fahrenheit" ? "F" : "C") : "";
  return `${Math.round(val)}\u00B0${suffix}`;
}

/**
 * Format a byte count as a human-readable string.
 * Handles B, KB, MB, GB, and TB.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  if (gb < 1024) return `${gb.toFixed(1)} GB`;
  const tb = gb / 1024;
  return `${tb.toFixed(2)} TB`;
}
