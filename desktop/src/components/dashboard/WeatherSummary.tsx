/**
 * WeatherSummary — dashboard card content for the Weather widget.
 *
 * Shows primary city temperature, condition emoji, and city count.
 */
import { loadPref } from "../../preferences";

interface WeatherCity {
  name: string;
  country: string;
  temperature?: number;
  feelsLike?: number;
  weatherCode?: number;
  isDay?: boolean;
}

// WMO weather code to emoji (simplified)
function weatherEmoji(code: number | undefined, isDay: boolean): string {
  if (code === undefined) return "\u2601\uFE0F";
  if (code === 0) return isDay ? "\u2600\uFE0F" : "\uD83C\uDF19";
  if (code <= 3) return isDay ? "\u26C5" : "\uD83C\uDF24\uFE0F";
  if (code <= 48) return "\uD83C\uDF2B\uFE0F";
  if (code <= 67) return "\uD83C\uDF27\uFE0F";
  if (code <= 77) return "\u2744\uFE0F";
  if (code <= 82) return "\uD83C\uDF27\uFE0F";
  if (code <= 86) return "\uD83C\uDF28\uFE0F";
  if (code <= 99) return "\u26A1";
  return "\u2601\uFE0F";
}

export default function WeatherSummary() {
  const cities = loadPref<WeatherCity[]>("widget:weather:cities", []);
  const unit = loadPref<string>("widget:weather:unit", "celsius");

  if (cities.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        No cities added
      </p>
    );
  }

  const primary = cities[0];
  const temp = primary.temperature;
  const displayTemp = temp !== undefined
    ? unit === "fahrenheit"
      ? Math.round(temp * 9 / 5 + 32)
      : Math.round(temp)
    : "--";
  const tempUnit = unit === "fahrenheit" ? "\u00B0F" : "\u00B0C";
  const emoji = weatherEmoji(primary.weatherCode, primary.isDay ?? true);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[22px] leading-none">{emoji}</span>
        <div className="flex flex-col">
          <span className="text-[18px] font-mono font-bold text-fg tabular-nums leading-tight">
            {displayTemp}{tempUnit}
          </span>
          <span className="text-[10px] text-fg-3 truncate max-w-[120px]">
            {primary.name}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
        <span className="text-[10px] text-fg-4">
          {cities.length} cit{cities.length !== 1 ? "ies" : "y"}
        </span>
      </div>
    </div>
  );
}
