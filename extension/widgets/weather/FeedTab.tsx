import { useState, useEffect, useCallback, useRef } from "react";
import type { FeedTabProps } from "~/channels/types";
import type { WidgetManifest } from "../types";

// ── Types ───────────────────────────────────────────────────────

interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
  country: string;
  /** Admin region (state, province, etc.) */
  admin1?: string;
}

interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  /** WMO weather code */
  weatherCode: number;
  isDay: boolean;
}

interface SavedCity {
  location: WeatherLocation;
  weather: CurrentWeather | null;
  lastFetched: number;
  error?: string;
}

// ── WMO Weather Codes ───────────────────────────────────────────
// https://open-meteo.com/en/docs — WMO Weather interpretation codes

function weatherCodeToLabel(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly Clear";
  if (code === 2) return "Partly Cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 56 && code <= 57) return "Freezing Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 66 && code <= 67) return "Freezing Rain";
  if (code >= 71 && code <= 75) return "Snow";
  if (code === 77) return "Snow Grains";
  if (code >= 80 && code <= 82) return "Rain Showers";
  if (code >= 85 && code <= 86) return "Snow Showers";
  if (code === 95) return "Thunderstorm";
  if (code >= 96 && code <= 99) return "Hail Storm";
  return "Unknown";
}

function weatherCodeToIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600" : "\u263E"; // ☀ / ☾
  if (code <= 2) return isDay ? "\u26C5" : "\u263E"; // ⛅ / ☾
  if (code === 3) return "\u2601"; // ☁
  if (code === 45 || code === 48) return "\u2588"; // fog block
  if (code >= 51 && code <= 55) return "\u2602"; // ☂ drizzle
  if (code >= 56 && code <= 57) return "\u2602"; // ☂ freezing drizzle
  if (code >= 61 && code <= 65) return "\u2614"; // ☔ rain
  if (code >= 66 && code <= 67) return "\u2614"; // ☔ freezing rain
  if (code >= 71 && code <= 77) return "\u2744"; // ❄ snow
  if (code >= 80 && code <= 82) return "\u2614"; // ☔ rain showers
  if (code >= 85 && code <= 86) return "\u2744"; // ❄ snow showers
  if (code >= 95) return "\u26A1"; // ⚡ thunderstorm
  return "\u2601"; // ☁ default
}

function windDirectionToLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8] ?? "N";
}

// ── Storage ─────────────────────────────────────────────────────

const STORAGE_KEY = "scrollr:widget:weather:cities";
const UNIT_KEY = "scrollr:widget:weather:unit";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

type TempUnit = "celsius" | "fahrenheit";

function loadCities(): SavedCity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedCity[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

function saveCities(cities: SavedCity[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
}

function loadUnit(): TempUnit {
  try {
    const raw = localStorage.getItem(UNIT_KEY);
    if (raw === "celsius" || raw === "fahrenheit") return raw;
  } catch {
    // ignore
  }
  return "fahrenheit";
}

function saveUnit(unit: TempUnit): void {
  localStorage.setItem(UNIT_KEY, unit);
}

function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function formatTemp(celsius: number, unit: TempUnit): string {
  const val = unit === "fahrenheit" ? toFahrenheit(celsius) : celsius;
  return `${Math.round(val)}\u00B0`;
}

/** Wind speed from Open-Meteo is always km/h. Convert to mph for imperial. */
function formatWind(kmh: number, unit: TempUnit): string {
  if (unit === "fahrenheit") {
    return `${Math.round(kmh * 0.621371)} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

// ── Inline SVG Icons ────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M3 3L9 9M9 3L3 9" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 5.5A4 4 0 0 0 2.5 4M2 6.5A4 4 0 0 0 9.5 8" />
      <path d="M10 2.5V5.5H7M2 9.5V6.5H5" />
    </svg>
  );
}

// ── Open-Meteo API ──────────────────────────────────────────────

async function searchCities(query: string): Promise<WeatherLocation[]> {
  if (query.trim().length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      country: string;
      admin1?: string;
    }>;
  };
  if (!data.results) return [];
  return data.results.map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

async function fetchWeather(
  lat: number,
  lon: number,
): Promise<CurrentWeather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,is_day`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API ${res.status}`);
  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      relative_humidity_2m: number;
      apparent_temperature: number;
      weather_code: number;
      wind_speed_10m: number;
      wind_direction_10m: number;
      is_day: number;
    };
  };
  const c = data.current;
  return {
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    windDirection: c.wind_direction_10m,
    weatherCode: c.weather_code,
    isDay: c.is_day === 1,
  };
}

// ── Weather Card ────────────────────────────────────────────────

function WeatherCard({
  city,
  unit,
  compact,
  onRemove,
  onRefresh,
}: {
  city: SavedCity;
  unit: TempUnit;
  compact: boolean;
  onRemove: () => void;
  onRefresh: () => void;
}) {
  const { location, weather, error } = city;
  const label = location.admin1
    ? `${location.name}, ${location.admin1}`
    : `${location.name}, ${location.country}`;

  if (compact) {
    return (
      <div
        className="group flex items-center justify-between px-3 py-2 rounded-lg bg-widget-weather/[0.04] border border-widget-weather/10 hover:border-widget-weather/20 transition-colors"
        style={{ animation: "widget-card-enter 0.25s ease-out both" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-mono text-widget-weather/80 uppercase tracking-wider shrink-0 w-24 truncate">
            {location.name}
          </span>
          {weather ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {weatherCodeToIcon(weather.weatherCode, weather.isDay)}
              </span>
              <span className="text-sm font-mono font-semibold text-fg tabular-nums">
                {formatTemp(weather.temperature, unit)}
              </span>
              <span className="text-[11px] font-mono text-fg-2">
                {weatherCodeToLabel(weather.weatherCode)}
              </span>
            </div>
          ) : error ? (
            <span className="text-[11px] font-mono text-error truncate">
              {error}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-fg-3">Loading...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            className="text-fg-3 hover:text-widget-weather opacity-0 group-hover:opacity-100 transition-opacity"
            title="Refresh"
          >
            <RefreshIcon />
          </button>
          <button
            onClick={onRemove}
            className="text-fg-3 hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove city"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="group relative px-4 py-3 rounded-xl bg-widget-weather/[0.04] border border-widget-weather/10 hover:border-widget-weather/20 transition-colors"
      style={{ animation: "widget-card-enter 0.25s ease-out both" }}
    >
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onRefresh}
          className="text-fg-3 hover:text-widget-weather p-0.5"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
        <button
          onClick={onRemove}
          className="text-fg-3 hover:text-error p-0.5"
          title="Remove city"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono text-widget-weather/80 uppercase tracking-wider truncate">
          {label}
        </span>
      </div>

      {weather ? (
        <>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">
              {weatherCodeToIcon(weather.weatherCode, weather.isDay)}
            </span>
            <div>
              <div className="text-xl font-mono font-bold text-fg tabular-nums leading-none">
                {formatTemp(weather.temperature, unit)}
              </div>
              <div className="text-xs font-mono text-fg-2 mt-0.5">
                Feels {formatTemp(weather.feelsLike, unit)}
              </div>
            </div>
          </div>

          <div className="text-xs font-mono text-fg mb-2">
            {weatherCodeToLabel(weather.weatherCode)}
          </div>

          <div className="flex items-center gap-4 text-[11px] font-mono text-fg-2">
            <span>
              {"\u{1F4A7}"} {weather.humidity}%
            </span>
            <span>
              {"\u{1F4A8}"} {formatWind(weather.windSpeed, unit)}{" "}
              {windDirectionToLabel(weather.windDirection)}
            </span>
          </div>
        </>
      ) : error ? (
        <div className="py-3">
          <span className="text-xs font-mono text-error">{error}</span>
          <button
            onClick={onRefresh}
            className="block text-[11px] font-mono text-widget-weather/70 hover:text-widget-weather mt-1 transition-colors"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="py-3">
          <span className="text-[11px] font-mono text-fg-3">
            Loading weather...
          </span>
        </div>
      )}
    </div>
  );
}

// ── FeedTab Component ───────────────────────────────────────────

function WeatherFeedTab({ mode: feedMode }: FeedTabProps) {
  const compact = feedMode === "compact";
  const [cities, setCities] = useState(loadCities);
  const [unit, setUnit] = useState(loadUnit);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WeatherLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Persist cities on change
  useEffect(() => {
    saveCities(cities);
  }, [cities]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSearch]);

  // Debounced city search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchCities(searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

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

    // Refresh every 10 minutes
    const interval = setInterval(refreshAll, CACHE_TTL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cities.length]); // Re-run when cities are added/removed

  // Add city
  const addCity = useCallback((location: WeatherLocation) => {
    setCities((prev) => {
      const exists = prev.some(
        (c) =>
          c.location.lat === location.lat && c.location.lon === location.lon,
      );
      if (exists) return prev;
      return [
        ...prev,
        { location, weather: null, lastFetched: 0 },
      ];
    });
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
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
          // Reverse geocode with Nominatim (free, no key, supports lat/lon)
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
                country_code?: string;
              };
            };
            const addr = data.address;
            if (addr) {
              const name = addr.city || addr.town || addr.village || "My Location";
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
          // Fallback below
        }
        // Fallback: use raw coordinates
        addCity({
          name: "My Location",
          lat,
          lon,
          country: "",
        });
      },
      () => {
        // Geolocation denied or failed — no-op
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
              if (showSearch) {
                setSearchQuery("");
                setSearchResults([]);
              }
            }}
            className="text-xs font-mono text-widget-weather/70 hover:text-widget-weather transition-colors"
          >
            {showSearch ? "Done" : "+ Add"}
          </button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="space-y-1">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search city..."
            className="w-full px-3 py-1.5 text-xs font-mono bg-surface-2 border border-widget-weather/15 rounded-lg text-fg placeholder:text-fg-3 outline-none focus:border-widget-weather/30 transition-colors"
          />
          {isSearching && (
            <span className="block text-[11px] font-mono text-fg-3 px-1">
              Searching...
            </span>
          )}
          {searchResults.length > 0 && (
            <div className="rounded-lg border border-widget-weather/15 bg-surface-2 overflow-hidden max-h-40 overflow-y-auto scrollbar-thin">
              {searchResults.map((r) => {
                const sublabel = [r.admin1, r.country]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <button
                    key={`${r.lat}-${r.lon}`}
                    onClick={() => addCity(r)}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-widget-weather/[0.06] transition-colors"
                  >
                    <span className="text-xs font-mono text-fg">
                      {r.name}
                    </span>
                    <span className="text-[11px] font-mono text-fg-2 truncate ml-2">
                      {sublabel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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

// ── Manifest ────────────────────────────────────────────────────

export const weatherWidget: WidgetManifest = {
  id: "weather",
  name: "Weather",
  tabLabel: "Weather",
  hex: "#0ea5e9",
  FeedTab: WeatherFeedTab,
};

export default WeatherFeedTab;
