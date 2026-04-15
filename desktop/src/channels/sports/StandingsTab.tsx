import { Fragment, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import TeamLogo from "../../components/TeamLogo";
import { standingsOptions } from "../../api/queries";
import type { Standing } from "../../api/queries";

interface StandingsTabProps {
  leagues: string[];
  favoriteTeams: Set<string>;
}

type SportType = "soccer" | "nfl" | "nba" | "nhl" | "mlb" | "other";

interface Column {
  key: string;
  label: string;
  fullName?: string;
  width?: string;
  align?: "left" | "center" | "right";
  getValue: (s: Standing) => React.ReactNode;
}

function getColumnsForSport(sportApi?: string): Column[] {
  const sport = getSportType(sportApi);
  
  const teamCol: Column = {
    key: "team",
    label: "Team",
    fullName: "Team",
    getValue: (s) => (
      <div className="flex items-center gap-2">
        <TeamLogo src={s.team_logo} alt={s.team_name} size="sm" />
        <span className="text-fg-2 font-medium truncate">{s.team_name}</span>
      </div>
    ),
  };

  switch (sport) {
    case "soccer":
      return [
        { key: "rank", label: "#", fullName: "Rank", width: "w-12", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol, width: "w-48" },
        { key: "gp", label: "GP", fullName: "Games Played", width: "w-14", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", fullName: "Wins", width: "w-14", align: "center", getValue: (s) => s.wins },
        { key: "d", label: "D", fullName: "Draws", width: "w-14", align: "center", getValue: (s) => s.draws },
        { key: "l", label: "L", fullName: "Losses", width: "w-14", align: "center", getValue: (s) => s.losses },
        { key: "gd", label: "GD", fullName: "Goal Difference", width: "w-16", align: "center", getValue: (s) => s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff },
        { key: "pts", label: "Pts", fullName: "Points", width: "w-16", align: "center", getValue: (s) => s.points },
        { key: "form", label: "Form", fullName: "Recent Form", width: "w-20", getValue: (s) => s.form || "-" },
      ];
    case "nfl":
      return [
        { key: "rank", label: "#", fullName: "Rank", width: "w-12", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol, width: "w-48" },
        { key: "w", label: "W", fullName: "Wins", width: "w-14", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", fullName: "Losses", width: "w-14", align: "center", getValue: (s) => s.losses },
        { key: "t", label: "T", fullName: "Ties", width: "w-14", align: "center", getValue: (s) => s.draws },
        { key: "pct", label: "Pct", fullName: "Win Percentage", width: "w-16", align: "center", getValue: (s) => s.pct || "-" },
        { key: "pf", label: "PF", fullName: "Points For", width: "w-16", align: "center", getValue: (s) => s.points_for || "-" },
        { key: "pa", label: "PA", fullName: "Points Against", width: "w-16", align: "center", getValue: (s) => s.points_against || "-" },
        { key: "streak", label: "Str", fullName: "Streak", width: "w-16", getValue: (s) => s.streak || "-" },
      ];
    case "nba":
    case "mlb":
      return [
        { key: "rank", label: "#", fullName: "Rank", width: "w-12", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol, width: "w-48" },
        { key: "w", label: "W", fullName: "Wins", width: "w-14", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", fullName: "Losses", width: "w-14", align: "center", getValue: (s) => s.losses },
        { key: "pct", label: "Pct", fullName: "Win Percentage", width: "w-16", align: "center", getValue: (s) => s.pct || "-" },
        { key: "gb", label: "GB", fullName: "Games Behind", width: "w-16", align: "center", getValue: (s) => s.games_behind || "-" },
        { key: "pf", label: "PF", fullName: "Points For", width: "w-16", align: "center", getValue: (s) => s.points_for || "-" },
        { key: "pa", label: "PA", fullName: "Points Against", width: "w-16", align: "center", getValue: (s) => s.points_against || "-" },
        { key: "streak", label: "Str", fullName: "Streak", width: "w-16", getValue: (s) => s.streak || "-" },
      ];
    case "nhl":
      return [
        { key: "rank", label: "#", fullName: "Rank", width: "w-12", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol, width: "w-48" },
        { key: "gp", label: "GP", fullName: "Games Played", width: "w-14", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", fullName: "Wins", width: "w-14", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", fullName: "Losses", width: "w-14", align: "center", getValue: (s) => s.losses },
        { key: "otl", label: "OTL", fullName: "Overtime Losses", width: "w-14", align: "center", getValue: (s) => s.otl ?? "-" },
        { key: "pts", label: "Pts", fullName: "Points", width: "w-16", align: "center", getValue: (s) => s.points },
        { key: "gf", label: "GF", fullName: "Goals For", width: "w-16", align: "center", getValue: (s) => s.goals_for ?? "-" },
        { key: "ga", label: "GA", fullName: "Goals Against", width: "w-16", align: "center", getValue: (s) => s.goals_against ?? "-" },
        { key: "streak", label: "Str", fullName: "Streak", width: "w-16", getValue: (s) => s.streak || "-" },
      ];
    default:
      return [
        { key: "rank", label: "#", fullName: "Rank", width: "w-12", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol, width: "w-48" },
        { key: "gp", label: "GP", fullName: "Games Played", width: "w-14", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", fullName: "Wins", width: "w-14", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", fullName: "Losses", width: "w-14", align: "center", getValue: (s) => s.losses },
        { key: "d", label: "D", fullName: "Draws", width: "w-14", align: "center", getValue: (s) => s.draws },
        { key: "pts", label: "Pts", fullName: "Points", width: "w-16", align: "center", getValue: (s) => s.points },
      ];
  }
}

function getSportType(sportApi?: string): SportType {
  if (!sportApi) return "soccer";
  if (sportApi === "american-football") return "nfl";
  if (sportApi === "basketball") return "nba";
  if (sportApi === "hockey") return "nhl";
  if (sportApi === "baseball") return "mlb";
  if (sportApi === "football") return "soccer";
  return "other";
}

function GroupHeader({ name }: { name: string }) {
  return (
    <tr className="bg-surface-hover">
      <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-fg-2">
        {name}
      </td>
    </tr>
  );
}

export function StandingsTab({ leagues, favoriteTeams }: StandingsTabProps) {
  const [selected, setSelected] = useState(leagues[0] ?? "");

  const { data, isLoading, isError } = useQuery({
    ...standingsOptions(selected),
    enabled: !!selected,
  });

  const standings: Standing[] = data?.standings ?? [];

  const { columns, groupedRows } = useMemo(() => {
    const cols = getColumnsForSport(standings[0]?.sport_api);
    
    const groups: { groupName: string; standings: Standing[] }[] = [];
    let currentGroup: Standing[] = [];
    let currentGroupName = "";

    for (const s of standings) {
      if (s.group_name && s.group_name !== currentGroupName) {
        if (currentGroup.length > 0) {
          groups.push({ groupName: currentGroupName, standings: currentGroup });
        }
        currentGroupName = s.group_name;
        currentGroup = [s];
      } else if (!s.group_name && currentGroupName !== "") {
        if (currentGroup.length > 0) {
          groups.push({ groupName: currentGroupName, standings: currentGroup });
        }
        currentGroupName = "";
        currentGroup = [s];
      } else {
        currentGroup.push(s);
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ groupName: currentGroupName, standings: currentGroup });
    }

    return { columns: cols, groupedRows: groups };
  }, [standings]);

  if (leagues.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-fg-3 text-xs">
        Add leagues in the Configure tab to see standings
      </div>
    );
  }

  return (
    <div>
      {/* League selector */}
      <div className="px-3 py-2 border-b border-edge/30 bg-surface">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-surface-hover text-fg-2 text-xs rounded px-2 py-1 border border-edge/30 focus:outline-none focus:border-accent/60"
        >
          {leagues.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex items-center justify-center py-12 text-fg-3 text-xs">
          Loading standings...
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-12 text-error text-xs">
          Failed to load standings
        </div>
      )}

      {!isLoading && !isError && standings.length === 0 && (
        <div className="flex items-center justify-center py-12 text-fg-3 text-xs">
          No standings available for {selected}
        </div>
      )}

      {standings.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed">
            <thead>
              <tr className="text-fg-3 text-[10px] uppercase tracking-wider border-b border-edge/30">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    title={col.fullName || col.label}
                    className={clsx(
                      "px-2 py-2 font-semibold",
                      col.width,
                      col.align === "center" && "text-center",
                      col.align === "right" && "text-right",
                      !col.align && "text-left"
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group, groupIdx) => (
                <Fragment key={group.groupName || `group-${groupIdx}`}>
                  {group.groupName && <GroupHeader name={group.groupName} />}
                  {group.standings.map((s, i) => {
                    const isFav = favoriteTeams.has(s.team_name);
                    return (
                      <tr
                        key={`${s.team_name}-${i}`}
                        className={clsx(
                          "border-b border-edge/30 hover:bg-surface-hover transition-colors",
                          isFav && "bg-[#f97316]/5",
                        )}
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={clsx(
                              "px-2 py-1.5",
                              col.width,
                              col.key !== "team" && "font-mono text-fg-2",
                              col.align === "center" && "text-center",
                              col.align === "right" && "text-right",
                              !col.align && "text-left"
                            )}
                          >
                            {col.getValue(s)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
