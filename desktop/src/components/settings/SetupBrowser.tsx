/**
 * SetupBrowser — unified catalog browsing + selection management.
 *
 * Replaces the old CatalogBrowser + SelectedItems two-section pattern
 * with a single search-first, filterable list. "My Picks" tab shows
 * selected items; category tabs + search handle discovery.
 *
 * Channels inject custom sections via `renderBeforeList` (e.g. popular
 * picks for Finance, "Add Custom Feed" form for RSS).
 */
import { useState, useMemo } from "react";
import { Search, X, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { clsx } from "clsx";

// ── Types ────────────────────────────────────────────────────────

interface SetupBrowserProps<T> {
  /** Channel display name shown in header */
  title: string;
  /** Short non-technical description */
  subtitle?: string;
  /** Lucide icon component */
  icon: React.ElementType;
  /** Channel accent hex */
  hex: string;

  /** Full catalog items */
  items: T[];
  /** Set of currently selected item keys */
  selectedKeys: Set<string>;
  /** Extract unique key from item */
  getKey: (item: T) => string;
  /** Extract category string from item */
  getCategory: (item: T) => string;
  /** Whether item matches a search query */
  matchesSearch: (item: T, query: string) => boolean;
  /** Render the content area of a single list row */
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;

  /** Search input placeholder */
  searchPlaceholder?: string;
  /** How many items to show before "Show more" */
  initialVisibleCount?: number;
  /** How many more to reveal per click */
  loadMoreCount?: number;

  /** Slot rendered between search and list (e.g. Popular picks, Add URL form) */
  renderBeforeList?: () => React.ReactNode;

  /** Save error message — shown as a dismissable banner */
  error?: string | null;
  /** Dismiss save error */
  onDismissError?: () => void;
  /** Catalog is loading */
  loading?: boolean;
  /** Catalog failed to load */
  catalogError?: boolean;
  /** Save in progress */
  saving?: boolean;

  /** Toggle a single item on/off */
  onAdd: (key: string) => void;
  onRemove: (key: string) => void;
  /** Bulk actions (optional — enables "Add all / Remove all" buttons) */
  onBulkAdd?: (keys: string[]) => void;
  onBulkRemove?: (keys: string[]) => void;
  /** Clear all selections */
  onClearAll?: () => void;
}

// ── Tabs ─────────────────────────────────────────────────────────

const MY_PICKS = "My Picks";
const ALL = "All";

// ── Component ────────────────────────────────────────────────────

export function SetupBrowser<T>({
  title,
  subtitle,
  icon: Icon,
  hex,
  items,
  selectedKeys,
  getKey,
  getCategory,
  matchesSearch,
  renderItem,
  searchPlaceholder = "Search...",
  initialVisibleCount = 24,
  loadMoreCount = 24,
  renderBeforeList,
  error,
  onDismissError,
  loading = false,
  catalogError = false,
  saving = false,
  onAdd,
  onRemove,
  onBulkAdd,
  onBulkRemove,
  onClearAll,
}: SetupBrowserProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState(ALL);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  // ── Derived data ─────────────────────────────────────────────

  const categories = useMemo(
    () => [MY_PICKS, ALL, ...Array.from(new Set(items.map(getCategory))).sort()],
    [items, getCategory],
  );

  // Only show category bar when there are real categories beyond My Picks + All
  const hasCategories = categories.length > 3;

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const key = getKey(item);

      // Tab filter
      if (activeTab === MY_PICKS && !selectedKeys.has(key)) return false;
      if (activeTab !== MY_PICKS && activeTab !== ALL) {
        if (getCategory(item) !== activeTab) return false;
      }

      // Search filter
      if (searchQuery && !matchesSearch(item, searchQuery)) return false;

      return true;
    });
  }, [items, activeTab, searchQuery, selectedKeys, getKey, getCategory, matchesSearch]);

  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  // Bulk counts for current tab
  const tabItemKeys = useMemo(() => {
    if (activeTab === MY_PICKS) return [];
    return items
      .filter((i) => activeTab === ALL || getCategory(i) === activeTab)
      .map(getKey);
  }, [items, activeTab, getCategory, getKey]);

  const tabAddedCount = useMemo(
    () => tabItemKeys.filter((k) => selectedKeys.has(k)).length,
    [tabItemKeys, selectedKeys],
  );
  const tabAvailableCount = tabItemKeys.length - tabAddedCount;

  // Reset visible count when switching tabs or searching
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setVisibleCount(initialVisibleCount);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setVisibleCount(initialVisibleCount);
  };

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <Icon size={16} style={{ color: hex }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-fg">{title} Setup</h2>
          </div>
          {subtitle && (
            <p className="text-[11px] text-fg-4">{subtitle}</p>
          )}
        </div>
        <span className="text-[11px] text-fg-3 tabular-nums shrink-0">
          {selectedKeys.size} selected
        </span>
      </div>

      {/* ── Error banner ────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 flex items-center justify-between px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-error text-[12px]"
          >
            <span>{error}</span>
            {onDismissError && (
              <button
                onClick={onDismissError}
                className="p-0.5 hover:bg-error/10 rounded cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Search ──────────────────────────────────────────── */}
      <div className="relative px-3">
        <Search
          size={14}
          className="absolute left-6 top-1/2 -translate-y-1/2 text-fg-4"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-base-200 border border-edge/30 text-[12px] font-mono text-fg-2 placeholder:text-fg-4 focus:outline-none focus:border-accent/40 transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => handleSearchChange("")}
            className="absolute right-6 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-base-300 text-fg-4 hover:text-fg-2 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Custom section slot ──────────────────────────────── */}
      <AnimatePresence>
        {renderBeforeList && !searchQuery && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden px-3"
          >
            {renderBeforeList()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Filter tabs ─────────────────────────────────────── */}
      <div className="px-3">
        <div className="flex flex-wrap gap-0.5 p-0.5 rounded-lg bg-base-200 border border-edge/30">
          {/* My Picks tab */}
          <button
            onClick={() => handleTabChange(MY_PICKS)}
            className={clsx(
              "px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
              activeTab === MY_PICKS
                ? "bg-base-300 text-fg shadow-sm"
                : "text-fg-3 hover:text-fg-2",
            )}
          >
            My Picks
            <span className="ml-1 text-[10px] opacity-50">
              {selectedKeys.size}
            </span>
          </button>

          {/* All tab */}
          <button
            onClick={() => handleTabChange(ALL)}
            className={clsx(
              "px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
              activeTab === ALL
                ? "bg-base-300 text-fg shadow-sm"
                : "text-fg-3 hover:text-fg-2",
            )}
          >
            All
            <span className="ml-1 text-[10px] opacity-50">{items.length}</span>
          </button>

          {/* Category tabs */}
          {hasCategories &&
            categories
              .filter((c) => c !== MY_PICKS && c !== ALL)
              .map((cat) => {
                const isActive = activeTab === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => handleTabChange(cat)}
                    className={clsx(
                      "px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-base-300 text-fg shadow-sm"
                        : "text-fg-3 hover:text-fg-2",
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
        </div>
      </div>

      {/* ── Bulk actions ────────────────────────────────────── */}
      {activeTab !== MY_PICKS && (onBulkAdd || onBulkRemove) && (
        <div className="flex items-center justify-end gap-2 px-3">
          {onBulkAdd && tabAvailableCount > 0 && (
            <button
              onClick={() => {
                const toAdd = tabItemKeys.filter((k) => !selectedKeys.has(k));
                onBulkAdd(toAdd);
              }}
              disabled={saving}
              className="text-[11px] font-medium text-fg-3 hover:text-accent px-2 py-1 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
            >
              + Add all ({tabAvailableCount})
            </button>
          )}
          {onBulkRemove && tabAddedCount > 0 && (
            <button
              onClick={() => {
                const toRemove = tabItemKeys.filter((k) => selectedKeys.has(k));
                onBulkRemove(toRemove);
              }}
              disabled={saving}
              className="text-[11px] font-medium text-fg-3 hover:text-error px-2 py-1 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
            >
              Remove all ({tabAddedCount})
            </button>
          )}
        </div>
      )}

      {/* ── My Picks: Clear all ─────────────────────────────── */}
      {activeTab === MY_PICKS && selectedKeys.size > 0 && onClearAll && (
        <div className="flex items-center justify-end px-3">
          <button
            onClick={onClearAll}
            disabled={saving}
            className="text-[11px] font-medium text-fg-4 hover:text-error px-2 py-0.5 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Loading ─────────────────────────────────────────── */}
      {loading && (
        <div className="text-center py-10">
          <motion.span
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-[11px] font-mono text-fg-4"
          >
            Loading...
          </motion.span>
        </div>
      )}

      {/* ── Catalog error ───────────────────────────────────── */}
      {!loading && catalogError && items.length === 0 && (
        <p className="text-center text-[11px] text-error/60 py-6">
          Failed to load — try again later
        </p>
      )}

      {/* ── Item list ───────────────────────────────────────── */}
      {!loading && (
        <div className="space-y-1 px-3">
          {visible.map((item) => {
            const key = getKey(item);
            const isSelected = selectedKeys.has(key);
            return (
              <motion.div
                key={key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                layout
              >
                <button
                  type="button"
                  onClick={() => (isSelected ? onRemove(key) : onAdd(key))}
                  disabled={saving}
                  className={clsx(
                    "w-full flex items-center justify-between p-2.5 rounded-lg border transition-colors text-left cursor-pointer disabled:opacity-30",
                    isSelected
                      ? "border-accent/25 bg-accent/5"
                      : "bg-base-250/30 border-edge/20 hover:border-edge/40 hover:bg-base-250/50",
                  )}
                >
                  {renderItem(item, isSelected)}
                </button>
              </motion.div>
            );
          })}

          {/* Empty states */}
          {filtered.length === 0 && !catalogError && (
            <div className="text-center py-8">
              {activeTab === MY_PICKS ? (
                <>
                  <Icon
                    size={24}
                    className="mx-auto mb-2"
                    style={{ color: `${hex}40` }}
                  />
                  <p className="text-[11px] text-fg-4">
                    No picks yet — search or browse to add some
                  </p>
                </>
              ) : searchQuery ? (
                <p className="text-[11px] text-fg-4">
                  No results for &ldquo;{searchQuery}&rdquo;
                </p>
              ) : (
                <p className="text-[11px] text-fg-4">
                  No items in this category
                </p>
              )}
            </div>
          )}

          {/* Show more */}
          {remaining > 0 && (
            <button
              onClick={() => setVisibleCount((n) => n + loadMoreCount)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[11px] font-medium text-fg-3 hover:text-fg-2 hover:bg-base-250/30 border border-edge/10 hover:border-edge/20 transition-colors cursor-pointer"
            >
              <ChevronDown size={12} />
              Show more ({remaining} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
