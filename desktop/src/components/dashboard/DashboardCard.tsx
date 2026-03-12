/**
 * DashboardCard — shared wrapper for dashboard summary cards.
 *
 * Renders a consistent card with hex-colored accent border, icon,
 * name, gear button, and click-to-navigate behavior.
 *
 * In edit mode the children (summary) are replaced by a CardEditor
 * with the card's toggle schema.
 */
import { Settings } from "lucide-react";
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
  /** Click the card body to navigate. */
  onClick: () => void;
  /** Click the gear icon to configure. */
  onConfigure: () => void;
  /** Card content (summary component). */
  children: React.ReactNode;
  /** Whether the dashboard is in edit mode. */
  editing?: boolean;
  /** Editor schema for this card type. */
  schema?: EditorField[];
  /** Current card prefs values. */
  editorValues?: Record<string, boolean | number>;
  /** Callback when an editor value changes. */
  onEditorChange?: (key: string, value: boolean | number) => void;
}

export default function DashboardCard({
  name,
  icon: Icon,
  hex,
  onClick,
  onConfigure,
  children,
  editing,
  schema,
  editorValues,
  onEditorChange,
}: DashboardCardProps) {
  return (
    <div
      className={clsx(
        "group relative flex flex-col rounded-xl border border-edge/60",
        "bg-surface-2/50 transition-colors overflow-hidden",
        editing
          ? "ring-1 ring-accent/20"
          : "hover:bg-surface-2 cursor-pointer",
      )}
      onClick={editing ? undefined : onClick}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
        style={{ background: hex }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
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

        {/* Gear — configure (hidden in edit mode) */}
        {!editing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
            title={`${name} settings`}
            className="w-6 h-6 flex items-center justify-center rounded-md text-fg-4 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-fg-2 hover:bg-surface-hover transition-all shrink-0"
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
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-edge/40 hover:border-edge bg-transparent hover:bg-surface-2/30 transition-all p-5 cursor-pointer min-h-[120px]"
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
