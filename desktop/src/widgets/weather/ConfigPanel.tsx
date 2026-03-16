import { useState, useEffect, useCallback } from "react";
import {
  Section,
  ToggleRow,
  SegmentedRow,
  ResetButton,
} from "../../components/settings/SettingsControls";
import type {
  AppPreferences,
  WeatherWidgetConfig,
  WeatherTickerConfig,
} from "../../preferences";
import { DEFAULT_WEATHER_TICKER, savePrefs } from "../../preferences";
import { useWidgetPin } from "../../hooks/useWidgetPin";
import { LS_WEATHER_CITIES, LS_WEATHER_UNIT, PIN_SIDE_OPTIONS } from "../../constants";
import { onStoreChange, setStore } from "../../lib/store";
import { loadCities, loadUnit } from "./types";
import type { TempUnit } from "../../preferences";
import type { SavedCity } from "./types";

interface WeatherConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

/** Stable display name for a city (used as ID in exclusion list). */
function cityName(city: SavedCity): string {
  return city.location.name;
}

const UNIT_OPTIONS: { value: TempUnit; label: string }[] = [
  { value: "fahrenheit", label: "\u00B0F" },
  { value: "celsius", label: "\u00B0C" },
];

export default function WeatherConfigPanel({
  prefs,
  onPrefsChange,
}: WeatherConfigPanelProps) {
  const config = prefs.widgets.weather;
  const [cities, setCities] = useState<SavedCity[]>(loadCities);
  const [unit, setUnitState] = useState<TempUnit>(loadUnit);

  const { isPinned, pinSide, togglePin, setPinSide } = useWidgetPin("weather", prefs, onPrefsChange);

  // Re-read when store changes (user adds/removes city in widget)
  useEffect(() => {
    const unsub1 = onStoreChange(LS_WEATHER_CITIES, () => setCities(loadCities()));
    const unsub2 = onStoreChange(LS_WEATHER_UNIT, () => setUnitState(loadUnit()));
    return () => { unsub1(); unsub2(); };
  }, []);

  const update = useCallback(
    (patch: Partial<WeatherWidgetConfig>) => {
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          weather: { ...config, ...patch },
        },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, config, onPrefsChange],
  );

  const setTicker = useCallback(
    (patch: Partial<WeatherTickerConfig>) => {
      update({ ticker: { ...config.ticker, ...patch } });
    },
    [update, config.ticker],
  );

  const isCityExcluded = (name: string) =>
    config.ticker.excludedCities.includes(name);

  const toggleCity = useCallback(
    (name: string) => {
      const excluded = config.ticker.excludedCities;
      const next = excluded.includes(name)
        ? excluded.filter((c) => c !== name)
        : [...excluded, name];
      setTicker({ excludedCities: next });
    },
    [config.ticker.excludedCities, setTicker],
  );

  const handleUnitChange = useCallback((v: TempUnit) => {
    setUnitState(v);
    setStore(LS_WEATHER_UNIT, v);
  }, []);

  // Build taskbar city options from configured cities
  const taskbarCityOptions: { value: string; label: string }[] = [
    { value: "", label: "Auto" },
    ...cities.map((c) => ({ value: cityName(c), label: cityName(c) })),
  ];

  const resetAll = useCallback(() => {
    update({
      taskbarCity: "",
      ticker: { ...DEFAULT_WEATHER_TICKER },
    });
    setStore(LS_WEATHER_UNIT, "fahrenheit");
    setUnitState("fahrenheit");
  }, [update]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: "color-mix(in srgb, var(--color-widget-weather) 15%, transparent)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-widget-weather)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Weather Settings</h2>
          <p className="text-[11px] text-fg-4">Current conditions for your saved cities</p>
        </div>
      </div>

      {/* Taskbar */}
      <Section title="Toolbar Preview">
        {cities.length > 1 ? (
          <SegmentedRow
            label="City shown"
            description="Which city to display on the toolbar"
            value={config.taskbarCity}
            options={taskbarCityOptions}
            onChange={(v) => update({ taskbarCity: v })}
          />
        ) : (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            {cities.length === 1
              ? `Showing ${cityName(cities[0])} on the toolbar.`
              : "Add a city in the Weather tab to see it on the toolbar."}
          </div>
        )}
      </Section>

      {/* Ticker */}
      <Section title="Ticker">
        {cities.map((city) => (
          <ToggleRow
            key={cityName(city)}
            label={cityName(city)}
            description={[city.location.admin1, city.location.country].filter(Boolean).join(", ")}
            checked={!isCityExcluded(cityName(city))}
            onChange={() => toggleCity(cityName(city))}
          />
        ))}
        {cities.length === 0 && (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            Add cities in the Weather tab to choose what shows on the ticker.
          </div>
        )}
        <ToggleRow
          label="Keep in a fixed spot"
          description="Stay on one side instead of scrolling across"
          checked={isPinned}
          onChange={togglePin}
        />
        {isPinned && (
          <SegmentedRow
            label="Which side"
            value={pinSide}
            options={PIN_SIDE_OPTIONS}
            onChange={setPinSide}
          />
        )}
      </Section>

      {/* Display */}
      <Section title="Display">
        <SegmentedRow
          label="Units"
          value={unit}
          options={UNIT_OPTIONS}
          onChange={handleUnitChange}
        />
      </Section>

      {/* Reset */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={resetAll} />
      </div>
    </div>
  );
}
