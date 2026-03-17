/**
 * SourcePageLayout — shared page shell for channel and widget routes.
 *
 * Renders the breadcrumb header, tab bar, and scrollable content area
 * common to both /channel/:type/:tab and /widget/:id/:tab routes.
 */
import clsx from "clsx";

// ── Shared tab constants ────────────────────────────────────────

export const VALID_TABS = ["feed", "configuration"] as const;
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

const TABS: Tab[] = [
  { key: "feed", label: "Feed" },
  { key: "configuration", label: "Configure" },
];

interface SourcePageLayoutProps {
  name: string;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onBack: () => void;
  children: React.ReactNode;
}

export default function SourcePageLayout({
  name,
  activeTab,
  onTabChange,
  onBack,
  children,
}: SourcePageLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb header */}
      <header className="flex items-center justify-between px-5 h-12 border-b border-edge shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 text-sm">
          <button
            onClick={onBack}
            aria-label="Back to dashboard"
            className="text-fg-3 hover:text-fg-2 transition-colors shrink-0"
          >
            Dashboard
          </button>
          <span className="text-fg-4">/</span>
          <span className="font-medium truncate">{name}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          {TABS.map(({ key, label }) => (
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
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {children}
      </div>
    </div>
  );
}
