/**
 * ClockSummary — dashboard card content for the Clock widget.
 *
 * Shows live local time (ticking), world clock count, and timer status.
 * Respects per-card display preferences from the dashboard editor.
 */
import { useState, useEffect } from "react";
import { loadPref } from "../../preferences";
import type { ClockCardPrefs } from "./dashboardPrefs";

interface ClockSummaryProps {
  prefs: ClockCardPrefs;
}

export default function ClockSummary({ prefs }: ClockSummaryProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Read saved timezones from localStorage
  const savedTimezones = loadPref<string[]>("widget:clock:timezones", []);
  const format = loadPref<string>("widget:clock:format", "12h");

  // Read timer state from localStorage
  const timerState = loadPref<{ mode?: string; startedAt?: number; bankedMs?: number } | null>(
    "widget:timer:state",
    null,
  );

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: format !== "24h",
  });

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const timerLabel = timerState?.startedAt
    ? `${timerState.mode ?? "Timer"} running`
    : timerState?.mode
      ? `${timerState.mode} idle`
      : "idle";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-col">
        <span className="text-[18px] font-mono font-bold text-fg tabular-nums leading-tight">
          {timeStr}
        </span>
        {prefs.date && (
          <span className="text-[10px] text-fg-3 mt-0.5">
            {dateStr}
          </span>
        )}
      </div>

      {(prefs.worldClocks || prefs.timer) && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          {prefs.worldClocks && (
            <span className="text-[10px] text-fg-4">
              {savedTimezones.length + 1} clock{savedTimezones.length !== 0 ? "s" : ""}
            </span>
          )}
          {prefs.timer && (
            <span className="text-[10px] text-fg-4 capitalize">
              {timerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
