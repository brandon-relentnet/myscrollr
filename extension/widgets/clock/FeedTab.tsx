import { useState, useEffect, useCallback } from "react";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "../types";

// ── Timezone presets ────────────────────────────────────────────

interface TimezoneEntry {
  tz: string;
  label: string;
  flag: string;
}

const TIMEZONE_PRESETS: TimezoneEntry[] = [
  { tz: "America/New_York", label: "New York", flag: "US" },
  { tz: "America/Chicago", label: "Chicago", flag: "US" },
  { tz: "America/Denver", label: "Denver", flag: "US" },
  { tz: "America/Los_Angeles", label: "Los Angeles", flag: "US" },
  { tz: "America/Anchorage", label: "Anchorage", flag: "US" },
  { tz: "Pacific/Honolulu", label: "Honolulu", flag: "US" },
  { tz: "Europe/London", label: "London", flag: "GB" },
  { tz: "Europe/Paris", label: "Paris", flag: "FR" },
  { tz: "Europe/Berlin", label: "Berlin", flag: "DE" },
  { tz: "Europe/Moscow", label: "Moscow", flag: "RU" },
  { tz: "Asia/Dubai", label: "Dubai", flag: "AE" },
  { tz: "Asia/Kolkata", label: "Mumbai", flag: "IN" },
  { tz: "Asia/Shanghai", label: "Shanghai", flag: "CN" },
  { tz: "Asia/Tokyo", label: "Tokyo", flag: "JP" },
  { tz: "Asia/Seoul", label: "Seoul", flag: "KR" },
  { tz: "Australia/Sydney", label: "Sydney", flag: "AU" },
  { tz: "Pacific/Auckland", label: "Auckland", flag: "NZ" },
  { tz: "America/Sao_Paulo", label: "Sao Paulo", flag: "BR" },
];

const DEFAULT_TIMEZONES = [
  "America/New_York",
  "Europe/London",
  "Asia/Tokyo",
];

// ── Storage key ─────────────────────────────────────────────────

const STORAGE_KEY = "scrollr:widget:clock:timezones";

function loadTimezones(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return DEFAULT_TIMEZONES;
}

function saveTimezones(tzs: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tzs));
}

// ── Time formatting helpers ─────────────────────────────────────

function formatTime(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(new Date());
}

function formatDate(tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  }).format(new Date());
}

function getUtcOffset(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
  });
  const parts = formatter.formatToParts(now);
  const offsetPart = parts.find((p) => p.type === "timeZoneName");
  return offsetPart?.value ?? "";
}

function getLocalLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ") ?? "Local";
  } catch {
    return "Local";
  }
}

// ── Clock Card ──────────────────────────────────────────────────

function ClockCard({
  tz,
  label,
  isLocal,
  compact,
  onRemove,
}: {
  tz: string;
  label: string;
  isLocal: boolean;
  compact: boolean;
  onRemove?: () => void;
}) {
  const [time, setTime] = useState(formatTime(tz));
  const [date, setDate] = useState(formatDate(tz));

  useEffect(() => {
    const tick = () => {
      setTime(formatTime(tz));
      setDate(formatDate(tz));
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [tz]);

  const offset = getUtcOffset(tz);

  if (compact) {
    return (
      <div className="group flex items-center justify-between px-3 py-2 rounded-lg bg-widget-clock/[0.04] border border-widget-clock/10 hover:border-widget-clock/20 transition-colors">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[10px] font-mono text-widget-clock/50 uppercase tracking-wider shrink-0 w-16">
            {label}
          </span>
          <span className="text-sm font-mono font-semibold text-fg tabular-nums">
            {time}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-fg-3">{offset}</span>
          {!isLocal && onRemove && (
            <button
              onClick={onRemove}
              className="text-fg-4 hover:text-error text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove timezone"
            >
              x
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="group relative px-4 py-3 rounded-xl bg-widget-clock/[0.04] border border-widget-clock/10 hover:border-widget-clock/20 transition-colors">
      {!isLocal && onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 text-fg-4 hover:text-error text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
          title="Remove timezone"
        >
          x
        </button>
      )}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono text-widget-clock/60 uppercase tracking-wider">
          {label}
        </span>
        {isLocal && (
          <span className="text-[8px] font-mono text-widget-clock/40 uppercase tracking-wider px-1 py-0.5 rounded bg-widget-clock/[0.06]">
            local
          </span>
        )}
        <span className="text-[9px] font-mono text-fg-4 ml-auto">{offset}</span>
      </div>
      <div className="text-xl font-mono font-bold text-fg tabular-nums leading-none">
        {time}
      </div>
      <div className="text-[10px] font-mono text-fg-3 mt-1">{date}</div>
    </div>
  );
}

// ── FeedTab Component ───────────────────────────────────────────

function ClockFeedTab({ mode }: FeedTabProps) {
  const compact = mode === "compact";
  const [timezones, setTimezones] = useState(loadTimezones);
  const [showAdd, setShowAdd] = useState(false);
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const handleRemove = useCallback((tz: string) => {
    setTimezones((prev) => {
      const next = prev.filter((t) => t !== tz);
      saveTimezones(next);
      return next;
    });
  }, []);

  const handleAdd = useCallback((tz: string) => {
    setTimezones((prev) => {
      if (prev.includes(tz)) return prev;
      const next = [...prev, tz];
      saveTimezones(next);
      return next;
    });
    setShowAdd(false);
  }, []);

  // All timezones to display: local first, then user selections
  const allZones = [localTz, ...timezones.filter((tz) => tz !== localTz)];

  // Timezones available to add
  const available = TIMEZONE_PRESETS.filter(
    (p) => !allZones.includes(p.tz),
  );

  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[10px] font-mono font-semibold text-widget-clock/70 uppercase tracking-wider">
          World Clock
        </span>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="text-[10px] font-mono text-widget-clock/50 hover:text-widget-clock transition-colors"
        >
          {showAdd ? "Done" : "+ Add"}
        </button>
      </div>

      {/* Add timezone dropdown */}
      {showAdd && available.length > 0 && (
        <div className="rounded-lg border border-widget-clock/15 bg-surface-2 overflow-hidden max-h-40 overflow-y-auto scrollbar-thin">
          {available.map((preset) => (
            <button
              key={preset.tz}
              onClick={() => handleAdd(preset.tz)}
              className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-widget-clock/[0.06] transition-colors"
            >
              <span className="text-[11px] font-mono text-fg-2">
                {preset.label}
              </span>
              <span className="text-[9px] font-mono text-fg-4">
                {getUtcOffset(preset.tz)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Clock cards */}
      <div className={compact ? "space-y-1" : "grid gap-2"}>
        {allZones.map((tz) => {
          const isLocal = tz === localTz;
          const preset = TIMEZONE_PRESETS.find((p) => p.tz === tz);
          const label = isLocal
            ? getLocalLabel()
            : preset?.label ?? tz.split("/").pop()?.replace(/_/g, " ") ?? tz;

          return (
            <ClockCard
              key={tz}
              tz={tz}
              label={label}
              isLocal={isLocal}
              compact={compact}
              onRemove={isLocal ? undefined : () => handleRemove(tz)}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Manifest ────────────────────────────────────────────────────

export const clockWidget: WidgetManifest = {
  id: "clock",
  name: "World Clock",
  tabLabel: "Clock",
  hex: "#6366f1",
  FeedTab: ClockFeedTab,
};

export default ClockFeedTab;
