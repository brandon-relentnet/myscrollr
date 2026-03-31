/**
 * Weather widget FeedTab — desktop-native.
 *
 * Pure display consumer: reads weather data from the Tauri store
 * (kept fresh by useWeatherData in __root.tsx). City management
 * (add/remove) writes to the store; the shell-level hook picks up
 * changes and fetches weather for new cities automatically.
 */
import { useState, useCallback } from "react";
import Tooltip from "../../components/Tooltip";
import { CloudSun } from "lucide-react";
import { WeatherCard } from "./WeatherCard";
import { CitySearch } from "./CitySearch";
import type { FeedTabProps, WidgetManifest } from "../../types";
import type { WeatherLocation, SavedCity } from "./types";
import { loadCities, saveCities, loadUnit, saveUnit } from "./types";
import { refreshCityWeather } from "../../hooks/useWeatherData";
import { getStore } from "../../lib/store";
import { onStoreChange } from "../../lib/store";
import { LS_WEATHER_CITIES } from "../../constants";
import { useEffect } from "react";

// ── Widget manifest ─────────────────────────────────────────────

export const weatherWidget: WidgetManifest = {
  id: "weather",
  name: "Weather",
  tabLabel: "Weather",
  description: "Current conditions for your locations",
  hex: "#0ea5e9",
  icon: CloudSun,
  info: {
    about:
      "The Weather widget shows current weather conditions for one or more " +
      "locations on your ticker. Weather data updates automatically.",
    usage: [
      "Search for a city in the feed view to add it to your weather locations.",
      "Each location appears on the ticker with temperature, conditions, and an icon.",
      "Add multiple cities to track weather across different locations.",
      "Hide specific cities from the ticker in the Settings tab.",
    ],
  },
  FeedTab: WeatherFeedTab,
};

// ── FeedTab ─────────────────────────────────────────────────────

function WeatherFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";

  // City list — read from store, subscribe to cross-window updates
  const [cities, setCities] = useState<SavedCity[]>(loadCities);
  const [unit, setUnit] = useState(loadUnit);
  const [showSearch, setShowSearch] = useState(false);

  // Subscribe to store changes (from useWeatherData shell hook or other window)
  useEffect(() => {
    const unsubscribe = onStoreChange<SavedCity[]>(LS_WEATHER_CITIES, (next) => {
      const arr = Array.isArray(next) ? next : [];
      setCities(arr);
    });
    return unsubscribe;
  }, []);

  // Also refresh from store on mount (in case shell hook updated since last render)
  useEffect(() => {
    setCities(loadCities());
  }, []);

  // Add city — writes to store, shell hook picks up and fetches weather
  const addCity = useCallback((location: WeatherLocation) => {
    setCities((prev) => {
      const exists = prev.some(
        (c) => c.location.lat === location.lat && c.location.lon === location.lon,
      );
      if (exists) return prev;
      const next = [...prev, { location, weather: null, lastFetched: 0 }];
      saveCities(next);
      return next;
    });
    setShowSearch(false);
  }, []);

  // Remove city — writes to store
  const removeCity = useCallback(
    (lat: number, lon: number) => {
      setCities((prev) => {
        const next = prev.filter(
          (c) => c.location.lat !== lat || c.location.lon !== lon,
        );
        saveCities(next);
        return next;
      });
    },
    [],
  );

  // Refresh single city — fetches directly and writes to store
  const refreshCity = useCallback(
    (lat: number, lon: number) => {
      refreshCityWeather(lat, lon);
    },
    [],
  );

  // Toggle unit
  const toggleUnit = useCallback(() => {
    setUnit((prev) => {
      const next = prev === "celsius" ? "fahrenheit" : "celsius";
      saveUnit(next);
      return next;
    });
  }, []);

  // Detect location
  const detectLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`;
          const res = await fetch(url, {
            headers: { "User-Agent": "Scrollr/1.0" },
          });
          if (res.ok) {
            const data = (await res.json()) as {
              address?: {
                city?: string;
                town?: string;
                village?: string;
                state?: string;
                country?: string;
              };
            };
            const addr = data.address;
            if (addr) {
              const name =
                addr.city || addr.town || addr.village || "My Location";
              addCity({
                name,
                lat,
                lon,
                country: addr.country ?? "",
                admin1: addr.state,
              });
              return;
            }
          }
        } catch {
          /* fallback below */
        }
        addCity({ name: "My Location", lat, lon, country: "" });
      },
      () => {
        /* geolocation denied */
      },
    );
  }, [addCity]);

  // ── Empty state ─────────────────────────────────────────────
  if (cities.length === 0 && !showSearch) {
    return (
      <div className="p-4 flex flex-col items-center justify-center gap-3">
        <span className="text-2xl">{"\u2600"}</span>
        <span className="text-xs font-mono text-fg-2 text-center">
          Add a city to see weather
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSearch(true)}
            className="text-xs font-mono font-semibold text-widget-weather px-3 py-1.5 rounded-lg bg-widget-weather/10 border border-widget-weather/25 hover:bg-widget-weather/15 transition-colors"
          >
            Search City
          </button>
          <button
            onClick={detectLocation}
            className="text-xs font-mono text-fg px-3 py-1.5 rounded-lg bg-surface-2 border border-edge hover:border-edge-2 transition-colors"
          >
            Use My Location
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────
  return (
    <div className="p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold text-widget-weather/80 uppercase tracking-wider">
            Weather
          </span>
          <button
            onClick={toggleUnit}
            className="text-[11px] font-mono text-fg-2 hover:text-fg px-1.5 py-0.5 rounded border border-edge hover:border-edge-2 transition-colors"
          >
            {unit === "celsius" ? "\u00B0C" : "\u00B0F"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Use my location">
            <button
              onClick={detectLocation}
              className="text-xs font-mono text-widget-weather/70 hover:text-widget-weather transition-colors"
            >
              {"\u{1F4CD}"}
            </button>
          </Tooltip>
          <button
            onClick={() => {
              setShowSearch(!showSearch);
            }}
            className="text-xs font-mono text-widget-weather/70 hover:text-widget-weather transition-colors"
          >
            {showSearch ? "Done" : "+ Add"}
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && <CitySearch onSelect={addCity} />}

      {/* Weather cards */}
      <div className={compact ? "space-y-1" : "grid gap-2"}>
        {cities.map((city) => (
          <WeatherCard
            key={`${city.location.lat}-${city.location.lon}`}
            city={city}
            unit={unit}
            compact={compact}
            onRemove={() =>
              removeCity(city.location.lat, city.location.lon)
            }
            onRefresh={() =>
              refreshCity(city.location.lat, city.location.lon)
            }
          />
        ))}
      </div>
    </div>
  );
}
