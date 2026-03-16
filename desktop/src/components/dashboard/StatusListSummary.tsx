/**
 * StatusListSummary — shared dashboard card layout for status-list widgets.
 *
 * Renders the three-section pattern shared by Uptime and GitHub summaries:
 *   1. Overall health dot + label
 *   2. Count breakdown (e.g. "3 up · 1 down · 4 total")
 *   3. Individual item list with status dots (max 6, with overflow)
 */

interface StatusListSummaryProps<T> {
  items: T[];
  emptyMessage: string;
  /** Status color CSS class per item (e.g. "bg-up", "bg-down"). */
  statusColor: (item: T) => string;
  /** Display name per item. */
  itemName: (item: T) => string;
  /** Unique key per item. */
  itemKey: (item: T) => string;
  /** Overall dot + label section. Omit to hide. */
  overall?: { dot: string; label: string } | null;
  /** Count breakdown section. Omit to hide. */
  counts?: React.ReactNode | null;
  /** Whether to show the item list. */
  showItems?: boolean;
}

export default function StatusListSummary<T>({
  items,
  emptyMessage,
  statusColor,
  itemName,
  itemKey,
  overall,
  counts,
  showItems,
}: StatusListSummaryProps<T>) {
  if (items.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Overall health */}
      {overall && (
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${overall.dot}`} />
          <span className="text-xs font-mono text-fg">{overall.label}</span>
        </div>
      )}

      {/* Count breakdown */}
      {counts && (
        <div className="flex items-center gap-3 text-[11px] font-mono text-fg-3">
          {counts}
        </div>
      )}

      {/* Individual items */}
      {showItems && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {items.slice(0, 6).map((item) => (
            <div key={itemKey(item)} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${statusColor(item)}`} />
              <span className="text-[10px] font-mono text-fg-3 truncate max-w-[120px]">
                {itemName(item)}
              </span>
            </div>
          ))}
          {items.length > 6 && (
            <span className="text-[10px] font-mono text-fg-4">
              +{items.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
