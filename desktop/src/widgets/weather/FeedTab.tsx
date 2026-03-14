/**
 * Weather widget FeedTab — desktop-native.
 *
 * Shows current weather for user-selected cities using the
 * Open-Meteo API (free, no API key required). Cities and unit
 * preference are persisted to localStorage.
 *
 * Weather fetching is managed by TanStack Query (useQueries).
 * Query results are synced back to localStorage so the ticker
 * window can read them via StorageEvent.
 *
 * TODO: Phase E — migrate to Tauri store plugin.
 */
import { useState, useEffect, useCallback } from "react";
import Tooltip from "../../components/Tooltip";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { CloudSun } from "lucide-react";
import { WeatherCard } from "./WeatherCard";
import { CitySearch } from "./CitySearch";
import type { FeedTabProps, WidgetManifest } from "../../types";
import type { WeatherLocation } from "./types";
import { loadCities, saveCities, loadUnit, saveUnit } from "./types";
import { weatherQueryOptions } from "../../api/queries";

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
  const queryClient = useQueryClient();

  // City list is local state backed by localStorage
  const [cities, setCities] = useState(loadCities);
  const [unit, setUnit] = useState(loadUnit);
  const [showSearch, setShowSearch] = useState(false);

  // Persist cities on change
  useEffect(() => {
    saveCities(cities);
  }, [cities]);

  // Fetch weather for each city using TanStack Query
  const weatherQueries = useQueries({
    queries: cities.map((city) => ({
      ...weatherQueryOptions(city.location.lat, city.location.lon),
      // Use existing weather as initial data if available and non-null
      ...(city.weather ? { initialData: city.weather } : {}),
    })),
  });

  // Sync query results back to cities (for localStorage persistence)
  useEffect(() => {
    let hasUpdates = false;
    const updated = cities.map((city, i) => {
      const query = weatherQueries[i];
      if (query?.data && query.data !== city.weather) {
        hasUpdates = true;
        return { ...city, weather: query.data, lastFetched: Date.now(), error: undefined };
      }
      if (query?.error && !city.error) {
        hasUpdates = true;
        return { ...city, error: "Couldn't get weather data", lastFetched: Date.now() };
      }
      return city;
    });
    if (hasUpdates) {
      setCities(updated);
    }
    // Only sync when query data actually changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherQueries.map((q) => q.dataUpdatedAt).join(",")]);

  // Add city
  const addCity = useCallback((location: WeatherLocation) => {
    setCities((prev) => {
      const exists = prev.some(
        (c) => c.location.lat === location.lat && c.location.lon === location.lon,
      );
      if (exists) return prev;
      return [...prev, { location, weather: null, lastFetched: 0 }];
    });
    setShowSearch(false);
  }, []);

  // Remove city
  const removeCity = useCallback(
    (lat: number, lon: number) => {
      setCities((prev) =>
        prev.filter((c) => c.location.lat !== lat || c.location.lon !== lon),
      );
      // Also remove from query cache
      queryClient.removeQueries({ queryKey: ["weather", lat, lon] });
    },
    [queryClient],
  );

  // Refresh single city
  const refreshCity = useCallback(
    (lat: number, lon: number) => {
      queryClient.invalidateQueries({ queryKey: ["weather", lat, lon] });
    },
    [queryClient],
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
