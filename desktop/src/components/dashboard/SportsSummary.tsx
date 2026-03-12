/**
 * SportsSummary — dashboard card content for the Sports channel.
 *
 * Shows live game count, a marquee live score, and total game count.
 */
import { useScrollrCDC } from "../../hooks/useScrollrCDC";
import type { Game, DashboardResponse } from "../../types";

interface SportsSummaryProps {
  dashboard: DashboardResponse | undefined;
}

export default function SportsSummary({ dashboard }: SportsSummaryProps) {
  const initialItems = (dashboard?.data?.sports ?? []) as Game[];
  const { items } = useScrollrCDC<Game>({
    table: "games",
    initialItems,
    keyOf: (g) => String(g.id),
    maxItems: 200,
  });

  if (items.length === 0) {
    return (
      <p className="text-[11px] text-fg-4 italic py-1">
        No games right now
      </p>
    );
  }

  const liveGames = items.filter(
    (g) => g.state === "in" || g.state === "in_progress",
  );
  const leagues = new Set(items.map((g) => g.league));

  // Pick the first live game as the marquee
  const marquee = liveGames[0];

  return (
    <div className="space-y-1.5">
      {marquee ? (
        <div className="flex items-center justify-between gap-2 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-live shrink-0 animate-pulse" />
            <span className="text-[11px] font-mono text-fg-2 truncate">
              {marquee.away_team_name}
            </span>
            <span className="text-[12px] font-mono font-bold text-fg tabular-nums">
              {marquee.away_team_score}
            </span>
            <span className="text-[10px] text-fg-4">-</span>
            <span className="text-[12px] font-mono font-bold text-fg tabular-nums">
              {marquee.home_team_score}
            </span>
            <span className="text-[11px] font-mono text-fg-2 truncate">
              {marquee.home_team_name}
            </span>
          </div>
          <span className="text-[9px] font-mono text-live uppercase shrink-0">
            {marquee.short_detail ?? marquee.status_short ?? "Live"}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-fg-3 py-0.5">No live games</p>
      )}

      {liveGames.length > 1 && (
        <p className="text-[10px] text-fg-4">
          +{liveGames.length - 1} more live
        </p>
      )}

      <div className="flex items-center gap-3 pt-1 border-t border-edge/30">
        <span className="text-[10px] text-fg-4">
          {items.length} games
        </span>
        {liveGames.length > 0 && (
          <span className="text-[10px] text-live font-semibold">
            {liveGames.length} live
          </span>
        )}
        <span className="text-[10px] text-fg-4">
          {leagues.size} league{leagues.size !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
