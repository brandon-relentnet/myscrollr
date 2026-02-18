import { clsx } from "clsx";
import { getChannel, sortTabOrder } from "~/channels/registry";

interface FeedTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Channel IDs that should be shown as tabs. */
  availableTabs: string[];
}

export default function FeedTabs({
  activeTab,
  onTabChange,
  availableTabs,
}: FeedTabsProps) {
  // Sort into canonical order and resolve labels from the registry
  const sorted = sortTabOrder(availableTabs);
  const tabs = sorted
    .map((id) => {
      const manifest = getChannel(id);
      return manifest ? { id: manifest.id, label: manifest.tabLabel } : null;
    })
    .filter(Boolean) as { id: string; label: string }[];

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={clsx(
            "px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors relative",
            activeTab === tab.id ? "text-accent" : "text-fg-3 hover:text-fg-2",
          )}
        >
          {tab.label}
          {/* Active underline indicator */}
          {activeTab === tab.id && (
            <span className="absolute bottom-0 left-1 right-1 h-px bg-accent/50" />
          )}
        </button>
      ))}
    </div>
  );
}
