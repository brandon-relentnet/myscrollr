/**
 * FantasySummary — dashboard card content for the Fantasy channel.
 *
 * Shows best league with matchup score, rank, and record.
 * Respects per-card display preferences from the dashboard editor.
 */
import { SPORT_EMOJI } from "../../channels/fantasy/types";
import type { DashboardResponse } from "../../types";
import type { FantasyCardPrefs } from "./dashboardPrefs";
import type { LeagueResponse } from "../../channels/fantasy/types";

interface FantasySummaryProps {
  dashboard: DashboardResponse | undefined;
  prefs: FantasyCardPrefs;
  onConfigure?: () => void;
}

export default function FantasySummary({ dashboard, prefs, onConfigure }: FantasySummaryProps) {
  // Fantasy data is stored in channel config (not CDC like other channels)
  const channelData = (dashboard?.channels ?? []).find(
    (ch) => ch.channel_type === "fantasy",
  );

  const leagues = (channelData?.config?.leagues ?? []) as LeagueResponse[];

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-1">
        <p className="text-[11px] text-fg-4">No leagues connected</p>
        {onConfigure && (
          <button
            onClick={onConfigure}
            className="text-[11px] font-medium text-accent hover:text-accent/80 transition-colors self-start"
          >
            Connect Yahoo &rarr;
          </button>
        )}
      </div>
    );
  }

  // Show the first league with a current matchup
  const primary = leagues[0];
  const myStanding = primary.standings?.find(
    (s) => s.name === primary.team_name,
  );
  const currentMatchup = primary.matchups?.[0];
  const emoji = SPORT_EMOJI[primary.game_code] ?? "\uD83C\uDFC6";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px]">{emoji}</span>
        <span className="text-[11px] font-semibold text-fg-2 truncate">
          {primary.name}
        </span>
      </div>

      {prefs.matchup && currentMatchup && currentMatchup.teams.length === 2 && (
        <div className="flex items-center justify-between gap-2 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[12px] font-mono font-bold text-fg tabular-nums">
              {(currentMatchup.teams[0].points ?? 0).toFixed(1)}
            </span>
            <span className="text-[10px] text-fg-4">vs</span>
            <span className="text-[12px] font-mono font-bold text-fg tabular-nums">
              {(currentMatchup.teams[1].points ?? 0).toFixed(1)}
            </span>
          </div>
          <span className="text-[9px] font-mono text-fg-3 uppercase shrink-0">
            {currentMatchup.status === "midevent" ? "Live" : currentMatchup.status === "postevent" ? "Final" : `Wk${currentMatchup.week}`}
          </span>
        </div>
      )}

      {prefs.standings && (
        <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
          <span className="text-[10px] text-fg-4">
            {leagues.length} league{leagues.length !== 1 ? "s" : ""}
          </span>
          {myStanding && (
            <>
              <span className="text-[10px] text-accent font-semibold">
                #{myStanding.rank}
              </span>
              <span className="text-[10px] text-fg-3 tabular-nums">
                {myStanding.wins}-{myStanding.losses}{myStanding.ties > 0 ? `-${myStanding.ties}` : ""}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
