import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { Section } from "./SettingsControls";

// ── Types ────────────────────────────────────────────────────────

interface CatalogBrowserProps<T> {
  /** Section heading */
  title: string;
  /** Catalog items to browse */
  items: T[];
  /** Unique key extractor */
  getKey: (item: T) => string;
  /** Set of selected item keys */
  selectedKeys: Set<string>;
  /** Category extractor — return the category string for an item */
  getCategory: (item: T) => string;
  /** Whether item matches a search query */
  matchesSearch: (item: T, query: string) => boolean;
  /** Render a single catalog grid item */
  renderItem: (item: T, isAdded: boolean) => React.ReactNode;
  /** Channel accent hex */
  hex: string;
  /** Search input placeholder */
  searchPlaceholder?: string;
  /** Items per page */
  pageSize?: number;
  /** Whether save is in progress */
  saving?: boolean;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: boolean;
  /** Callbacks */
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  onBulkAdd?: (keys: string[]) => void;
  onBulkRemove?: (keys: string[]) => void;
}

// ── Component ────────────────────────────────────────────────────

export function CatalogBrowser<T>({
  title,
  items,
  getKey,
  selectedKeys,
  getCategory,
  matchesSearch,
  renderItem,
  hex,
  searchPlaceholder = "Search...",
  pageSize = 24,
  saving = false,
  loading = false,
  error = false,
  onAdd,
  onRemove,
  onBulkAdd,
  onBulkRemove,
}: CatalogBrowserProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);

  // Derive categories
  const categories = [
    "All",
    ...Array.from(new Set(items.map(getCategory))).sort(),
  ];

  // Filter
  const filtered = items.filter((item) => {
    const matchesCat =
      activeCategory === "All" || getCategory(item) === activeCategory;
    const matchesQ = !searchQuery || matchesSearch(item, searchQuery);
    return matchesCat && matchesQ;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Bulk counts for active category
  const catItems = items
    .filter((i) => activeCategory === "All" || getCategory(i) === activeCategory)
    .map(getKey);
  const catAdded = catItems.filter((k) => selectedKeys.has(k)).length;
  const catAvailable = catItems.length - catAdded;

  return (
    <Section title={title}>
      <div className="space-y-3 px-3">
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-4"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder={searchPlaceholder}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
          />
        </div>

        {/* Category tabs */}
        {categories.length > 2 && (
          <div className="flex flex-wrap gap-0.5 p-0.5 rounded-lg bg-base-200 border border-edge/30">
            {categories.map((cat) => {
              const isActive = activeCategory === cat;
              const catTotal = items.filter(
                (i) => cat === "All" || getCategory(i) === cat,
              ).length;
              const catSelected = items.filter(
                (i) =>
                  (cat === "All" || getCategory(i) === cat) &&
                  selectedKeys.has(getKey(i)),
              ).length;
              return (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setCurrentPage(1);
                  }}
                  className={clsx(
                    "relative px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-base-300 text-fg shadow-sm"
                      : "text-fg-3 hover:text-fg-2",
                  )}
                >
                  {cat}
                  <span className="ml-1 text-[10px] opacity-50">
                    {catSelected}/{catTotal}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Bulk actions */}
        {(onBulkAdd || onBulkRemove) && (catAvailable > 0 || catAdded > 0) && (
          <div className="flex items-center gap-2">
            {onBulkAdd && catAvailable > 0 && (
              <button
                onClick={() => {
                  const toAdd = catItems.filter((k) => !selectedKeys.has(k));
                  onBulkAdd(toAdd);
                }}
                disabled={saving}
                className="text-[11px] font-medium text-fg-3 hover:text-accent px-2 py-1 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
              >
                + Add all ({catAvailable})
              </button>
            )}
            {onBulkRemove && catAdded > 0 && (
              <button
                onClick={() => {
                  const toRemove = catItems.filter((k) => selectedKeys.has(k));
                  onBulkRemove(toRemove);
                }}
                disabled={saving}
                className="text-[11px] font-medium text-fg-3 hover:text-error px-2 py-1 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
              >
                Remove all ({catAdded})
              </button>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-8">
            <motion.span
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-[11px] font-mono text-fg-4"
            >
              Loading catalog...
            </motion.span>
          </div>
        )}

        {/* Error */}
        {!loading && error && items.length === 0 && (
          <p className="text-center text-[11px] text-error/60 py-4">
            Failed to load catalog
          </p>
        )}

        {/* Grid */}
        {!loading && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {paginated.map((item) => {
                const key = getKey(item);
                const isAdded = selectedKeys.has(key);
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        isAdded ? onRemove(key) : onAdd(key)
                      }
                      disabled={saving}
                      className={clsx(
                        "w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors text-left cursor-pointer disabled:opacity-30",
                        isAdded
                          ? "border-accent/25 bg-accent/5"
                          : "bg-base-250/30 border-edge/20 hover:border-edge/40 hover:bg-base-250/50",
                      )}
                    >
                      {renderItem(item, isAdded)}
                    </button>
                  </motion.div>
                );
              })}
            </div>

            {/* Empty filtered */}
            {!error && filtered.length === 0 && (
              <p className="text-center text-[11px] text-fg-4 py-4">
                {searchQuery
                  ? "No results match your search"
                  : "No items in this category"}
              </p>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-fg-3 hover:text-fg-2 hover:bg-base-250/50 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                >
                  <ChevronLeft size={12} />
                  Prev
                </button>
                <span className="text-[11px] font-mono text-fg-4">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-fg-3 hover:text-fg-2 hover:bg-base-250/50 transition-colors disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
                >
                  Next
                  <ChevronRight size={12} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
