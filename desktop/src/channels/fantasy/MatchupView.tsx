/**
 * MatchupView — full head-to-head with both rosters side by side.
 *
 * Shows the hero up top, then the user and opponent starting lineups
 * aligned by position slot. Each player row shows their status, live
 * points, and optionally projected points.
 */
import { useMemo } from "react";
import { clsx } from "clsx";
import { AlertTriangle, Minus } from "lucide-react";
import { motion } from "motion/react";
import { MatchupHero } from "./MatchupHero";
import {
  isBenchPosition,
  isInjuryStatus,
  positionOrderIndex,
  statusColorClass,
  userMatchupContext,
} from "./types";
import type { LeagueResponse, RosterEntry, RosterPlayer } from "./types";

interface MatchupViewProps {
  league: LeagueResponse | null;
}

export function MatchupView({ league }: MatchupViewProps) {
  const ctx = useMemo(() => (league ? userMatchupContext(league) : null), [league]);

  if (!league || !ctx) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[12px] text-fg-3">
        No active matchup for this league this week.
      </div>
    );
  }

  const { user, opponent } = ctx;
  const userRoster = league.rosters?.find((r) => r.team_key === user.team_key) ?? null;
  const opponentRoster =
    league.rosters?.find((r) => r.team_key === opponent.team_key) ?? null;

  const pairs = useMemo(
    () => buildStarterPairs(league.game_code, userRoster, opponentRoster),
    [league.game_code, userRoster, opponentRoster],
  );
  const benchPairs = useMemo(
    () => buildBenchPairs(league.game_code, userRoster, opponentRoster),
    [league.game_code, userRoster, opponentRoster],
  );

  return (
    <div className="flex flex-col gap-4 p-4">
      <MatchupHero league={league} />

      {/* Starter comparison */}
      {pairs.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-fg-3">
              Starters
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-fg-3">
              <span>{user.name.split(" ").slice(0, 2).join(" ")}</span>
              <Minus size={12} />
              <span>{opponent.name.split(" ").slice(0, 2).join(" ")}</span>
            </div>
          </div>
          <div className="overflow-hidden rounded-lg border border-edge/40">
            {pairs.map((pair, i) => (
              <motion.div
                key={`${pair.position}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: i * 0.015 }}
              >
                <PlayerPairRow position={pair.position} left={pair.left} right={pair.right} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Bench */}
      {benchPairs.length > 0 && (
        <section>
          <div className="mb-2">
            <h3 className="font-mono text-[10px] uppercase tracking-wider text-fg-3">
              Bench &amp; IR
            </h3>
          </div>
          <div className="overflow-hidden rounded-lg border border-edge/30 bg-surface-2/40">
            {benchPairs.map((pair, i) => (
              <PlayerPairRow
                key={`bench-${pair.position}-${i}`}
                position={pair.position}
                left={pair.left}
                right={pair.right}
                subdued
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Pair building ─────────────────────────────────────────────────

interface PlayerPair {
  position: string;
  left: RosterPlayer | null;
  right: RosterPlayer | null;
}

function buildStarterPairs(
  gameCode: string,
  leftRoster: RosterEntry | null,
  rightRoster: RosterEntry | null,
): PlayerPair[] {
  const leftStarters = (leftRoster?.data.players ?? []).filter(
    (p) => !isBenchPosition(p.selected_position),
  );
  const rightStarters = (rightRoster?.data.players ?? []).filter(
    (p) => !isBenchPosition(p.selected_position),
  );

  const sorter = (a: RosterPlayer, b: RosterPlayer) =>
    positionOrderIndex(gameCode, a.selected_position) -
    positionOrderIndex(gameCode, b.selected_position);

  const leftQueue = [...leftStarters].sort(sorter);
  const rightQueue = [...rightStarters].sort(sorter);

  const pairs: PlayerPair[] = [];
  while (leftQueue.length > 0 || rightQueue.length > 0) {
    const left = leftQueue[0] ?? null;
    const right = rightQueue[0] ?? null;
    if (left && right && left.selected_position === right.selected_position) {
      pairs.push({ position: left.selected_position, left, right });
      leftQueue.shift();
      rightQueue.shift();
    } else if (left && (!right || indexBefore(gameCode, left, right))) {
      pairs.push({ position: left.selected_position, left, right: null });
      leftQueue.shift();
    } else if (right) {
      pairs.push({ position: right.selected_position, left: null, right });
      rightQueue.shift();
    }
  }
  return pairs;
}

function buildBenchPairs(
  gameCode: string,
  leftRoster: RosterEntry | null,
  rightRoster: RosterEntry | null,
): PlayerPair[] {
  const leftBench = (leftRoster?.data.players ?? []).filter((p) =>
    isBenchPosition(p.selected_position),
  );
  const rightBench = (rightRoster?.data.players ?? []).filter((p) =>
    isBenchPosition(p.selected_position),
  );
  const size = Math.max(leftBench.length, rightBench.length);
  const pairs: PlayerPair[] = [];
  for (let i = 0; i < size; i += 1) {
    const left = leftBench[i] ?? null;
    const right = rightBench[i] ?? null;
    pairs.push({
      position: left?.selected_position || right?.selected_position || "BN",
      left,
      right,
    });
  }
  return pairs;
}

function indexBefore(
  gameCode: string,
  a: RosterPlayer,
  b: RosterPlayer,
): boolean {
  return (
    positionOrderIndex(gameCode, a.selected_position) <=
    positionOrderIndex(gameCode, b.selected_position)
  );
}

// ── Player pair row ─────────────────────────────────────────────

function PlayerPairRow({
  position,
  left,
  right,
  subdued,
}: {
  position: string;
  left: RosterPlayer | null;
  right: RosterPlayer | null;
  subdued?: boolean;
}) {
  const leftPts = left?.player_points ?? 0;
  const rightPts = right?.player_points ?? 0;
  const leftLeading = leftPts > rightPts;
  const rightLeading = rightPts > leftPts;

  return (
    <div
      className={clsx(
        "grid grid-cols-[minmax(0,1fr)_minmax(60px,auto)_minmax(0,1fr)] items-center gap-3 px-3 py-2 transition-colors",
        subdued && "text-fg-3",
        !subdued && "bg-surface hover:bg-surface-2",
      )}
    >
      <PlayerSide player={left} leading={leftLeading} align="left" subdued={subdued} />
      <div className="flex items-center justify-center font-mono text-[9px] uppercase tracking-wider text-fg-3">
        <span className="rounded-full border border-edge/50 bg-surface-2 px-1.5 py-0.5">
          {position}
        </span>
      </div>
      <PlayerSide player={right} leading={rightLeading} align="right" subdued={subdued} />
    </div>
  );
}

function PlayerSide({
  player,
  leading,
  align,
  subdued,
}: {
  player: RosterPlayer | null;
  leading?: boolean;
  align: "left" | "right";
  subdued?: boolean;
}) {
  if (!player) {
    return <div className="text-right font-mono text-[10px] text-fg-3">—</div>;
  }
  const injured = isInjuryStatus(player.status);
  return (
    <div
      className={clsx(
        "flex min-w-0 items-center gap-2",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      <div
        className={clsx(
          "flex min-w-0 flex-1 flex-col leading-tight",
          align === "right" && "items-end",
        )}
      >
        <div
          className={clsx(
            "flex items-center gap-1.5",
            align === "right" && "flex-row-reverse",
          )}
        >
          <span
            className={clsx(
              "truncate text-[12px] font-medium",
              subdued ? "text-fg-3" : "text-fg-2",
            )}
          >
            {player.name.full}
          </span>
          {injured && (
            <span
              className={clsx(
                "inline-flex items-center gap-1 rounded border px-1 py-[1px] font-mono text-[8px] font-semibold uppercase tracking-wider",
                statusColorClass(player.status),
              )}
              title={player.status_full || player.injury_note || ""}
            >
              <AlertTriangle size={8} />
              {player.status}
            </span>
          )}
        </div>
        <div className="truncate text-[9px] text-fg-3">
          {player.editorial_team_abbr}
          {player.display_position && ` · ${player.display_position}`}
        </div>
      </div>
      <div
        className={clsx(
          "shrink-0 font-mono tabular-nums",
          subdued ? "text-[11px] text-fg-3" : "text-sm font-bold",
          leading && !subdued && "text-up",
        )}
      >
        {(player.player_points ?? 0).toFixed(1)}
      </div>
    </div>
  );
}
