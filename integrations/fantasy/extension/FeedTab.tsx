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
    <div className="flex items-center justify-center py-10 px-4 bg-surface">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 border border-edge-2 bg-surface-2 text-accent/60 font-mono font-bold text-sm">
          Y!
        </div>
        <p className="text-xs font-mono text-fg-2 uppercase tracking-wider">Fantasy</p>
        <p className="text-[11px] text-fg-3 max-w-[220px] leading-relaxed">
          Fantasy league data is best viewed on the Scrollr dashboard.
          Visit <span className="text-accent/60 font-mono">myscrollr.com</span> for standings, matchups, and rosters.
        </p>
      </div>
    </div>
  );
}
