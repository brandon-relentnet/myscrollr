/**
 * Shell-level weather polling hook.
 *
 * Runs at the __root level so weather data stays fresh regardless of
 * which page the user is viewing. Fetches from Open-Meteo every 10
 * minutes and writes results to the Tauri store. Both the main window
 * (WeatherFeedTab) and the ticker window (useWidgetTickerData) read
 * from the store.
 *
 * Follows the same pattern as useSysmonData: module-level fetch →
 * store write → store subscription in consumers.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getStore, setStore, onStoreChange } from "../lib/store";
import { LS_WEATHER_CITIES } from "../constants";
import type { SavedCity, CurrentWeather } from "../widgets/weather/types";
import { fetchWeather } from "../widgets/weather/types";

/** How often to poll the Open-Meteo API (ms). */
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch fresh weather for every city and write results to the store.
 * Returns the updated city list.
 */
async function fetchAllWeather(cities: SavedCity[]): Promise<SavedCity[]> {
  if (cities.length === 0) return cities;

  const results = await Promise.allSettled(
    cities.map((city) => fetchWeather(city.location.lat, city.location.lon)),
  );

  let hasChanges = false;
  const updated = cities.map((city, i) => {
    const result = results[i];
    if (result.status === "fulfilled") {
      hasChanges = true;
      return {
        ...city,
        weather: result.value,
        lastFetched: Date.now(),
        error: undefined,
      };
    }
    // On failure, keep existing weather data (don't nuke it)
    return city;
  });

  if (hasChanges) {
    setStore(LS_WEATHER_CITIES, updated);
  }

  return updated;
}

/**
 * Shell-level hook that keeps weather data fresh.
 * Call this in __root.tsx — it runs as long as weather cities exist.
 *
 * @param enabled - Only poll when weather widget is enabled.
 */
export function useWeatherData(enabled: boolean): SavedCity[] {
  const [cities, setCities] = useState<SavedCity[]>(() =>
    enabled ? (getStore<SavedCity[]>(LS_WEATHER_CITIES, []) ?? []) : [],
  );
  const mountedRef = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    const current = getStore<SavedCity[]>(LS_WEATHER_CITIES, []) ?? [];
    if (current.length === 0) return;

    const updated = await fetchAllWeather(current);
    if (mountedRef.current) {
      setCities(updated);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      setCities([]);
      return;
    }

    // Load initial data from store
    const initial = getStore<SavedCity[]>(LS_WEATHER_CITIES, []) ?? [];
    setCities(initial);

    // Fetch immediately if any city has stale or missing weather
    const needsFetch = initial.some(
      (c) => !c.weather || Date.now() - c.lastFetched > POLL_INTERVAL,
    );
    if (needsFetch && initial.length > 0) {
      poll();
    }

    // Set up recurring poll
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    // Listen for store changes from FeedTab (city add/remove/manual refresh)
    const unsubscribe = onStoreChange<SavedCity[]>(LS_WEATHER_CITIES, (next) => {
      if (mountedRef.current) {
        const arr = Array.isArray(next) ? next : [];
        setCities(arr);
      }
    });

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      unsubscribe();
    };
  }, [enabled, poll]);

  return cities;
}

/**
 * Force an immediate weather refresh. Called by FeedTab's refresh button.
 */
export async function refreshWeather(): Promise<void> {
  const cities = getStore<SavedCity[]>(LS_WEATHER_CITIES, []) ?? [];
  await fetchAllWeather(cities);
}

/**
 * Refresh weather for a single city by coordinates.
 */
export async function refreshCityWeather(lat: number, lon: number): Promise<void> {
  const cities = getStore<SavedCity[]>(LS_WEATHER_CITIES, []) ?? [];
  const idx = cities.findIndex(
    (c) => c.location.lat === lat && c.location.lon === lon,
  );
  if (idx === -1) return;

  try {
    const weather: CurrentWeather = await fetchWeather(lat, lon);
    const updated = [...cities];
    updated[idx] = {
      ...updated[idx],
      weather,
      lastFetched: Date.now(),
      error: undefined,
    };
    setStore(LS_WEATHER_CITIES, updated);
  } catch {
    // Keep existing data on failure
  }
}
