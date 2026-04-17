import { TrendingUp, Trophy, Rss, Star, Lock } from "lucide-react";
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
  /** Channels that are locked for the current tier (limit is 0). */
  lockedChannels: Set<ChannelType>;
  /** Minimum tier label needed to unlock each locked channel (e.g., "Uplink"). */
  minTierLabels: Record<string, string>;
}

export default function StepChannels({ selected, onToggle, lockedChannels, minTierLabels }: StepChannelsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {CHANNEL_OPTIONS.map((ch) => {
        const Icon = ch.icon;
        const locked = lockedChannels.has(ch.id);
        const active = !locked && selected.has(ch.id);
        return (
          <button
            key={ch.id}
            onClick={() => !locked && onToggle(ch.id)}
            disabled={locked}
            className={clsx(
              "relative flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all",
              locked
                ? "border-edge bg-surface-2/30 opacity-50 cursor-not-allowed"
                : active
                  ? "border-accent bg-accent/5"
                  : "border-edge hover:border-fg-4 bg-surface-2/50",
            )}
          >
            {locked && (
              <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-fg-4/10">
                <Lock size={10} className="text-fg-4" />
                <span className="text-[9px] font-medium text-fg-4">
                  {minTierLabels[ch.id] ?? "Upgrade"}
                </span>
              </div>
            )}
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${ch.hex}15` }}
            >
              <Icon size={20} style={{ color: locked ? "var(--fg-4)" : ch.hex }} />
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
