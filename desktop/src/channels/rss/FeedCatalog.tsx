import { useState, useMemo, useCallback } from "react";
import clsx from "clsx";
import CategoryFilter from "./CategoryFilter";
import type { TrackedFeed } from "../../api/client";

// ── Types ────────────────────────────────────────────────────────

interface FeedCatalogProps {
  catalog: TrackedFeed[];
  subscribedUrls: Set<string>;
  onAdd: (url: string) => void;
  loading: boolean;
  error: boolean;
  atLimit: boolean;
}

// ── Component ────────────────────────────────────────────────────

export default function FeedCatalog({
  catalog,
  subscribedUrls,
  onAdd,
  loading,
  error,
  atLimit,
}: FeedCatalogProps) {
  const [search, setSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(),
  );

  // Derive categories with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of catalog) {
      map.set(f.category, (map.get(f.category) ?? 0) + 1);
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
      list = list.filter((f) => selectedCategories.has(f.category));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.url.toLowerCase().includes(q),
      );
    }
    return list;
  }, [catalog, selectedCategories, search]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-fg-3">Failed to load feed catalog</p>
        <p className="text-[11px] text-fg-4 mt-1">
          Check your connection and try again
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-fg">Add Feeds</h3>
        <p className="text-[11px] text-fg-4 mt-0.5">
          Browse and add from {catalog.length} curated sources
        </p>
      </div>

      {/* Search + Category filter */}
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search catalog..."
          className="flex-1 px-2.5 py-1.5 rounded-md bg-base-200 border border-edge/40 text-[11px] text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/60 transition-colors"
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
              <span className="opacity-60">×</span>
            </button>
          ))}
          <button
            onClick={() => setSelectedCategories(new Set())}
            className="px-2 py-0.5 text-[10px] text-fg-4 hover:text-fg-3 transition-colors cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Catalog grid */}
      {loading ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-4 animate-pulse">
            Loading catalog...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-[11px] text-fg-4">No feeds match your search</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {filtered.map((feed) => {
            const isAdded = subscribedUrls.has(feed.url);
            return (
              <div
                key={feed.url}
                className={clsx(
                  "flex flex-col gap-1 p-2.5 rounded-lg border transition-colors",
                  isAdded
                    ? "border-accent/30 bg-accent/5"
                    : "border-edge/30 hover:border-edge/40",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[12px] font-semibold text-fg-2 leading-tight">
                    {feed.name}
                    {isAdded && (
                      <span className="text-accent text-[10px] ml-1">✓</span>
                    )}
                  </span>
                  <span className="px-1.5 py-px rounded text-[9px] text-fg-3 bg-accent/10 shrink-0 whitespace-nowrap">
                    {feed.category}
                  </span>
                </div>
                {!feed.is_default && (
                  <span className="text-[9px] text-amber-500">custom</span>
                )}
                <div className="mt-auto pt-1">
                  {isAdded ? (
                    <span className="text-[11px] text-fg-3">Added</span>
                  ) : (
                    <button
                      onClick={() => onAdd(feed.url)}
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
