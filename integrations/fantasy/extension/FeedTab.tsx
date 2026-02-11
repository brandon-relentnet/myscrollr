import type { FeedTabProps } from '~/integrations/types';

/**
 * Fantasy FeedTab — placeholder.
 *
 * Yahoo Fantasy data (leagues, standings, matchups, rosters) is complex
 * and doesn't map well to a simple scrolling ticker. This placeholder
 * is registered in the extension's integration registry so the tab
 * appears when a user has a fantasy stream, but the actual UI is
 * best consumed on the web dashboard.
 */
import type { IntegrationManifest } from '~/integrations/types';

export const fantasyIntegration: IntegrationManifest = {
  id: 'fantasy',
  name: 'Fantasy',
  tabLabel: 'Fantasy',
  tier: 'official',
  FeedTab: FantasyFeedTab,
};

export default function FantasyFeedTab({ mode: _mode }: FeedTabProps) {
  return (
    <div className="flex items-center justify-center py-8 px-4">
      <div className="text-center space-y-2">
        <span className="text-2xl">Y!</span>
        <p className="text-sm text-zinc-300 font-medium">Fantasy</p>
        <p className="text-xs text-zinc-500 max-w-[240px]">
          Fantasy league data is best viewed on the Scrollr dashboard.
          Visit myscrollr.com for full standings, matchups, and rosters.
        </p>
      </div>
    </div>
  );
}
