/**
 * SourcePageLayout — shared page shell for channel and widget routes.
 *
 * Renders the breadcrumb header, tab bar, source-level actions
 * (ticker toggle, remove), and scrollable content area common to
 * both /channel/:type/:tab and /widget/:id/:tab routes.
 */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import Tooltip from "./Tooltip";
import ConfirmDialog from "./ConfirmDialog";

// ── Shared tab constants ────────────────────────────────────────

export const VALID_TABS = ["feed", "configuration", "display"] as const;
export type SourceTab = (typeof VALID_TABS)[number];

/** Parse a raw tab parameter into a valid SourceTab, defaulting to "feed". */
export function parseSourceTab(rawTab: string): SourceTab {
  return (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as SourceTab)
    : "feed";
}

/** Fallback for when a source (channel or widget) is not found. */
export function SourceNotFound({
  kind,
  name,
}: {
  kind: "Channel" | "Widget";
  name: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
      <h2 className="text-base font-semibold text-fg">{kind} not found</h2>
      <p className="text-sm text-fg-3">
        The {kind.toLowerCase()} &ldquo;{name}&rdquo; is not installed.
      </p>
    </div>
  );
}

// ── Layout ──────────────────────────────────────────────────────

interface Tab {
  key: string;
  label: string;
}

const CHANNEL_TABS: Tab[] = [
  { key: "feed", label: "Feed" },
  { key: "configuration", label: "Configure" },
  { key: "display", label: "Display" },
];

const WIDGET_TABS: Tab[] = [
  { key: "feed", label: "Feed" },
  { key: "configuration", label: "Configure" },
];

interface SourcePageLayoutProps {
  name: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
  children: React.ReactNode;

  /** Source-level actions (optional — omit to hide action buttons). */
  onRemove?: () => void;
  /** "channel" triggers a ConfirmDialog before removal; "widget" removes immediately. */
  sourceKind?: "channel" | "widget";
}

export default function SourcePageLayout({
  name,
  activeTab,
  onTabChange,
  onBack,
  children,
  onRemove,
  sourceKind,
}: SourcePageLayoutProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const tabs = sourceKind === "widget" ? WIDGET_TABS : CHANNEL_TABS;

  function handleRemove() {
    if (sourceKind === "channel") {
      setConfirmRemove(true);
    } else {
      onRemove?.();
    }
  }

  return (
    <div>
      {/* Breadcrumb header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-edge sticky top-0 z-10 bg-surface">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <button
            onClick={onBack}
            aria-label="Back to home"
            className="text-fg-3 hover:text-fg-2 transition-colors shrink-0"
          >
            Home
          </button>
          <span className="text-fg-4">/</span>
          <span className="font-medium truncate">{name}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Source-level actions */}
          {onRemove && (
            <Tooltip content="Remove">
              <button
                onClick={handleRemove}
                aria-label={`Remove ${name}`}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-fg-4 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </Tooltip>
          )}

          {/* Divider between actions and tabs */}
          {onRemove && (
            <div className="w-px h-5 bg-edge/50" />
          )}

          {/* Tab bar */}
          <div className="flex gap-1">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onTabChange(key)}
                className={clsx(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  activeTab === key
                    ? "bg-accent/10 text-accent"
                    : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div>
        {children}
      </div>

      {/* Channel removal confirmation */}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${name}?`}
        description={`This will delete your ${name} configuration and remove it from the dashboard. You can re-add it from the Catalog.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove?.();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
