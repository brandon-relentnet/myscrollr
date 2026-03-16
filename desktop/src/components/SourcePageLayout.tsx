/**
 * SourcePageLayout — shared page shell for channel and widget routes.
 *
 * Renders the breadcrumb header, tab bar, and scrollable content area
 * common to both /channel/:type/:tab and /widget/:id/:tab routes.
 */
import clsx from "clsx";

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
