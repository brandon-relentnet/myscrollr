/**
 * Fantasy FeedTab — desktop-native.
 *
 * Renders Yahoo Fantasy Sports leagues with matchups, standings,
 * and injury counts. Unlike other channels, fantasy data arrives
 * as a structured MyLeaguesResponse rather than a flat CDC array,
 * so fantasy CDC events are not processed by the CDC merge engine.
 */
import { useMemo } from "react";
import { Swords } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { LeagueCard } from "./LeagueCard";
import { dashboardQueryOptions } from "../../api/queries";
import { useShell } from "../../shell-context";
import type { FeedTabProps, ChannelManifest } from "../../types";
import type { LeagueResponse, MyLeaguesResponse } from "./types";

// ── Channel manifest ─────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────

function extractLeagues(data: unknown): LeagueResponse[] {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const resp = data as MyLeaguesResponse;
    return resp.leagues ?? [];
  }
  if (Array.isArray(data)) return data as LeagueResponse[];
  return [];
}

// ── FeedTab ──────────────────────────────────────────────────────

function FantasyFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const { prefs } = useShell();
  const dp = prefs.channelDisplay.fantasy;

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const fantasyData = dashboard?.data?.fantasy;
  const leagues = useMemo(() => extractLeagues(fantasyData), [fantasyData]);
  const dashboardLoaded = feedContext.__dashboardLoaded as
    | boolean
    | undefined;

  if (leagues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 bg-surface">
        <Swords size={28} className="text-fg-4/40" />
        {dashboardLoaded ? (
          <>
            <p className="text-sm font-medium text-fg-3">
              No fantasy leagues connected
            </p>
            {onConfigure ? (
              <button
                onClick={onConfigure}
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                Open Settings to connect your Yahoo account
              </button>
            ) : (
              <p className="text-xs text-fg-4">
                Go to the <span className="text-fg-3 font-medium">Setup</span> tab to connect your Yahoo account.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-fg-4">Loading fantasy data&hellip;</p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-edge grid-cols-1">
      {leagues.map((league) => (
        <LeagueCard
          key={league.league_key}
          league={league}
          mode={mode}
          showStandings={dp.showStandings}
          showInjuryCount={dp.showInjuryCount}
        />
      ))}
    </div>
  );
}
