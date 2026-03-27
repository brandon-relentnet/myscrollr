import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import TeamLogo from "../../components/TeamLogo";
import { standingsOptions } from "../../api/queries";
import type { Standing } from "../../api/queries";

interface StandingsTabProps {
  leagues: string[];
}

export function StandingsTab({ leagues }: StandingsTabProps) {
  const [selected, setSelected] = useState(leagues[0] ?? "");

  const { data, isLoading, isError } = useQuery({
    ...standingsOptions(selected),
    enabled: !!selected,
  });

  const standings: Standing[] = data?.standings ?? [];

  if (leagues.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-4 text-xs">
        Add leagues in the Configure tab to see standings
      </div>
    );
  }

  return (
    <div>
      {/* League selector */}
      <div className="px-3 py-2 border-b border-edge bg-surface">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-surface-hover text-fg-2 text-xs rounded px-2 py-1 border border-edge focus:outline-none focus:border-primary"
        >
          {leagues.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-fg-4 text-xs">
          Loading standings...
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-12 text-error text-xs">
          Failed to load standings
        </div>
      )}

      {!isLoading && !isError && standings.length === 0 && (
        <div className="flex items-center justify-center py-12 text-fg-4 text-xs">
          No standings available for {selected}
        </div>
      )}

      {standings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-fg-4 text-[10px] uppercase tracking-wider border-b border-edge">
                <th className="text-left px-3 py-2 w-8">#</th>
                <th className="text-left px-2 py-2">Team</th>
                <th className="text-center px-2 py-2 w-8">W</th>
                <th className="text-center px-2 py-2 w-8">L</th>
                <th className="text-center px-2 py-2 w-8">D</th>
                <th className="text-center px-2 py-2 w-10">Pts</th>
                <th className="text-center px-2 py-2 w-10">GD</th>
                <th className="text-center px-2 py-2 w-8">GP</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => (
                <tr
                  key={`${s.team_name}-${i}`}
                  className="border-b border-edge/50 hover:bg-surface-hover transition-colors"
                >
                  <td className="px-3 py-1.5 text-fg-4 font-mono">{s.rank || i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <TeamLogo src={s.team_logo} alt={s.team_name} size="sm" />
                      <span className="text-fg-2 font-medium truncate">{s.team_name}</span>
                    </div>
                  </td>
                  <td className="text-center px-2 py-1.5 font-mono text-fg-2">{s.wins}</td>
                  <td className="text-center px-2 py-1.5 font-mono text-fg-2">{s.losses}</td>
                  <td className="text-center px-2 py-1.5 font-mono text-fg-3">{s.draws}</td>
                  <td className="text-center px-2 py-1.5 font-mono font-bold text-fg">{s.points}</td>
                  <td className="text-center px-2 py-1.5 font-mono text-fg-3">{s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff}</td>
                  <td className="text-center px-2 py-1.5 font-mono text-fg-4">{s.games_played}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
