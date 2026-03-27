import { useMemo } from "react";
import TeamLogo from "../../components/TeamLogo";
import { isPre, formatCountdown, displayTeamCode } from "../../utils/gameHelpers";
import type { Game } from "../../types";

interface ScheduleTabProps {
  games: Game[];
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const gameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (gameDay.getTime() - today.getTime()) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function ScheduleTab({ games }: ScheduleTabProps) {
  const upcoming = useMemo(() => {
    return games
      .filter(isPre)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [games]);

  const grouped = useMemo(() => {
    const map = new Map<string, Game[]>();
    for (const g of upcoming) {
      const label = dateLabel(g.start_time);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(g);
    }
    return Array.from(map.entries());
  }, [upcoming]);

  if (upcoming.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-4 text-xs">
        No upcoming games scheduled
      </div>
    );
  }

  return (
    <div>
      {grouped.map(([label, dateGames]) => (
        <div key={label}>
          <div className="px-3 py-1.5 bg-surface-hover border-b border-edge">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">
              {label}
            </span>
          </div>
          <div className="divide-y divide-edge">
            {dateGames.map((g) => (
              <div
                key={String(g.id)}
                className="flex items-center justify-between px-3 py-2 bg-surface text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TeamLogo src={g.away_team_logo} alt={g.away_team_name} size="md" />
                  <span className="font-mono font-bold text-fg-2">
                    {displayTeamCode(g.away_team_code, g.away_team_name)}
                  </span>
                  <span className="text-fg-4 mx-1">@</span>
                  <span className="font-mono font-bold text-fg-2">
                    {displayTeamCode(g.home_team_code, g.home_team_name)}
                  </span>
                  <TeamLogo src={g.home_team_logo} alt={g.home_team_name} size="md" />
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-fg-3 font-mono text-[10px]">
                    {formatCountdown(g.start_time)}
                  </div>
                  <div className="text-fg-4 text-[9px] uppercase tracking-wider">
                    {g.league}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
