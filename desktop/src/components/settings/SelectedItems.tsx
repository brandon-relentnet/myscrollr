import { motion } from "motion/react";
import { X } from "lucide-react";
import { Section } from "./SettingsControls";

// ── Types ────────────────────────────────────────────────────────

interface SelectedItemsProps<T> {
  /** Section heading */
  title: string;
  /** Selected items */
  items: T[];
  /** Unique key extractor */
  getKey: (item: T) => string;
  /** Render a single chip's content (label area only — remove button is handled) */
  renderChip: (item: T) => React.ReactNode;
  /** Remove an item by key */
  onRemove: (key: string) => void;
  /** Clear all items */
  onClearAll?: () => void;
  /** Channel accent hex */
  hex: string;
  /** Icon shown in empty state */
  emptyIcon?: React.ReactNode;
  /** Message shown in empty state */
  emptyMessage?: string;
  /** Whether save is in progress */
  saving?: boolean;
}

// ── Component ────────────────────────────────────────────────────

export function SelectedItems<T>({
  title,
  items,
  getKey,
  renderChip,
  onRemove,
  onClearAll,
  hex,
  emptyIcon,
  emptyMessage = "No items selected",
  saving = false,
}: SelectedItemsProps<T>) {
  return (
    <Section title={title}>
      <div className="px-3 space-y-2">
        {/* Header row with count + clear */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-fg-3">
            {items.length} selected
          </span>
          {items.length > 0 && onClearAll && (
            <button
              onClick={onClearAll}
              disabled={saving}
              className="text-[11px] font-medium text-fg-4 hover:text-error px-2 py-0.5 rounded-md hover:bg-base-250/50 transition-colors disabled:opacity-30 cursor-pointer"
            >
              Clear all
            </button>
          )}
        </div>

        {/* Chips */}
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, i) => {
              const key = getKey(item);
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.015 }}
                  className="flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-lg border transition-colors group"
                  style={{
                    background: `${hex}0D`,
                    borderColor: `${hex}25`,
                  }}
                >
                  {renderChip(item)}
                  <button
                    onClick={() => onRemove(key)}
                    disabled={saving}
                    className="p-0.5 rounded hover:bg-error/10 text-fg-4 hover:text-error transition-colors shrink-0 opacity-0 group-hover:opacity-100 disabled:opacity-30 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-5">
            {emptyIcon && (
              <div className="flex justify-center mb-2 text-fg-4/40">
                {emptyIcon}
              </div>
            )}
            <p className="text-[11px] text-fg-4">{emptyMessage}</p>
          </div>
        )}
      </div>
    </Section>
  );
}
