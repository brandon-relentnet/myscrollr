import { useState, useMemo, useCallback } from "react";
import clsx from "clsx";
import CategoryFilter from "../rss/CategoryFilter";
import { formatCountdown } from "../../utils/gameHelpers";
import type { TrackedLeague } from "../../api/queries";

// ── Types ────────────────────────────────────────────────────────

interface LeagueCatalogProps {
  catalog: TrackedLeague[];
  subscribedNames: Set<string>;
  onAdd: (name: string) => void;
  loading: boolean;
  error: boolean;
  atLimit: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────

function leagueStatus(league: TrackedLeague): React.ReactNode {
  if (league.live_count > 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        {league.live_count} Live
      </span>
    );
  }
  if (league.game_count > 0) {
    return (
      <span className="text-[10px] text-fg-3">
        {league.game_count} game{league.game_count !== 1 ? "s" : ""}
      </span>
    );
  }
  if (league.is_offseason) {
    return <span className="text-[10px] text-fg-3">Off-season</span>;
  }
  if (league.next_game) {
    return (
      <span className="text-[10px] text-fg-3">
        Next: {formatCountdown(league.next_game)}
      </span>
    );
  }
  return <span className="text-[10px] text-fg-3">Off-season</span>;
}

// ── Component ────────────────────────────────────────────────────

export default function LeagueCatalog({
  catalog,
  subscribedNames,
  onAdd,
  loading,
  error,
  atLimit,
}: LeagueCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(),
  );

  // Derive sport categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of catalog) {
      map.set(l.category, (map.get(l.category) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [catalog]);

  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Filter catalog
  const filtered = useMemo(() => {
    let list = catalog;
    if (selectedCategories.size > 0) {
      list = list.filter((l) => selectedCategories.has(l.category));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.country.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalog, selectedCategories, search]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-fg-3">Failed to load league catalog</p>
        <p className="text-[11px] text-fg-3 mt-1">
          Check your connection and try again
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-fg">Add Leagues</h3>
        <p className="text-[11px] text-fg-3 mt-0.5">
          Browse {catalog.length} available leagues
        </p>
      </div>

      {/* Search + Category filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leagues..."
          className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-3 focus:outline-none focus:border-accent/60 transition-colors"
        />
        <CategoryFilter
          categories={categories}
          selected={selectedCategories}
          onToggle={toggleCategory}
          onClearAll={() => setSelectedCategories(new Set())}
        />
      </div>

      {/* Active filter chips */}
      {selectedCategories.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selectedCategories).map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/15 border border-accent/30 text-[10px] text-accent hover:bg-accent/25 transition-colors cursor-pointer"
            >
              {cat}
              <span className="opacity-60">&times;</span>
            </button>
          ))}
          <button
            onClick={() => setSelectedCategories(new Set())}
            className="px-2 py-0.5 text-[10px] text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Catalog grid */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-3 animate-pulse">
            Loading catalog...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-3">
            No leagues match your search
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {filtered.map((league) => {
            const isAdded = subscribedNames.has(league.name);
            return (
              <div
                key={league.name}
                className={clsx(
                  "flex flex-col gap-1 p-2.5 rounded-lg border transition-colors",
                  isAdded
                    ? "border-accent/30 bg-accent/5"
                    : "border-edge/30 hover:border-edge/40",
                )}
              >
                {/* Top row: logo + name + sport badge */}
                <div className="flex items-start gap-1.5">
                  <img
                    src={league.logo_url}
                    alt=""
                    className="w-5 h-5 object-contain shrink-0 mt-px"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-semibold text-fg-2 leading-tight line-clamp-1">
                      {league.name}
                    </span>
                    <p className="text-[9px] text-fg-3 truncate">
                      {league.country}
                    </p>
                  </div>
                  <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-[#f97316]/10 shrink-0 whitespace-nowrap">
                    {league.category}
                  </span>
                </div>

                {/* Status + action */}
                <div className="flex items-center justify-between mt-auto pt-1">
                  {leagueStatus(league)}
                  {isAdded ? (
                    <span className="text-[11px] text-fg-3">Added &#10003;</span>
                  ) : (
                    <button
                      onClick={() => onAdd(league.name)}
                      disabled={atLimit}
                      className="text-[11px] text-green-500 hover:text-green-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
