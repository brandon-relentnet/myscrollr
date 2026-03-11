/**
 * Weather widget FeedTab — desktop-native.
 *
 * Shows current weather for user-selected cities using the
 * Open-Meteo API (free, no API key required). Cities and unit
 * preference are persisted to localStorage.
 * TODO: Phase E — migrate to Tauri store plugin.
 */
import { useState, useEffect, useCallback } from "react";
import { CloudSun } from "lucide-react";
import { WeatherCard } from "./WeatherCard";
import { CitySearch } from "./CitySearch";
import type { FeedTabProps, WidgetManifest } from "../../types";
import type { WeatherLocation } from "./types";
import {
  loadCities,
  saveCities,
  loadUnit,
  saveUnit,
  fetchWeather,
  CACHE_TTL,
} from "./types";

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
      "locations on your ticker. Data is fetched from the Open-Meteo API " +
      "with no API key required.",
    usage: [
      "Search for a city in the feed view to add it to your weather locations.",
      "Each location appears as a ticker chip with temperature, conditions, and an icon.",
      "Add multiple cities to track weather across different locations.",
      "Exclude specific cities from the ticker in the Configuration tab.",
    ],
  },
  FeedTab: WeatherFeedTab,
};

// ── FeedTab ─────────────────────────────────────────────────────

function WeatherFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const [cities, setCities] = useState(loadCities);
  const [unit, setUnit] = useState(loadUnit);
  const [showSearch, setShowSearch] = useState(false);

  // Persist cities on change
  useEffect(() => {
    saveCities(cities);
  }, [cities]);

  // Fetch weather for cities that need it (stale or no data)
  useEffect(() => {
    let cancelled = false;

    async function refreshAll(): Promise<void> {
      const now = Date.now();
      const needsUpdate = cities.filter(
        (c) => !c.weather || now - c.lastFetched > CACHE_TTL,
      );
      if (needsUpdate.length === 0) return;

      const updates = await Promise.allSettled(
        needsUpdate.map(async (c) => {
          const weather = await fetchWeather(c.location.lat, c.location.lon);
          return { location: c.location, weather };
        }),
      );

      if (cancelled) return;

      setCities((prev) =>
        prev.map((c) => {
          const idx = needsUpdate.findIndex(
            (n) =>
              n.location.lat === c.location.lat &&
              n.location.lon === c.location.lon,
          );
          if (idx === -1) return c;
          const result = updates[idx];
          if (!result) return c;
          if (result.status === "fulfilled") {
            return {
              ...c,
              weather: result.value.weather,
              lastFetched: Date.now(),
              error: undefined,
            };
          }
          return {
            ...c,
            error: "Failed to fetch",
            lastFetched: Date.now(),
          };
        }),
      );
    }

    refreshAll();

    const interval = setInterval(refreshAll, CACHE_TTL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cities.length]);

  // Add city
  const addCity = useCallback((location: WeatherLocation) => {
    setCities((prev) => {
      const exists = prev.some(
        (c) =>
          c.location.lat === location.lat && c.location.lon === location.lon,
      );
      if (exists) return prev;
      return [...prev, { location, weather: null, lastFetched: 0 }];
    });
    setShowSearch(false);
  }, []);

  // Remove city
  const removeCity = useCallback((lat: number, lon: number) => {
    setCities((prev) =>
      prev.filter((c) => c.location.lat !== lat || c.location.lon !== lon),
    );
  }, []);

  // Refresh single city
  const refreshCity = useCallback((lat: number, lon: number) => {
    (async () => {
      try {
        const weather = await fetchWeather(lat, lon);
        setCities((prev) =>
          prev.map((c) =>
            c.location.lat === lat && c.location.lon === lon
              ? { ...c, weather, lastFetched: Date.now(), error: undefined }
              : c,
          ),
        );
      } catch {
        setCities((prev) =>
          prev.map((c) =>
            c.location.lat === lat && c.location.lon === lon
              ? { ...c, error: "Failed to fetch", lastFetched: Date.now() }
              : c,
          ),
        );
      }
    })();
  }, []);

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
            Use Location
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
          <button
            onClick={detectLocation}
            className="text-xs font-mono text-widget-weather/70 hover:text-widget-weather transition-colors"
            title="Detect location"
          >
            {"\u{1F4CD}"}
          </button>
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
