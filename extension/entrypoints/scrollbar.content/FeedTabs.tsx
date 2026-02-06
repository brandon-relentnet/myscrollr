import { clsx } from 'clsx';
import type { FeedCategory } from '~/utils/types';

interface FeedTabsProps {
  activeTab: FeedCategory;
  onTabChange: (tab: FeedCategory) => void;
}

const TABS: { id: FeedCategory; label: string }[] = [
  { id: 'finance', label: 'Finance' },
  { id: 'sports', label: 'Sports' },
];

export default function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <div className="flex items-center gap-0.5">
      {TABS.map((tab) => (
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
