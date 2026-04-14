/**
 * Sports FeedTab — desktop-native.
 *
 * Tabbed container with Scores, Schedule, and Standings views.
 * Scores shows real-time game scoreboard cards via CDC/SSE.
 * Schedule filters upcoming pre-games by date.
 * Standings fetches league standings from the API.
 */
import { useState, useMemo } from "react";
import { clsx } from "clsx";
import { Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueryOptions } from "../../api/queries";
import { useSportsConfig } from "../../hooks/useSportsConfig";
import { ScoresTab } from "./ScoresTab";
import { ScheduleTab } from "./ScheduleTab";
import { StandingsTab } from "./StandingsTab";
import EmptyChannelState from "../../components/EmptyChannelState";
import type { Game, FeedTabProps, ChannelManifest } from "../../types";

// ── Channel manifest ─────────────────────────────────────────────

export const sportsChannel: ChannelManifest = {
  id: "sports",
  name: "Sports",
  tabLabel: "Sports",
  description: "Live scores and game updates",
  hex: "#f97316",
  icon: Trophy,
  info: {
    about:
      "Follow live scores across NFL, NBA, MLB, NHL, MLS, and more. " +
      "Scores update automatically with a visual flash when they change.",
    usage: [
      "Pick your leagues from the Settings tab.",
      "Live games show a pulsing indicator and scores update automatically.",
      "Final scores highlight the winning team in bold.",
    ],
  },
  FeedTab: SportsFeedTab,
};

// ── Tab type ─────────────────────────────────────────────────────

type SportsTab = "scores" | "schedule" | "standings";

// ── FeedTab ──────────────────────────────────────────────────────

function SportsFeedTab({ mode, feedContext, onConfigure }: FeedTabProps) {
  const [tab, setTab] = useState<SportsTab>("scores");
  const { leagues, display } = useSportsConfig();

  const { data: dashboard } = useQuery(dashboardQueryOptions());
  const games = useMemo(
    () => (dashboard?.data?.sports as Game[] | undefined) ?? [],
    [dashboard?.data?.sports],
  );

  if (games.length === 0 && leagues.length === 0) {
    return (
      <EmptyChannelState
        icon={Trophy}
        noun="leagues"
        hasConfig={!!feedContext.__hasConfig}
        dashboardLoaded={!!feedContext.__dashboardLoaded}
        loadingNoun="scores"
        actionHint="pick your leagues"
        onConfigure={onConfigure}
      />
    );
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 px-3 py-2 bg-surface">
        {(["scores", "schedule", "standings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              tab === t
                ? "bg-accent/10 text-accent"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
            )}
          >
            {t === "scores" ? "Scores" : t === "schedule" ? "Schedule" : "Standings"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "scores" && <ScoresTab games={games} mode={mode} display={display} />}
      {tab === "schedule" && <ScheduleTab games={games} />}
      {tab === "standings" && <StandingsTab leagues={leagues} />}
    </div>
  );
}
