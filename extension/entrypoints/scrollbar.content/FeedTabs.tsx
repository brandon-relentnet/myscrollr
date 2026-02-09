import { clsx } from 'clsx';
import { getIntegration, sortTabOrder } from '~/integrations/registry';

interface FeedTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Integration IDs that should be shown as tabs. */
  availableTabs: string[];
}

export default function FeedTabs({ activeTab, onTabChange, availableTabs }: FeedTabsProps) {
  // Sort into canonical order and resolve labels from the registry
  const sorted = sortTabOrder(availableTabs);
  const tabs = sorted
    .map((id) => {
      const manifest = getIntegration(id);
      return manifest ? { id: manifest.id, label: manifest.tabLabel } : null;
    })
    .filter(Boolean) as { id: string; label: string }[];

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={clsx(
            'px-2 py-0.5 text-[11px] font-medium rounded transition-colors',
            activeTab === tab.id
              ? 'bg-zinc-700 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
