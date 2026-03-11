import type { Channel } from "../api/client";
import FinanceConfigPanel from "./FinanceConfigPanel";
import SportsConfigPanel from "./SportsConfigPanel";
import RssConfigPanel from "./RssConfigPanel";
import FantasyConfigPanel from "./FantasyConfigPanel";

// ── Props ────────────────────────────────────────────────────────

interface ChannelConfigPanelProps {
  channelType: string;
  channel: Channel;
  getToken: () => Promise<string | null>;
  onChannelUpdate: (updated: Channel) => void;
  subscriptionTier: string;
  /** SSE delivery mode active */
  connected: boolean;
  /** Channel accent hex color */
  hex: string;
}

// ── Component ────────────────────────────────────────────────────

export default function ChannelConfigPanel({
  channelType,
  channel,
  getToken,
  onChannelUpdate,
  subscriptionTier,
  connected,
  hex,
}: ChannelConfigPanelProps) {
  switch (channelType) {
    case "finance":
      return (
        <FinanceConfigPanel
          channel={channel}
          getToken={getToken}
          onChannelUpdate={onChannelUpdate}
          subscriptionTier={subscriptionTier}
          connected={connected}
          hex={hex}
        />
      );
    case "sports":
      return (
        <SportsConfigPanel
          channel={channel}
          getToken={getToken}
          onChannelUpdate={onChannelUpdate}
          subscriptionTier={subscriptionTier}
          connected={connected}
          hex={hex}
        />
      );
    case "rss":
      return (
        <RssConfigPanel
          channel={channel}
          getToken={getToken}
          onChannelUpdate={onChannelUpdate}
          hex={hex}
        />
      );
    case "fantasy":
      return (
        <FantasyConfigPanel
          channel={channel}
          getToken={getToken}
          subscriptionTier={subscriptionTier}
          connected={connected}
          hex={hex}
        />
      );
    default:
      return (
        <div className="flex flex-col items-center justify-center h-full text-center max-w-sm mx-auto gap-3 p-6">
          <h2 className="text-base font-semibold text-fg">
            Configuration unavailable
          </h2>
          <p className="text-sm text-fg-3 leading-relaxed">
            This channel does not have a configuration panel.
          </p>
        </div>
      );
  }
}
