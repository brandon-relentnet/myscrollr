/**
 * CitySearch — debounced city search using Open-Meteo Geocoding API.
 */
import { useState, useEffect, useRef } from "react";
import { searchCities } from "./types";
import type { WeatherLocation } from "./types";

interface CitySearchProps {
  onSelect: (location: WeatherLocation) => void;
}

export function CitySearch({ onSelect }: CitySearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await searchCities(query);
        setResults(r);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search city..."
        className="w-full px-3 py-1.5 text-xs font-mono bg-surface-2 border border-widget-weather/15 rounded-lg text-fg placeholder:text-fg-3 outline-none focus:border-widget-weather/30 transition-colors"
      />
      {isSearching && (
        <span className="block text-[11px] font-mono text-fg-3 px-1">
          Searching...
        </span>
      )}
      {results.length > 0 && (
        <div className="rounded-lg border border-widget-weather/15 bg-surface-2 overflow-hidden max-h-40 overflow-y-auto scrollbar-thin">
          {results.map((r) => {
            const sublabel = [r.admin1, r.country]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={`${r.lat}-${r.lon}`}
                onClick={() => onSelect(r)}
                className="flex items-center justify-between w-full px-3 py-1.5 text-left hover:bg-widget-weather/[0.06] transition-colors"
              >
                <span className="text-xs font-mono text-fg">{r.name}</span>
                <span className="text-[11px] font-mono text-fg-2 truncate ml-2">
                  {sublabel}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
