import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Shield,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { sportLabel, SPORT_EMOJI, isMatchupLive, isMatchupFinal } from "./types";
import type {
  LeagueResponse,
  StandingsEntry,
  Matchup,
  RosterEntry,
  RosterPlayer,
} from "./types";

// ── Constants ────────────────────────────────────────────────────

export type ImportStatus = "pending" | "importing" | "done" | "error";

export const INJURY_COLORS: Record<string, string> = {
  O: "#ef4444",
  IR: "#ef4444",
  SUSP: "#ef4444",
  D: "#f97316",
  Q: "#eab308",
  P: "#eab308",
  DTD: "#f97316",
  DL: "#ef4444",
  NA: "#a3a3a3",
};

// ── Section Toggle ───────────────────────────────────────────────

export function SectionToggle({
  label,
  isOpen,
  onClick,
  hex,
}: {
  label: string;
  isOpen: boolean;
  onClick: () => void;
  hex: string;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] font-medium transition-all cursor-pointer",
        isOpen ? "" : "text-fg-3 hover:text-fg-2",
      )}
      style={
        isOpen
          ? {
              color: hex,
              background: `${hex}10`,
            }
          : undefined
      }
    >
      {label}
      <motion.div
        animate={{ rotate: isOpen ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <ChevronDown size={10} />
      </motion.div>
    </button>
  );
}

// ── Expandable Wrapper ───────────────────────────────────────────

export function ExpandableSection({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="overflow-hidden"
    >
      <div className="px-4 pb-4">{children}</div>
    </motion.div>
  );
}

// ── Matchup Score Card ───────────────────────────────────────────

export function MatchupScoreCard({
  matchup,
  userTeamKey,
  hex,
}: {
  matchup: Matchup;
  userTeamKey: string | null;
  hex: string;
}) {
  const userTeam = matchup.teams.find((t) => t.team_key === userTeamKey);
  const opponentTeam = matchup.teams.find(
    (t) => t.team_key !== userTeamKey,
  );

  if (!userTeam || !opponentTeam) return null;

  const userPoints = userTeam.points ?? 0;
  const opponentPoints = opponentTeam.points ?? 0;
  const isWinning = userPoints > opponentPoints;
  const isLosing = userPoints < opponentPoints;
  const isLive = isMatchupLive(matchup);
  const isDone = isMatchupFinal(matchup);

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: `${hex}10`,
        borderColor: `${hex}30`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-fg-3">
          {isLive
            ? "Live Matchup"
            : isDone
              ? `Week ${matchup.week} Final`
              : `Week ${matchup.week}`}
        </span>
        {isLive && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-error/10 border border-error/20">
            <span className="h-1 w-1 rounded-full bg-error animate-pulse" />
            <span className="text-[9px] font-bold text-error">Live</span>
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {userTeam.team_logo && (
            <img
              src={userTeam.team_logo}
              alt={userTeam.name}
              className="h-7 w-7 rounded object-cover shrink-0"
            />
          )}
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-fg-2 truncate">
              {userTeam.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={clsx(
              "text-base font-bold font-mono tabular-nums",
              isWinning ? "" : isLosing ? "text-fg-3" : "text-fg-2",
            )}
            style={isWinning ? { color: hex } : undefined}
          >
            {userPoints.toFixed(1)}
          </span>
          <span className="text-[10px] text-fg-3 font-bold">-</span>
          <span
            className={clsx(
              "text-base font-bold font-mono tabular-nums",
              isLosing ? "text-error" : isWinning ? "text-fg-3" : "text-fg-2",
            )}
          >
            {opponentPoints.toFixed(1)}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-fg-2 truncate">
              {opponentTeam.name}
            </p>
          </div>
          {opponentTeam.team_logo && (
            <img
              src={opponentTeam.team_logo}
              alt={opponentTeam.name}
              className="h-7 w-7 rounded object-cover shrink-0"
            />
          )}
        </div>
      </div>

      {(userTeam.projected_points || opponentTeam.projected_points) &&
        !isDone && (
          <div className="flex justify-between mt-1.5 text-[10px] text-fg-3 font-mono">
            <span>
              Projected: {userTeam.projected_points?.toFixed(1) ?? "---"}
            </span>
            <span>
              Projected: {opponentTeam.projected_points?.toFixed(1) ?? "---"}
            </span>
          </div>
        )}
    </div>
  );
}

// ── Matchups Section ─────────────────────────────────────────────

export function MatchupsSection({
  matchups,
  userTeamKey,
  hex,
}: {
  matchups: Matchup[];
  userTeamKey: string | null;
  hex: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-fg-3 mb-2">
        All Matchups &middot; Week {matchups[0]?.week}
      </p>
      {matchups.map((matchup, i) => {
        const isUserMatchup = matchup.teams.some(
          (t) => t.team_key === userTeamKey,
        );
        const teamA = matchup.teams[0];
        const teamB = matchup.teams[1];
        if (!teamA || !teamB) return null;

        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={clsx(
              "flex items-center justify-between p-2 rounded-lg border",
              isUserMatchup
                ? "border-edge/30"
                : "border-edge/30 bg-base-250/15",
            )}
            style={
              isUserMatchup
                ? {
                    borderColor: `${hex}30`,
                    background: `${hex}10`,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {teamA.team_logo && (
                <img
                  src={teamA.team_logo}
                  alt={teamA.name}
                  className="h-4 w-4 rounded object-cover shrink-0"
                />
              )}
              <span
                className={clsx(
                  "text-[11px] font-bold truncate",
                  isUserMatchup && teamA.team_key === userTeamKey
                    ? ""
                    : "text-fg-3",
                )}
                style={
                  isUserMatchup && teamA.team_key === userTeamKey
                    ? { color: hex }
                    : undefined
                }
              >
                {teamA.name}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 mx-2">
              <span className="text-[11px] font-mono font-bold tabular-nums text-fg-2">
                {teamA.points?.toFixed(1) ?? "--"}
              </span>
              <span className="text-[10px] text-fg-3">vs</span>
              <span className="text-[11px] font-mono font-bold tabular-nums text-fg-2">
                {teamB.points?.toFixed(1) ?? "--"}
              </span>
            </div>
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
              <span
                className={clsx(
                  "text-[11px] font-bold truncate",
                  isUserMatchup && teamB.team_key === userTeamKey
                    ? ""
                    : "text-fg-3",
                )}
                style={
                  isUserMatchup && teamB.team_key === userTeamKey
                    ? { color: hex }
                    : undefined
                }
              >
                {teamB.name}
              </span>
              {teamB.team_logo && (
                <img
                  src={teamB.team_logo}
                  alt={teamB.name}
                  className="h-4 w-4 rounded object-cover shrink-0"
                />
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Standings Section ────────────────────────────────────────────

export function StandingsSection({
  standings,
  userTeamKey,
  hex,
}: {
  standings: StandingsEntry[];
  userTeamKey: string | null;
  hex: string;
}) {
  const sorted = [...standings].sort(
    (a, b) => (a.rank ?? 99) - (b.rank ?? 99),
  );

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold text-fg-3 mb-2">Standings</p>
      {sorted.map((team, i) => {
        const isUser = team.team_key === userTeamKey;
        return (
          <motion.div
            key={team.team_key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className={clsx(
              "flex items-center justify-between p-2 rounded-lg border",
              isUser ? "border-edge/30" : "border-edge/30 bg-base-250/15",
            )}
            style={
              isUser
                ? { borderColor: `${hex}30`, background: `${hex}10` }
                : undefined
            }
          >
            <div className="flex items-center gap-2.5">
              <span
                className="text-[11px] font-mono w-4 text-right"
                style={isUser ? { color: hex } : undefined}
              >
                {team.rank ?? i + 1}
              </span>
              {team.team_logo && (
                <img
                  src={team.team_logo}
                  alt={team.name}
                  className="h-5 w-5 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <span
                  className={clsx(
                    "text-[12px] font-bold truncate block max-w-[140px]",
                    isUser ? "" : "text-fg-2",
                  )}
                  style={isUser ? { color: hex } : undefined}
                >
                  {team.name}
                </span>
                {team.manager_name && (
                  <span className="text-[10px] text-fg-3 block truncate max-w-[120px]">
                    {team.manager_name}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {team.clinched_playoffs && (
                <Shield size={10} className="text-success" />
              )}
              <span className="text-[11px] font-mono text-fg-3 tabular-nums">
                {team.wins}-{team.losses}
                {team.ties > 0 ? `-${team.ties}` : ""}
              </span>
              <span className="text-[11px] font-mono text-fg-3 tabular-nums w-16 text-right">
                {team.points_for} pts
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Roster Section ───────────────────────────────────────────────

export function RosterSection({
  rosters,
  userTeamKey,
}: {
  rosters: RosterEntry[];
  userTeamKey: string | null;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string>(
    userTeamKey ?? rosters[0]?.team_key ?? "",
  );

  const currentRoster = rosters.find((r) => r.team_key === selectedTeam);
  const players = currentRoster?.data?.players ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-fg-3">Roster</p>
        {rosters.length > 1 && (
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="text-[11px] bg-base-200 border border-edge/30 rounded-lg px-2 py-1 text-fg-2 focus:outline-none cursor-pointer"
          >
            {rosters.map((r) => (
              <option key={r.team_key} value={r.team_key}>
                {r.data?.team_name || "Unnamed League"}
                {r.team_key === userTeamKey ? " (You)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-0.5">
        {players.map((player) => {
          const hasInjury = !!player.status;
          const injuryColor =
            INJURY_COLORS[player.status ?? ""] ?? "#a3a3a3";

          return (
            <div
              key={player.player_key}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-base-250/30 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="text-[10px] font-mono text-fg-3 w-6 text-center shrink-0">
                  {player.selected_position}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] font-bold text-fg-2 truncate max-w-[120px]">
                      {player.name.full || player.name.last}
                    </span>
                    {hasInjury && (
                      <span
                        className="text-[9px] font-bold px-1 rounded"
                        style={{
                          color: injuryColor,
                          background: `${injuryColor}25`,
                        }}
                      >
                        {player.status}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-fg-3">
                    {player.editorial_team_abbr}
                    {player.display_position
                      ? ` - ${player.display_position}`
                      : ""}
                    {hasInjury && player.injury_note
                      ? ` \u00b7 ${player.injury_note}`
                      : ""}
                  </span>
                </div>
              </div>
              {player.player_points !== null &&
                player.player_points !== undefined && (
                  <span className="text-[11px] font-mono font-bold tabular-nums text-fg-3 shrink-0">
                    {player.player_points.toFixed(1)}
                  </span>
                )}
            </div>
          );
        })}

        {players.length === 0 && (
          <p className="text-[11px] text-fg-3 text-center py-3">
            No players found
          </p>
        )}
      </div>
    </div>
  );
}

// ── Config League Card (default export) ──────────────────────────

function ConfigLeagueCard({
  league,
  hex,
}: {
  league: LeagueResponse;
  hex: string;
}) {
  const [openSection, setOpenSection] = useState<
    "matchups" | "standings" | "roster" | null
  >(null);

  const isActive = !league.data?.is_finished;
  const sport = sportLabel(league.game_code);
  const sportEmoji = SPORT_EMOJI[league.game_code] || "";
  const numTeams = league.data?.num_teams || 0;
  const currentWeek = league.data?.current_week;

  const userMatchup = league.matchups?.find((m) =>
    m.teams.some((t) => t.team_key === league.team_key),
  );
  const standings = league.standings ?? [];
  const userStanding = standings.find(
    (s) => s.team_key === league.team_key,
  );
  const userRoster = league.rosters?.find(
    (r) => r.team_key === league.team_key,
  );
  const injuredPlayers =
    userRoster?.data?.players?.filter((p) => p.status) ?? [];

  const toggleSection = (section: "matchups" | "standings" | "roster") =>
    setOpenSection((prev) => (prev === section ? null : section));

  return (
    <div
      className={clsx(
        "border rounded-lg overflow-hidden transition-colors relative",
        isActive
          ? "bg-base-250/30 border-edge/30"
          : "bg-base-250/15 border-edge/30",
      )}
    >
      {/* Accent top line */}
      {isActive && (
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${hex} 50%, transparent)`,
          }}
        />
      )}

      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0 text-base"
              style={
                isActive
                  ? {
                      background: `${hex}30`,
                      boxShadow: `0 0 0 1px ${hex}30`,
                    }
                  : {
                      background: "var(--color-base-300)",
                      boxShadow: "0 0 0 1px var(--color-edge)",
                    }
              }
            >
              {sportEmoji || (
                <span
                  className="text-sm font-bold"
                  style={isActive ? { color: hex } : { color: "var(--color-fg-3)" }}
                >
                  Y!
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3
                className={clsx(
                  "text-[13px] font-bold truncate",
                  isActive ? "text-fg" : "text-fg-3",
                )}
              >
                {league.name}
              </h3>
              <p className="text-[11px] text-fg-3">
                {sport} &middot; {numTeams} Teams
                {league.season ? ` \u00b7 ${league.season}` : ""}
                {currentWeek && isActive ? ` \u00b7 Week ${currentWeek}` : ""}
              </p>
            </div>
          </div>
          {isActive ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 border border-success/20">
              <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] font-bold text-success">
                Active
              </span>
            </span>
          ) : (
            <span className="text-[10px] font-mono text-fg-3">
              {league.season}
            </span>
          )}
        </div>

        {/* User's matchup score */}
        {userMatchup && (
          <MatchupScoreCard
            matchup={userMatchup}
            userTeamKey={league.team_key}
            hex={hex}
          />
        )}

        {/* Quick stats */}
        {league.team_key && (
          <div className="flex items-center gap-4 mt-2">
            {userStanding && (
              <span className="text-[11px] text-fg-3">
                <span className="font-bold" style={{ color: hex }}>
                  #{userStanding.rank ?? "?"}
                </span>{" "}
                in standings &middot;{" "}
                <span className="font-mono">
                  {userStanding.wins}-{userStanding.losses}
                  {userStanding.ties > 0 ? `-${userStanding.ties}` : ""}
                </span>
                {userStanding.streak_value > 0 && (
                  <span className="ml-1">
                    ({userStanding.streak_type?.[0]?.toUpperCase()}
                    {userStanding.streak_value})
                  </span>
                )}
              </span>
            )}
            {injuredPlayers.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-warn">
                <AlertTriangle size={11} />
                {injuredPlayers.length} injured
              </span>
            )}
          </div>
        )}
      </div>

      {/* Section toggles */}
      <div className="px-4 pb-2">
        <div className="h-px bg-edge/30 mb-2" />
        <div className="flex gap-1">
          {(league.matchups?.length ?? 0) > 0 && (
            <SectionToggle
              label="Matchups"
              isOpen={openSection === "matchups"}
              onClick={() => toggleSection("matchups")}
              hex={hex}
            />
          )}
          {standings.length > 0 && (
            <SectionToggle
              label="Standings"
              isOpen={openSection === "standings"}
              onClick={() => toggleSection("standings")}
              hex={hex}
            />
          )}
          {(league.rosters?.length ?? 0) > 0 && (
            <SectionToggle
              label="Rosters"
              isOpen={openSection === "roster"}
              onClick={() => toggleSection("roster")}
              hex={hex}
            />
          )}
        </div>
      </div>

      {/* Expandable sections */}
      <AnimatePresence initial={false}>
        {openSection === "matchups" && league.matchups && (
          <ExpandableSection key="matchups">
            <MatchupsSection
              matchups={league.matchups}
              userTeamKey={league.team_key}
              hex={hex}
            />
          </ExpandableSection>
        )}
        {openSection === "standings" && standings.length > 0 && (
          <ExpandableSection key="standings">
            <StandingsSection
              standings={standings}
              userTeamKey={league.team_key}
              hex={hex}
            />
          </ExpandableSection>
        )}
        {openSection === "roster" && league.rosters && (
          <ExpandableSection key="roster">
            <RosterSection
              rosters={league.rosters}
              userTeamKey={league.team_key}
            />
          </ExpandableSection>
        )}
      </AnimatePresence>

      {/* No data fallback */}
      {!userMatchup &&
        standings.length === 0 &&
        (league.rosters?.length ?? 0) === 0 && (
          <div className="px-4 pb-3">
            <div className="h-px bg-edge/30 mb-2" />
            <p className="text-[11px] text-fg-3 text-center">
              League data is still loading — check back shortly
            </p>
          </div>
        )}
    </div>
  );
}

export { ConfigLeagueCard };
export default ConfigLeagueCard;
