/**
 * Fantasy FeedTab — desktop-native.
 *
 * Renders Yahoo Fantasy Sports leagues with matchups, standings,
 * and injury counts. Unlike other channels, fantasy data arrives
 * as a structured MyLeaguesResponse rather than a flat CDC array,
 * so this FeedTab does not use useScrollrCDC.
 */
import { useMemo } from "react";
import { Swords } from "lucide-react";
import { LeagueCard } from "./LeagueCard";
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
      "Connect your Yahoo account from the Configuration tab.",
      "Your leagues and matchups appear automatically.",
      "Scores update when the dashboard refreshes.",
    ],
  },
  FeedTab: FantasyFeedTab,
};

// ── Helpers ──────────────────────────────────────────────────────

function getLeagues(config: Record<string, unknown>): LeagueResponse[] {
  const items = config.__initialItems;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    const resp = items as MyLeaguesResponse;
    return resp.leagues ?? [];
  }
  if (Array.isArray(items)) return items as LeagueResponse[];
  return [];
}

// ── FeedTab ──────────────────────────────────────────────────────

function FantasyFeedTab({ mode, channelConfig }: FeedTabProps) {
  const leagues = useMemo(() => getLeagues(channelConfig), [channelConfig]);
  const dashboardLoaded = channelConfig.__dashboardLoaded as
    | boolean
    | undefined;

  if (leagues.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4 bg-surface">
        <span className="text-xs font-mono text-fg-3">
          {dashboardLoaded
            ? "No fantasy leagues \u2014 connect Yahoo in Settings"
            : "Loading fantasy data\u2026"}
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-px bg-edge grid-cols-1">
      {leagues.map((league) => (
        <LeagueCard key={league.league_key} league={league} mode={mode} />
      ))}
    </div>
  );
}
