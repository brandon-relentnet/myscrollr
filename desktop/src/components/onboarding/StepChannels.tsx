import { TrendingUp, Trophy, Rss, Star } from "lucide-react";
import clsx from "clsx";
import type { ChannelType } from "../../api/client";

const CHANNEL_OPTIONS: { id: ChannelType; name: string; description: string; icon: typeof TrendingUp; hex: string }[] = [
  { id: "finance", name: "Finance", description: "Stock prices and crypto", icon: TrendingUp, hex: "#22c55e" },
  { id: "sports", name: "Sports", description: "Live scores and standings", icon: Trophy, hex: "#3b82f6" },
  { id: "rss", name: "RSS", description: "News and blog feeds", icon: Rss, hex: "#f97316" },
  { id: "fantasy", name: "Fantasy", description: "Yahoo Fantasy leagues", icon: Star, hex: "#a855f7" },
];

interface StepChannelsProps {
  selected: Set<ChannelType>;
  onToggle: (id: ChannelType) => void;
}

export default function StepChannels({ selected, onToggle }: StepChannelsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CHANNEL_OPTIONS.map((ch) => {
        const Icon = ch.icon;
        const active = selected.has(ch.id);
        return (
          <button
            key={ch.id}
            onClick={() => onToggle(ch.id)}
            className={clsx(
              "flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all",
              active
                ? "border-accent bg-accent/5"
                : "border-edge hover:border-fg-4 bg-surface-2/50",
            )}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${ch.hex}15` }}
            >
              <Icon size={20} style={{ color: ch.hex }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-fg">{ch.name}</p>
              <p className="text-xs text-fg-4 mt-0.5">{ch.description}</p>
            </div>
            <div className={clsx(
              "w-5 h-5 rounded-full flex items-center justify-center transition-colors",
              active ? "bg-accent" : "bg-transparent",
            )}>
              {active && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
