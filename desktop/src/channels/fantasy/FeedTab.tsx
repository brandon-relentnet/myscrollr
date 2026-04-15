/**
 * Fantasy FeedTab -- desktop-native.
 *
 * Renders Yahoo Fantasy Sports leagues with matchups, standings,
 * and injury counts. Unlike other channels, fantasy data arrives
 * as a structured MyLeaguesResponse rather than a flat CDC array,
 * so fantasy CDC events are not processed by the CDC merge engine.
 *
 * Controls bar provides sport filter pills, sort dropdown, and
 * status filter. Summary bar shows league/matchup/live counts.
 */
import { useMemo, useState, useCallback } from "react";
import { clsx } from "clsx";
import { Swords } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LeagueCard } from "./LeagueCard";
import { SPORT_EMOJI, isMatchupLive } from "./types";
import { dashboardQueryOptions } from "../../api/queries";
import { useShell } from "../../shell-context";
import EmptyChannelState from "../../components/EmptyChannelState";
import type { FeedTabProps, ChannelManifest } from "../../types";
import type { LeagueResponse, MyLeaguesResponse } from "./types";

// -- Channel manifest ---------------------------------------------------------

export const fantasyChannel: ChannelManifest = {
  id: "fantasy",
  name: "Fantasy",
  tabLabel: "Fantasy",
  description: "Yahoo Fantasy Sports leagues",
  hex: "#6366f1",
  icon: Swords,
  info: {
    about:
      "View your Yahoo Fantasy Sports leagues at a glance. See your current " +
      "matchup score, standings rank, win/loss record, and roster injury alerts.",
    usage: [
      "Connect your Yahoo account from the Settings tab.",
      "Your leagues and matchups appear automatically.",
      "Scores update when the dashboard refreshes.",
    ],
  },
  FeedTab: FantasyFeedTab,
};

// -- Helpers ------------------------------------------------------------------

function extractLeagues(data: unknown): LeagueResponse[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const resp = data as MyLeaguesResponse;
    return resp.leagues ?? [];
  }
  if (Array.isArray(data)) return data as LeagueResponse[];
  return [];
}

// -- Filter / sort types ------------------------------------------------------

type SportFilter = "all" | "nfl" | "nba" | "nhl" | "mlb";
type StatusFilter = "all" | "active" | "finished";
type SortKey = "name" | "season" | "record" | "matchup";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "season", label: "Season" },
  { value: "record", label: "Record" },
  { value: "matchup", label: "Matchup" },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "finished", label: "Finished" },
];

// -- Sort helpers -------------------------------------------------------------

function winPct(league: LeagueResponse): number {
  const myStanding = league.standings?.find(
    (s) => s.team_key === league.team_key,
  );
  if (!myStanding) return -1;
  const total = myStanding.wins + myStanding.losses + myStanding.ties;
  return total === 0 ? 0 : myStanding.wins / total;
}

function matchupDiff(league: LeagueResponse): number {
  const currentWeek = league.data?.current_week ?? 0;
  const myMatchup = league.matchups?.find(
    (m) =>
      m.week === currentWeek &&
      m.teams?.some((t) => t.team_key === league.team_key),
  );
  if (!myMatchup || !myMatchup.teams || myMatchup.teams.length < 2) return -Infinity;
  const myTeam = myMatchup.teams.find((t) => t.team_key === league.team_key);
  const oppTeam = myMatchup.teams.find((t) => t.team_key !== league.team_key);
  return (myTeam?.points ?? 0) - (oppTeam?.points ?? 0);
}

function hasLiveMatchup(league: LeagueResponse): boolean {
  const currentWeek = league.data?.current_week ?? 0;
  const myMatchup = league.matchups?.find(
    (m) =>
      m.week === currentWeek &&
      m.teams?.some((t) => t.team_key === league.team_key),
  );
  return myMatchup ? isMatchupLive(myMatchup) : false;
}

// -- FeedTab ------------------------------------------------------------------

function FantasyFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const { prefs } = useShell();
  const dp = prefs.channelDisplay.fantasy;

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const fantasyData = dashboard?.data?.fantasy;
  const leagues = useMemo(() => extractLeagues(fantasyData), [fantasyData]);

  // -- Filter / sort state --------------------------------------------------
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(() => dp.defaultSort ?? "name");

  const clearFilters = useCallback(() => {
    setSportFilter("all");
    setStatusFilter("all");
  }, []);

  const hasFilters = sportFilter !== "all" || statusFilter !== "all";

  // -- Available sports (only show pills for sports that exist) -------------
  const availableSports = useMemo(() => {
    const sports = new Set<string>();
    for (const l of leagues) {
      if (l.game_code) sports.add(l.game_code.toLowerCase());
    }
    const order: SportFilter[] = ["nfl", "nba", "nhl", "mlb"];
    return order.filter((s) => sports.has(s));
  }, [leagues]);

  // -- Data pipeline: filter + sort -----------------------------------------
  const filtered = useMemo(() => {
    let items = leagues;

    // Sport filter
    if (sportFilter !== "all") {
      items = items.filter(
        (l) => l.game_code.toLowerCase() === sportFilter,
      );
    }

    // Status filter
    if (statusFilter === "active") {
      items = items.filter((l) => !l.data.is_finished);
    } else if (statusFilter === "finished") {
      items = items.filter((l) => l.data.is_finished);
    }

    // Sort
    items = [...items].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return a.name.localeCompare(b.name);
        case "season":
          return (b.season ?? "").localeCompare(a.season ?? "");
        case "record":
          return winPct(b) - winPct(a);
        case "matchup": {
          const aLive = hasLiveMatchup(a) ? 1 : 0;
          const bLive = hasLiveMatchup(b) ? 1 : 0;
          if (bLive !== aLive) return bLive - aLive;
          return matchupDiff(b) - matchupDiff(a);
        }
        default:
          return 0;
      }
    });

    return items;
  }, [leagues, sportFilter, statusFilter, sortKey]);

  // -- Summary counts -------------------------------------------------------
  const { activeMatchups, liveCount } = useMemo(() => {
    let active = 0;
    let live = 0;
    for (const l of leagues) {
      const currentWeek = l.data?.current_week ?? 0;
      const myMatchup = l.matchups?.find(
        (m) =>
          m.week === currentWeek &&
          m.teams?.some((t) => t.team_key === l.team_key),
      );
      if (myMatchup) {
        active++;
        if (isMatchupLive(myMatchup)) live++;
      }
    }
    return { activeMatchups: active, liveCount: live };
  }, [leagues]);

  // -- Empty state (no data at all) -----------------------------------------
  if (leagues.length === 0) {
    return (
      <EmptyChannelState
        icon={Swords}
        noun="fantasy leagues"
        hasConfig={!!feedContext.__hasConfig}
        dashboardLoaded={!!feedContext.__dashboardLoaded}
        loadingNoun="leagues"
        actionHint="connect your Yahoo account"
        onConfigure={onConfigure}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="sticky top-0 z-20 bg-surface border-b border-edge/30 px-3 py-2 flex items-center gap-2">
        {/* Sport filter pills -- left side */}
        <div className="flex gap-1">
          <button
            onClick={() => setSportFilter("all")}
            className={clsx(
              "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
              sportFilter === "all"
                ? "bg-accent/15 text-accent"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            All
          </button>
          {availableSports.map((sport) => (
            <button
              key={sport}
              onClick={() => setSportFilter(sport)}
              className={clsx(
                "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer",
                sportFilter === sport
                  ? "bg-accent/15 text-accent"
                  : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
              )}
            >
              {SPORT_EMOJI[sport] ?? ""} {sport.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Sort + status filter -- right side */}
        <div className="flex items-center gap-2 ml-auto">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-surface-2 border border-edge/40 rounded-md px-2 py-1.5 text-[11px] text-fg-2 cursor-pointer outline-none focus:border-accent/60"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="bg-surface-2 border border-edge/40 rounded-md px-2 py-1.5 text-[11px] text-fg-2 cursor-pointer outline-none focus:border-accent/60"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary bar */}
      <div className="px-3 py-1 bg-surface border-b border-edge/30 font-mono text-[10px] tabular-nums flex items-center gap-1.5">
        <span className="text-fg-3">{leagues.length} leagues</span>
        <span className="text-fg-3">&middot;</span>
        <span className="text-fg-3">{activeMatchups} active matchups</span>
        {liveCount > 0 && (
          <>
            <span className="text-fg-3">&middot;</span>
            <span className="text-accent">{liveCount} live</span>
          </>
        )}
      </div>

      {/* League grid or empty filter state */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p className="text-[12px] text-fg-3">
            No leagues match your filters
          </p>
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 rounded-md text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-px bg-edge grid-cols-1">
          {filtered.map((league) => (
            <LeagueCard
              key={league.league_key}
              league={league}
              mode={mode}
              showStandings={dp.showStandings}
              showInjuryCount={dp.showInjuryCount}
              showMatchups={dp.showMatchups}
            />
          ))}
        </div>
      )}
    </div>
  );
}
