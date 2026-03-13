/**
 * DashboardCard — shared wrapper for dashboard summary cards.
 *
 * Renders a consistent card with hex-colored accent border, icon,
 * name, gear button, and click-to-navigate behavior.
 *
 * Channels use header-only navigation (click title → feed, with
 * an arrow icon on hover). Widgets keep full-card click navigation.
 *
 * In edit mode the children (summary) are replaced by a CardEditor
 * with the card's toggle schema. Arrow buttons allow reordering.
 */
import { Settings, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";
import clsx from "clsx";
import CardEditor from "./CardEditor";
import type { EditorField } from "./dashboardPrefs";

interface DashboardCardProps {
  /** Source name (e.g., "Finance", "Clock"). */
  name: string;
  /** Lucide icon component. */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Hex accent color. */
  hex: string;
  /** Click to navigate to the feed. */
  onClick: () => void;
  /** Click the gear icon to configure. */
  onConfigure: () => void;
  /** Card content (summary component). */
  children: React.ReactNode;
  /** Whether the dashboard is in edit mode. */
  editing?: boolean;
  /** Only the header is clickable (channels). Full card clickable when false (widgets). */
  headerClickOnly?: boolean;
  /** Editor schema for this card type. */
  schema?: EditorField[];
  /** Current card prefs values. */
  editorValues?: Record<string, boolean | number>;
  /** Callback when an editor value changes. */
  onEditorChange?: (key: string, value: boolean | number) => void;
  /** Move this card up in the order. */
  onMoveUp?: () => void;
  /** Move this card down in the order. */
  onMoveDown?: () => void;
}

export default function DashboardCard({
  name,
  icon: Icon,
  hex,
  onClick,
  onConfigure,
  children,
  editing,
  headerClickOnly,
  schema,
  editorValues,
  onEditorChange,
  onMoveUp,
  onMoveDown,
}: DashboardCardProps) {
  const fullCardClick = !headerClickOnly && !editing;

  return (
    <div
      className={clsx(
        "group/card relative flex flex-col rounded-xl border border-edge/60",
        "bg-surface-2/50 transition-colors overflow-hidden",
        editing
          ? "ring-1 ring-accent/20"
          : fullCardClick && "hover:bg-surface-2 cursor-pointer",
        fullCardClick && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
      )}
      role={fullCardClick ? "button" : undefined}
      tabIndex={fullCardClick ? 0 : undefined}
      aria-label={fullCardClick ? `Open ${name}` : undefined}
      onClick={fullCardClick ? onClick : undefined}
      onKeyDown={
        fullCardClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: hex }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        {/* Title area — clickable for header-only mode */}
        {headerClickOnly && !editing ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            className="group/title flex items-center gap-2.5 min-w-0 rounded-lg -ml-1 pl-1 pr-2 -my-0.5 py-0.5 hover:bg-surface-3/50 transition-colors"
          >
            <span
              className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
              style={{ backgroundColor: `${hex}15`, color: hex }}
            >
              <Icon size={15} />
            </span>
            <span className="text-[13px] font-semibold text-fg truncate">
              {name}
            </span>
            <ArrowRight
              size={12}
              className="text-fg-4 opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
            />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
              style={{ backgroundColor: `${hex}15`, color: hex }}
            >
              <Icon size={15} />
            </span>
            <span className="text-[13px] font-semibold text-fg truncate">
              {name}
            </span>
          </div>
        )}

        {/* Edit mode — arrow buttons */}
        {editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp?.();
              }}
              disabled={!onMoveUp}
              className={clsx(
                "w-5 h-5 flex items-center justify-center rounded transition-colors",
                onMoveUp
                  ? "text-fg-4 hover:text-fg-2 hover:bg-surface-3/80"
                  : "text-fg-4/20 cursor-default",
              )}
              aria-label={`Move ${name} up`}
              title="Move up"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown?.();
              }}
              disabled={!onMoveDown}
              className={clsx(
                "w-5 h-5 flex items-center justify-center rounded transition-colors",
                onMoveDown
                  ? "text-fg-4 hover:text-fg-2 hover:bg-surface-3/80"
                  : "text-fg-4/20 cursor-default",
              )}
              aria-label={`Move ${name} down`}
              title="Move down"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}

        {/* Gear — configure (hidden in edit mode) */}
        {!editing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
            aria-label={`${name} settings`}
            title={`${name} settings`}
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-4 opacity-0 group-hover/card:opacity-60 hover:!opacity-100 hover:text-fg-2 hover:bg-surface-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 transition-all shrink-0"
          >
            <Settings size={12} />
          </button>
        )}
      </div>

      {/* Content — summary or editor */}
      <div className="px-4 pb-3.5 flex-1 min-h-0">
        {editing && schema && editorValues && onEditorChange ? (
          <CardEditor
            schema={schema}
            values={editorValues}
            onChange={onEditorChange}
          />
        ) : (
          children
        )}
      </div>
    </div>
  );
}

// ── Ghost card for un-added sources ─────────────────────────────

interface GhostCardProps {
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hex: string;
  onClick: () => void;
}

export function GhostCard({ name, description, icon: Icon, hex, onClick }: GhostCardProps) {
  return (
    <button
      onClick={onClick}
      aria-label={`Add ${name}`}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge/40 hover:border-edge bg-transparent hover:bg-surface-2/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/30 transition-all p-5 cursor-pointer min-h-[120px]"
    >
      <span style={{ color: hex }} className="opacity-40">
        <Icon size={20} />
      </span>
      <span className="text-[12px] font-medium text-fg-3">{name}</span>
      <span className="text-[10px] text-fg-4 text-center leading-snug max-w-[160px]">
        {description}
      </span>
    </button>
  );
}
