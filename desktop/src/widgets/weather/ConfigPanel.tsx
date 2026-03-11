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
  PinSide,
} from "../../preferences";
import { DEFAULT_WEATHER_TICKER, savePrefs } from "../../preferences";

// ── localStorage keys (shared with the Weather FeedTab) ─────────
const LS_CITIES = "scrollr:widget:weather:cities";
const LS_UNIT = "scrollr:widget:weather:unit";

type TempUnit = "celsius" | "fahrenheit";

interface SavedCity {
  location: { name: string; lat: number; lon: number; country?: string; admin1?: string };
  weather?: unknown;
  lastFetched?: number;
  error?: string;
}

interface WeatherConfigPanelProps {
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

function loadCities(): SavedCity[] {
  try {
    const raw = localStorage.getItem(LS_CITIES);
    if (raw) return JSON.parse(raw) as SavedCity[];
  } catch { /* ignore */ }
  return [];
}

function loadUnit(): TempUnit {
  return (localStorage.getItem(LS_UNIT) as TempUnit) ?? "fahrenheit";
}

/** Stable display name for a city (used as ID in exclusion list). */
function cityName(city: SavedCity): string {
  return city.location.name;
}

const UNIT_OPTIONS: { value: TempUnit; label: string }[] = [
  { value: "fahrenheit", label: "\u00B0F" },
  { value: "celsius", label: "\u00B0C" },
];

const PIN_SIDE_OPTIONS: { value: PinSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

export default function WeatherConfigPanel({
  prefs,
  onPrefsChange,
}: WeatherConfigPanelProps) {
  const config = prefs.widgets.weather;
  const [cities, setCities] = useState<SavedCity[]>(loadCities);
  const [unit, setUnitState] = useState<TempUnit>(loadUnit);

  // Re-read when localStorage changes (user adds/removes city in widget)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_CITIES) setCities(loadCities());
      if (e.key === LS_UNIT) setUnitState(loadUnit());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
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
    localStorage.setItem(LS_UNIT, v);
  }, []);

  // Build taskbar city options from configured cities
  const taskbarCityOptions: { value: string; label: string }[] = [
    { value: "", label: "Auto" },
    ...cities.map((c) => ({ value: cityName(c), label: cityName(c) })),
  ];

  const isPinned = !!prefs.widgets.pinnedWidgets.weather;
  const pinSide = prefs.widgets.pinnedWidgets.weather?.side ?? "left";

  const togglePin = useCallback(
    (pinned: boolean) => {
      const pw = { ...prefs.widgets.pinnedWidgets };
      if (pinned) {
        pw.weather = { side: pinSide };
      } else {
        delete pw.weather;
      }
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, pinSide, onPrefsChange],
  );

  const setPinSide = useCallback(
    (side: PinSide) => {
      const pw = { ...prefs.widgets.pinnedWidgets, weather: { side } };
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, onPrefsChange],
  );

  const resetAll = useCallback(() => {
    update({
      taskbarCity: "",
      ticker: { ...DEFAULT_WEATHER_TICKER },
    });
    localStorage.setItem(LS_UNIT, "fahrenheit");
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
          <h2 className="text-sm font-bold text-fg">Weather</h2>
          <p className="text-[11px] text-fg-4">Current conditions for your saved cities</p>
        </div>
      </div>

      {/* Taskbar */}
      <Section title="Taskbar Chip">
        {cities.length > 1 ? (
          <SegmentedRow
            label="City shown"
            description="Which city to display on the taskbar"
            value={config.taskbarCity}
            options={taskbarCityOptions}
            onChange={(v) => update({ taskbarCity: v })}
          />
        ) : (
          <div className="px-3 py-2.5 text-[11px] text-fg-4">
            {cities.length === 1
              ? `Showing ${cityName(cities[0])} on the taskbar.`
              : "Add a city in the Weather widget to see it on the taskbar."}
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
            Add cities in the Weather widget to configure ticker display.
          </div>
        )}
        <ToggleRow
          label="Pin to ticker edge"
          description="Fix the chip to the side of the ticker instead of scrolling"
          checked={isPinned}
          onChange={togglePin}
        />
        {isPinned && (
          <SegmentedRow
            label="Pin side"
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
