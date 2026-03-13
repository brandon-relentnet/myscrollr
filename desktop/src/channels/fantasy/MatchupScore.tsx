/**
 * Matchup score components for compact and comfort display modes.
 */
import { clsx } from "clsx";
import type { Matchup } from "./types";

// ── Compact matchup ─────────────────────────────────────────────

interface CompactMatchupScoreProps {
  matchup: Matchup;
  myTeamKey: string;
}

export function CompactMatchupScore({
  matchup,
  myTeamKey,
}: CompactMatchupScoreProps) {
  const myTeam = matchup.teams.find((t) => t.team_key === myTeamKey);
  const oppTeam = matchup.teams.find((t) => t.team_key !== myTeamKey);
  if (!myTeam || !oppTeam) return null;

  const isLive = matchup.status === "midevent";
  const isFinal = matchup.status === "postevent";
  const myWinning = myTeam.points > oppTeam.points;

  return (
    <div className="flex items-center gap-2 mt-0.5 text-xs">
      <span
        className={clsx(
          "font-mono font-bold tabular-nums",
          myWinning
            ? "text-up"
            : isFinal && !myWinning
              ? "text-down"
              : "text-fg",
        )}
      >
        {myTeam.points.toFixed(1)}
      </span>
      <span className="text-fg-4 font-mono">&ndash;</span>
      <span className="font-mono font-medium text-fg tabular-nums">
        {oppTeam.points.toFixed(1)}
      </span>
      <span className="text-[10px] font-mono text-fg-3 truncate max-w-[100px]">
        {oppTeam.name}
      </span>
      <span className="ml-auto shrink-0">
        {isLive && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
            <span className="text-[9px] font-mono text-live font-bold uppercase">
              Wk{matchup.week}
            </span>
          </span>
        )}
        {isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">
            Final
          </span>
        )}
        {!isLive && !isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">
            Wk{matchup.week}
          </span>
        )}
      </span>
    </div>
  );
}

// ── Comfort matchup hero ────────────────────────────────────────

interface ComfortMatchupHeroProps {
  matchup: Matchup;
  myTeamKey: string;
}

export function ComfortMatchupHero({
  matchup,
  myTeamKey,
}: ComfortMatchupHeroProps) {
  const myTeam = matchup.teams.find((t) => t.team_key === myTeamKey);
  const oppTeam = matchup.teams.find((t) => t.team_key !== myTeamKey);
  if (!myTeam || !oppTeam) return null;

  const isLive = matchup.status === "midevent";
  const isFinal = matchup.status === "postevent";
  const myWinning = myTeam.points > oppTeam.points;

  return (
    <div
      className={clsx(
        "flex items-center gap-2 px-2 py-1.5 bg-surface-2 border border-edge-2",
        isLive && "border-live/30",
      )}
    >
      {/* My team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {myTeam.team_logo && (
          <img
            src={myTeam.team_logo}
            alt={myTeam.name}
            className="w-5 h-5 object-contain shrink-0"
          />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-fg truncate">
            {myTeam.name}
          </div>
          <div className="text-[9px] font-mono text-fg-4 tabular-nums">
            proj {myTeam.projected_points.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            myWinning
              ? "text-up"
              : isFinal && !myWinning
                ? "text-down"
                : "text-fg",
          )}
        >
          {myTeam.points.toFixed(1)}
        </span>
        <span className="text-fg-4 text-[10px] font-mono">&ndash;</span>
        <span
          className={clsx(
            "text-sm font-mono font-bold tabular-nums",
            !myWinning && oppTeam.points > myTeam.points
              ? isFinal
                ? "text-up"
                : "text-fg"
              : "text-fg",
          )}
        >
          {oppTeam.points.toFixed(1)}
        </span>
      </div>

      {/* Opponent */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-mono text-fg truncate">
            {oppTeam.name}
          </div>
          <div className="text-[9px] font-mono text-fg-4 tabular-nums">
            proj {oppTeam.projected_points.toFixed(1)}
          </div>
        </div>
        {oppTeam.team_logo && (
          <img
            src={oppTeam.team_logo}
            alt={oppTeam.name}
            className="w-5 h-5 object-contain shrink-0"
          />
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0 ml-1">
        {isLive && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
            <span className="text-[9px] font-mono text-live font-bold uppercase">
              Live
            </span>
          </span>
        )}
        {isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">
            Final
          </span>
        )}
        {!isLive && !isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">
            Wk{matchup.week}
          </span>
        )}
      </div>
    </div>
  );
}
