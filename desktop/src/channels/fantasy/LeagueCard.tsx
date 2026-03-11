/**
 * LeagueCard — renders a single fantasy league with matchup and standings.
 *
 * Supports compact (minimal single-line) and comfort (expanded with
 * matchup hero, stats, and injury count) display modes.
 */
import { useMemo } from "react";
import { clsx } from "clsx";
import { CompactMatchupScore, ComfortMatchupHero } from "./MatchupScore";
import type { FeedMode } from "../../types";
import type { LeagueResponse, Matchup, StandingsEntry } from "./types";

// ── Helpers ──────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
  nfl: "\u{1F3C8}",
  nba: "\u{1F3C0}",
  nhl: "\u{1F3D2}",
  mlb: "\u26BE",
};

function sportEmoji(gameCode: string): string {
  return SPORT_EMOJI[gameCode] ?? "\u{1F3C6}";
}

function formatRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function streakLabel(type: string, value: number): string {
  if (!type || value === 0) return "";
  const prefix = type === "win" ? "W" : type === "loss" ? "L" : "T";
  return `${prefix}${value}`;
}

// ── LeagueCard ──────────────────────────────────────────────────

interface LeagueCardProps {
  league: LeagueResponse;
  mode: FeedMode;
}

export function LeagueCard({ league, mode }: LeagueCardProps) {
  const myTeamKey = league.team_key;
  const currentWeek = league.data?.current_week ?? 0;

  const myMatchup = useMemo(() => {
    return league.matchups?.find(
      (m) =>
        m.week === currentWeek &&
        m.teams?.some((t) => t.team_key === myTeamKey),
    );
  }, [league.matchups, currentWeek, myTeamKey]);

  const myStanding = useMemo(() => {
    return league.standings?.find((s) => s.team_key === myTeamKey);
  }, [league.standings, myTeamKey]);

  const injuryCount = useMemo(() => {
    const myRoster = league.rosters?.find((r) => r.team_key === myTeamKey);
    if (!myRoster?.data?.players) return 0;
    return myRoster.data.players.filter(
      (p) => p.status && p.status !== "",
    ).length;
  }, [league.rosters, myTeamKey]);

  if (mode === "compact") {
    return (
      <LeagueCardCompact
        league={league}
        myMatchup={myMatchup}
        myStanding={myStanding}
        injuryCount={injuryCount}
      />
    );
  }

  return (
    <LeagueCardComfort
      league={league}
      myMatchup={myMatchup}
      myStanding={myStanding}
      injuryCount={injuryCount}
    />
  );
}

// ── Compact mode ─────────────────────────────────────────────────

function LeagueCardCompact({
  league,
  myMatchup,
  myStanding,
  injuryCount,
}: {
  league: LeagueResponse;
  myMatchup: Matchup | undefined;
  myStanding: StandingsEntry | undefined;
  injuryCount: number;
}) {
  const myTeamKey = league.team_key;

  return (
    <div className="px-3 py-1.5 bg-surface">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]">{sportEmoji(league.game_code)}</span>
        <span className="text-[10px] font-mono font-medium text-fg truncate max-w-[140px]">
          {league.name}
        </span>
        {myStanding && (
          <span className="text-[9px] font-mono text-fg-3 ml-auto shrink-0">
            #{myStanding.rank} &middot;{" "}
            {formatRecord(myStanding.wins, myStanding.losses, myStanding.ties)}
          </span>
        )}
      </div>

      {myMatchup && myMatchup.teams?.length === 2 && (
        <CompactMatchupScore matchup={myMatchup} myTeamKey={myTeamKey} />
      )}

      {injuryCount > 0 && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
          <span className="text-[9px] font-mono text-fg-3">
            {injuryCount} injur{injuryCount === 1 ? "y" : "ies"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Comfort mode ─────────────────────────────────────────────────

function LeagueCardComfort({
  league,
  myMatchup,
  myStanding,
  injuryCount,
}: {
  league: LeagueResponse;
  myMatchup: Matchup | undefined;
  myStanding: StandingsEntry | undefined;
  injuryCount: number;
}) {
  const myTeamKey = league.team_key;

  return (
    <div className="px-3 py-2.5 bg-surface border-l-2 border-l-accent/30">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs">{sportEmoji(league.game_code)}</span>
        <span className="text-xs font-mono font-bold text-fg truncate">
          {league.name}
        </span>
        <span className="text-[9px] font-mono text-fg-4 ml-auto shrink-0 uppercase">
          {league.game_code} {league.season}
        </span>
      </div>

      {myMatchup && myMatchup.teams?.length === 2 ? (
        <ComfortMatchupHero matchup={myMatchup} myTeamKey={myTeamKey} />
      ) : (
        <div className="text-[10px] font-mono text-fg-3 py-1">
          No current matchup
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {myStanding && (
          <>
            <StatPill label="Rank" value={`#${myStanding.rank}`} />
            <StatPill
              label="Record"
              value={formatRecord(
                myStanding.wins,
                myStanding.losses,
                myStanding.ties,
              )}
            />
            {streakLabel(myStanding.streak_type, myStanding.streak_value) && (
              <StatPill
                label="Streak"
                value={streakLabel(
                  myStanding.streak_type,
                  myStanding.streak_value,
                )}
                accent={myStanding.streak_type === "win"}
              />
            )}
            {myStanding.clinched_playoffs && (
              <span className="text-[9px] font-mono text-up font-bold uppercase tracking-wider">
                Clinched
              </span>
            )}
          </>
        )}
        {injuryCount > 0 && (
          <div className="flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-[9px] font-mono text-fg-3">
              {injuryCount} injur{injuryCount === 1 ? "y" : "ies"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat pill ────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] font-mono text-fg-4 uppercase tracking-wider">
        {label}
      </span>
      <span
        className={clsx(
          "text-[10px] font-mono font-medium tabular-nums",
          accent ? "text-up" : "text-fg-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}
