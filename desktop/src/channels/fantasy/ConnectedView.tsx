import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Section,
  DisplayRow,
  ActionRow,
  SegmentedRow,
} from "../../components/settings/SettingsControls";
import UpgradePrompt from "../../components/UpgradePrompt";
import ConfigLeagueCard from "./LeagueDetails";
import type { LeagueResponse } from "./types";
import type { SubscriptionTier } from "../../auth";

// ── Constants ────────────────────────────────────────────────────

const LEAGUES_PER_PAGE = 5;

// ── Props ────────────────────────────────────────────────────────

interface ConnectedViewProps {
  leagues: LeagueResponse[];
  yahooConnected: boolean;
  atLeagueLimit: boolean;
  maxLeagues: number;
  subscriptionTier: SubscriptionTier;
  hex: string;
  /** Discovery ran but Yahoo returned zero leagues for this account. */
  noLeaguesFound: boolean;
  onStartDiscovery: () => void;
  onDisconnect: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function ConnectedView({
  leagues,
  yahooConnected,
  atLeagueLimit,
  maxLeagues,
  subscriptionTier,
  hex,
  noLeaguesFound,
  onStartDiscovery,
  onDisconnect,
}: ConnectedViewProps) {
  const [filter, setFilter] = useState<"active" | "finished">("active");
  const [leagueVisibleCount, setLeagueVisibleCount] =
    useState(LEAGUES_PER_PAGE);

  const sortedLeagues = [...leagues].sort(
    (a, b) => Number(b.season) - Number(a.season),
  );
  const activeLeagues = sortedLeagues.filter((l) => !l.data?.is_finished);
  const finishedLeagues = sortedLeagues.filter((l) => l.data?.is_finished);
  const filteredLeagues =
    filter === "active" ? activeLeagues : finishedLeagues;
  const visibleLeagues = filteredLeagues.slice(0, leagueVisibleCount);
  const hasMore = leagueVisibleCount < filteredLeagues.length;
  const remaining = filteredLeagues.length - leagueVisibleCount;

  const totalLeagues = leagues.length;
  const totalActiveMatchups = activeLeagues.reduce(
    (n, l) => n + (l.matchups?.length ?? 0),
    0,
  );

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter as "active" | "finished");
    setLeagueVisibleCount(LEAGUES_PER_PAGE);
  };

  return (
    <>
      {/* Overview */}
      {leagues.length > 0 && (
        <Section title="Overview">
          <DisplayRow label="Leagues" value={String(totalLeagues)} />
          <DisplayRow
            label="Active Matchups"
            value={String(totalActiveMatchups)}
          />
        </Section>
      )}

      {/* Upgrade prompt at limit */}
      {atLeagueLimit && (
        <div className="px-3 mb-4">
          <UpgradePrompt
            current={leagues.length}
            max={maxLeagues}
            noun="Fantasy leagues"
            tier={subscriptionTier}
          />
        </div>
      )}

      {/* Your Leagues section with filter and pagination */}
      {leagues.length > 0 && (
        <Section title="Your Leagues">
          <div className="px-3">
            <SegmentedRow
              label="Filter"
              value={filter}
              options={[
                {
                  value: "active",
                  label: `Active (${activeLeagues.length})`,
                },
                {
                  value: "finished",
                  label: `Past (${finishedLeagues.length})`,
                },
              ]}
              onChange={handleFilterChange}
            />
          </div>

          {/* League cards */}
          <div className="px-3 space-y-2 mt-2">
            <AnimatePresence mode="popLayout">
              {visibleLeagues.map((league, i) => (
                <motion.div
                  key={league.league_key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                    delay: i < LEAGUES_PER_PAGE ? i * 0.04 : 0,
                  }}
                  layout
                >
                  <ConfigLeagueCard league={league} hex={hex} />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Empty filter state */}
            {filteredLeagues.length === 0 && (
              <p className="text-center text-[11px] text-fg-3 py-6">
                {filter === "active"
                  ? "No active leagues right now"
                  : "No past leagues found"}
              </p>
            )}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() =>
                  setLeagueVisibleCount((prev) => prev + LEAGUES_PER_PAGE)
                }
                className="w-full p-3 rounded-lg bg-base-250/30 border border-edge/30 text-fg-3 hover:text-fg-2 hover:border-edge/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <ChevronDown size={14} />
                <span className="text-[11px] font-medium">
                  Show {Math.min(remaining, LEAGUES_PER_PAGE)} more ({remaining}{" "}
                  remaining)
                </span>
              </button>
            )}
          </div>
        </Section>
      )}

      {/* Connected but no leagues */}
      {yahooConnected && leagues.length === 0 && (
        <div className="text-center py-8 space-y-3 px-3">
          {noLeaguesFound ? (
            <>
              <p className="text-sm font-medium text-fg-2">
                No Fantasy Leagues Found
              </p>
              <p className="text-[12px] text-fg-3 max-w-xs mx-auto">
                Your Yahoo account doesn&rsquo;t have any Fantasy Sports leagues.
                Join or create a league on Yahoo, then come back and search again.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={() => open("https://football.fantasysports.yahoo.com")}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium border border-edge/30 text-fg-3 hover:text-fg-2 hover:border-edge/50 transition-colors cursor-pointer"
                >
                  Go to Yahoo Fantasy
                </button>
                <button
                  onClick={onStartDiscovery}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-colors cursor-pointer"
                  style={{ background: hex }}
                >
                  Search Again
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[12px] text-fg-3">
                Yahoo account connected — no leagues added yet
              </p>
              <button
                onClick={onStartDiscovery}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-colors cursor-pointer"
                style={{ background: hex }}
              >
                <Plus size={14} />
                Find Leagues
              </button>
            </>
          )}
        </div>
      )}

      {/* Account actions */}
      {yahooConnected && (
        <Section title="Account">
          <ActionRow
            label="Add more leagues"
            description="Find and add new Yahoo Fantasy leagues"
            action="Find Leagues"
            onClick={onStartDiscovery}
          />
          <ActionRow
            label="Disconnect Yahoo"
            description="Remove your Yahoo account connection"
            action="Disconnect"
            actionClass="bg-error/10 text-error hover:bg-error/20"
            onClick={onDisconnect}
          />
        </Section>
      )}
    </>
  );
}
