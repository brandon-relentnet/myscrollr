/**
 * WeatherSummary — dashboard card content for the Weather widget.
 *
 * Shows primary city temperature, condition emoji, and city count.
 * Reads from the same Tauri store data the full Weather widget uses.
 * Respects per-card display preferences from the dashboard editor.
 */
import { useState } from "react";
import {
  loadCities,
  loadUnit,
  formatTemp,
  weatherCodeToIcon,
  weatherCodeToLabel,
} from "../../widgets/weather/types";
import type { WeatherCardPrefs } from "./dashboardPrefs";
import DashboardEmptyState from "./DashboardEmptyState";

interface WeatherSummaryProps {
  prefs: WeatherCardPrefs;
}

export default function WeatherSummary({ prefs }: WeatherSummaryProps) {
  // Read once on mount — changes require navigating to the weather widget
  const [cities] = useState(loadCities);
  const [unit] = useState(loadUnit);

  if (cities.length === 0) {
    return <DashboardEmptyState message="No cities added" />;
  }

  const primary = cities[0];
  const w = primary.weather;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[22px] leading-none">
          {w ? weatherCodeToIcon(w.weatherCode, w.isDay) : "\u2601"}
        </span>
        <div className="flex flex-col">
          <span className="text-[18px] font-mono font-bold text-fg tabular-nums leading-tight">
            {w ? formatTemp(w.temperature, unit) : "--\u00B0"}
          </span>
          <span className="text-[10px] text-fg-3 truncate max-w-[120px]">
            {primary.location.name}
          </span>
        </div>
      </div>

      {prefs.condition && w && (
        <p className="text-[10px] text-fg-4 leading-tight">
          {weatherCodeToLabel(w.weatherCode)}
          {prefs.feelsLike && <> &middot; Feels {formatTemp(w.feelsLike, unit)}</>}
        </p>
      )}

      {prefs.cityCount && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {cities.length} cit{cities.length !== 1 ? "ies" : "y"}
          </span>
        </div>
      )}
    </div>
  );
}
