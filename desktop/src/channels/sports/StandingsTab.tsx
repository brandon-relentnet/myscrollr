import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import TeamLogo from "../../components/TeamLogo";
import { standingsOptions } from "../../api/queries";
import type { Standing } from "../../api/queries";

interface StandingsTabProps {
  leagues: string[];
}

type SportType = "soccer" | "nfl" | "nba" | "nhl" | "mlb" | "other";

interface Column {
  key: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
  getValue: (s: Standing) => React.ReactNode;
}

function getColumnsForSport(sportApi?: string): Column[] {
  const sport = getSportType(sportApi);
  
  const teamCol: Column = {
    key: "team",
    label: "Team",
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
        { key: "rank", label: "#", width: "w-8", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol },
        { key: "gp", label: "GP", width: "w-8", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", width: "w-8", align: "center", getValue: (s) => s.wins },
        { key: "d", label: "D", width: "w-8", align: "center", getValue: (s) => s.draws },
        { key: "l", label: "L", width: "w-8", align: "center", getValue: (s) => s.losses },
        { key: "gd", label: "GD", width: "w-10", align: "center", getValue: (s) => s.goal_diff > 0 ? `+${s.goal_diff}` : s.goal_diff },
        { key: "pts", label: "Pts", width: "w-10", align: "center", getValue: (s) => s.points },
        { key: "form", label: "Form", getValue: (s) => s.form || "-" },
      ];
    case "nfl":
      return [
        { key: "rank", label: "#", width: "w-8", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol },
        { key: "w", label: "W", width: "w-8", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", width: "w-8", align: "center", getValue: (s) => s.losses },
        { key: "t", label: "T", width: "w-8", align: "center", getValue: (s) => s.draws },
        { key: "pct", label: "Pct", width: "w-12", align: "center", getValue: (s) => s.pct || "-" },
        { key: "pf", label: "PF", width: "w-10", align: "center", getValue: (s) => s.points_for || "-" },
        { key: "pa", label: "PA", width: "w-10", align: "center", getValue: (s) => s.points_against || "-" },
        { key: "streak", label: "Str", getValue: (s) => s.streak || "-" },
      ];
    case "nba":
    case "mlb":
      return [
        { key: "rank", label: "#", width: "w-8", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol },
        { key: "w", label: "W", width: "w-8", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", width: "w-8", align: "center", getValue: (s) => s.losses },
        { key: "pct", label: "Pct", width: "w-12", align: "center", getValue: (s) => s.pct || "-" },
        { key: "gb", label: "GB", width: "w-10", align: "center", getValue: (s) => s.games_behind || "-" },
        { key: "pf", label: "PF", width: "w-10", align: "center", getValue: (s) => s.points_for || "-" },
        { key: "pa", label: "PA", width: "w-10", align: "center", getValue: (s) => s.points_against || "-" },
        { key: "streak", label: "Str", getValue: (s) => s.streak || "-" },
      ];
    case "nhl":
      return [
        { key: "rank", label: "#", width: "w-8", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol },
        { key: "gp", label: "GP", width: "w-8", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", width: "w-8", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", width: "w-8", align: "center", getValue: (s) => s.losses },
        { key: "otl", label: "OTL", width: "w-8", align: "center", getValue: (s) => s.otl ?? "-" },
        { key: "pts", label: "Pts", width: "w-10", align: "center", getValue: (s) => s.points },
        { key: "gf", label: "GF", width: "w-10", align: "center", getValue: (s) => s.goals_for ?? "-" },
        { key: "ga", label: "GA", width: "w-10", align: "center", getValue: (s) => s.goals_against ?? "-" },
        { key: "streak", label: "Str", getValue: (s) => s.streak || "-" },
      ];
    default:
      return [
        { key: "rank", label: "#", width: "w-8", align: "center", getValue: (s) => s.rank || "-" },
        { ...teamCol },
        { key: "gp", label: "GP", width: "w-8", align: "center", getValue: (s) => s.games_played },
        { key: "w", label: "W", width: "w-8", align: "center", getValue: (s) => s.wins },
        { key: "l", label: "L", width: "w-8", align: "center", getValue: (s) => s.losses },
        { key: "d", label: "D", width: "w-8", align: "center", getValue: (s) => s.draws },
        { key: "pts", label: "Pts", width: "w-10", align: "center", getValue: (s) => s.points },
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
      <td colSpan={10} className="px-3 py-1.5 text-xs font-semibold text-fg-2">
        {name}
      </td>
    </tr>
  );
}

export function StandingsTab({ leagues }: StandingsTabProps) {
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
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-${col.align || "left"} px-2 py-2 ${col.width || ""}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((group, groupIdx) => (
                <tbody key={group.groupName || `no-group-${groupIdx}`}>
                  {group.groupName && <GroupHeader name={group.groupName} />}
                  {group.standings.map((s, i) => (
                    <tr
                      key={`${s.team_name}-${i}`}
                      className="border-b border-edge/50 hover:bg-surface-hover transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col.key}
                          className={`px-2 py-1.5 ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""} ${col.width || ""} ${col.key === "team" ? "" : "font-mono text-fg-2"}`}
                        >
                          {col.getValue(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}