/**
 * Weather widget types.
 */

export interface WeatherLocation {
  name: string;
  lat: number;
  lon: number;
  country: string;
  /** Admin region (state, province, etc.) */
  admin1?: string;
}

export interface CurrentWeather {
  temperature: number;
  feelsLike: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  /** WMO weather code */
  weatherCode: number;
  isDay: boolean;
}

export interface SavedCity {
  location: WeatherLocation;
  weather: CurrentWeather | null;
  lastFetched: number;
  error?: string;
}

export type TempUnit = "celsius" | "fahrenheit";

// ── WMO Weather Codes ───────────────────────────────────────────

export function weatherCodeToLabel(code: number): string {
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

export function weatherCodeToIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? "\u2600" : "\u263E";
  if (code <= 2) return isDay ? "\u26C5" : "\u263E";
  if (code === 3) return "\u2601";
  if (code === 45 || code === 48) return "\u2588";
  if (code >= 51 && code <= 55) return "\u2602";
  if (code >= 56 && code <= 57) return "\u2602";
  if (code >= 61 && code <= 65) return "\u2614";
  if (code >= 66 && code <= 67) return "\u2614";
  if (code >= 71 && code <= 77) return "\u2744";
  if (code >= 80 && code <= 82) return "\u2614";
  if (code >= 85 && code <= 86) return "\u2744";
  if (code >= 95) return "\u26A1";
  return "\u2601";
}

export function windDirectionToLabel(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8] ?? "N";
}

// ── Formatting ──────────────────────────────────────────────────

function toFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function formatTemp(celsius: number, unit: TempUnit): string {
  const val = unit === "fahrenheit" ? toFahrenheit(celsius) : celsius;
  return `${Math.round(val)}\u00B0`;
}

export function formatWind(kmh: number, unit: TempUnit): string {
  if (unit === "fahrenheit") {
    return `${Math.round(kmh * 0.621371)} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

// ── Storage ─────────────────────────────────────────────────────

const STORAGE_KEY = "scrollr:widget:weather:cities";
const UNIT_KEY = "scrollr:widget:weather:unit";
export const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function loadCities(): SavedCity[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SavedCity[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function saveCities(cities: SavedCity[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cities));
}

export function loadUnit(): TempUnit {
  try {
    const raw = localStorage.getItem(UNIT_KEY);
    if (raw === "celsius" || raw === "fahrenheit") return raw;
  } catch {
    /* ignore */
  }
  return "fahrenheit";
}

export function saveUnit(unit: TempUnit): void {
  localStorage.setItem(UNIT_KEY, unit);
}

// ── Open-Meteo API ──────────────────────────────────────────────

export async function searchCities(
  query: string,
): Promise<WeatherLocation[]> {
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

export async function fetchWeather(
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
