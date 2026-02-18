import { Cpu, Zap } from "lucide-react";
import type { ChannelManifest, DashboardTabProps } from "@/channels/types";
import { ChannelHeader, InfoCard } from "@/channels/shared";

const HEX = "#ff4757";

function SportsDashboardTab({
  channel,
  connected,
  subscriptionTier,
  hex,
  onToggle,
  onDelete,
}: DashboardTabProps) {
  const isUplink = subscriptionTier === "uplink";
  const leagues = ["NFL", "NBA", "NHL", "MLB"];

  return (
    <div className="space-y-6">
      <ChannelHeader
        channel={channel}
        icon={<Cpu size={16} className="text-base-content/80" />}
        title="Sports Channel"
        subtitle="Live scores via ESPN polling"
        connected={connected}
        subscriptionTier={subscriptionTier}
        hex={hex}
        onToggle={onToggle}
        onDelete={onDelete}
      />

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard label="Data Source" value="ESPN" hex={hex} />
        <InfoCard label="Leagues" value={String(leagues.length)} hex={hex} />
        <InfoCard
          label="Delivery"
          value={isUplink ? "Real-time" : "Polling \u00b7 30s"}
          hex={hex}
        />
      </div>

      {/* Upgrade CTA for free users */}
      {!isUplink && (
        <a
          href="/uplink"
          className="flex items-center gap-2 px-4 py-3 rounded-sm border transition-all group"
          style={{
            background: `${hex}0D`,
            borderColor: `${hex}26`,
          }}
        >
          <Zap
            size={14}
            className="text-base-content/40 group-hover:text-base-content/60 transition-colors"
          />
          <span className="text-[10px] font-bold text-base-content/50 uppercase tracking-widest group-hover:text-base-content/70 transition-colors">
            Upgrade to Uplink for real-time score delivery
          </span>
        </a>
      )}

      <div className="bg-base-200/30 border border-base-300/25 rounded-lg p-5 space-y-3 relative overflow-hidden">
        {/* Accent top line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
          }}
        />
        <p className="text-[10px] font-bold text-base-content/30 uppercase tracking-widest">
          Tracked Leagues
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {leagues.map((league) => (
            <div
              key={league}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-base-200/50 border border-base-300/25"
            >
              <span
                className="h-1.5 w-1.5 rounded-full animate-pulse"
                style={{ background: hex }}
              />
              <span className="text-xs font-bold uppercase tracking-wide">
                {league}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-base-content/40 leading-relaxed pt-2">
          Scores are polled from ESPN every minute. Active, upcoming, and
          recently completed games are delivered to your ticker.
        </p>
      </div>
    </div>
  );
}

export const sportsChannel: ChannelManifest = {
  id: "sports",
  name: "Sports",
  tabLabel: "Sports",
  description: "Live scores via ESPN",
  hex: HEX,
  icon: Cpu,
  DashboardTab: SportsDashboardTab,
};
