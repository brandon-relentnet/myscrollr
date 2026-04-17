/**
 * RosterView — detailed view of any team's roster in the league.
 *
 * Defaults to the user's team but lets them swap to any opponent. Groups
 * players by selected position, flags injured players, and shows live
 * vs projected points per player.
 */
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { motion } from "motion/react";
import {
  isBenchPosition,
  isInjuryStatus,
  positionOrderIndex,
  statusColorClass,
  userRoster,
} from "./types";
import type { LeagueResponse, RosterEntry, RosterPlayer } from "./types";

interface RosterViewProps {
  league: LeagueResponse | null;
}

export function RosterView({ league }: RosterViewProps) {
  const userRosterEntry = useMemo(
    () => (league ? userRoster(league) : null),
    [league],
  );
  const [teamKey, setTeamKey] = useState<string | null>(
    userRosterEntry?.team_key ?? null,
  );

  const activeRoster = useMemo(() => {
    if (!league?.rosters) return null;
    if (teamKey) {
      const match = league.rosters.find((r) => r.team_key === teamKey);
      if (match) return match;
    }
    return userRosterEntry ?? league.rosters[0] ?? null;
  }, [league, teamKey, userRosterEntry]);

  if (!league || !league.rosters || league.rosters.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-[12px] text-fg-3">
        Rosters aren&rsquo;t available for this league yet.
      </div>
    );
  }

  const isMe = activeRoster?.team_key === league.team_key;
  const starters = activeRoster
    ? activeRoster.data.players.filter((p) => !isBenchPosition(p.selected_position))
    : [];
  const bench = activeRoster
    ? activeRoster.data.players.filter((p) => isBenchPosition(p.selected_position))
    : [];

  const groupedStarters = groupByDisplay(starters, league.game_code);
  const totalPoints = starters.reduce((sum, p) => sum + (p.player_points ?? 0), 0);
  const injuries = activeRoster?.data.players.filter((p) => isInjuryStatus(p.status)) ?? [];

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Team selector + quick stats */}
      <div className="flex items-center gap-3">
        <TeamSelector
          league={league}
          value={activeRoster?.team_key ?? null}
          onChange={setTeamKey}
        />
        <div className="ml-auto flex items-center gap-3 text-[11px] text-fg-3">
          <span>
            <span className="font-bold text-fg">{starters.length}</span> starters
          </span>
          <span>·</span>
          <span>
            <span className="font-bold text-fg">{totalPoints.toFixed(1)}</span>{" "}
            pts
          </span>
          {injuries.length > 0 && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 text-warn">
                <AlertTriangle size={11} />
                {injuries.length} injured
              </span>
            </>
          )}
        </div>
      </div>

      {/* Injury spotlight */}
      {injuries.length > 0 && isMe && (
        <div className="rounded-lg border border-warn/30 bg-warn/[0.06] p-3">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warn">
            <AlertTriangle size={12} />
            Injury watch
          </div>
          <div className="space-y-1.5">
            {injuries.map((p) => (
              <div
                key={p.player_key}
                className="flex items-center gap-2 text-[11px]"
              >
                <span
                  className={clsx(
                    "inline-flex shrink-0 items-center rounded border px-1.5 py-[1px] font-mono text-[9px] font-semibold uppercase tracking-wider",
                    statusColorClass(p.status),
                  )}
                >
                  {p.status}
                </span>
                <span className="font-medium text-fg">{p.name.full}</span>
                <span className="text-fg-3">({p.display_position})</span>
                {p.injury_note && (
                  <span className="truncate text-[10px] italic text-fg-3">
                    — {p.injury_note}
                  </span>
                )}
                <span
                  className={clsx(
                    "ml-auto font-mono text-[11px] font-bold uppercase",
                    isBenchPosition(p.selected_position)
                      ? "text-fg-3"
                      : "text-warn",
                  )}
                >
                  {isBenchPosition(p.selected_position) ? p.selected_position : "STARTING"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Starters grouped by position */}
      <section className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-wider text-fg-3">
          Starters
        </div>
        <div className="overflow-hidden rounded-lg border border-edge/40">
          {groupedStarters.map(([position, players], gi) => (
            <div key={position}>
              <div
                className={clsx(
                  "flex items-center gap-2 bg-surface-2/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-fg-3",
                  gi > 0 && "border-t border-edge/40",
                )}
              >
                <span className="rounded bg-surface-3 px-1.5 py-[1px] text-fg-2">
                  {position}
                </span>
                <span>
                  {players.length} player{players.length === 1 ? "" : "s"}
                </span>
              </div>
              {players.map((p, i) => (
                <motion.div
                  key={p.player_key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                >
                  <PlayerRow player={p} />
                </motion.div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* Bench */}
      {bench.length > 0 && (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-wider text-fg-3">
            Bench &amp; IR
          </div>
          <div className="overflow-hidden rounded-lg border border-edge/30 bg-surface-2/40">
            {bench.map((p) => (
              <PlayerRow key={p.player_key} player={p} subdued />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Team selector ────────────────────────────────────────────────

function TeamSelector({
  league,
  value,
  onChange,
}: {
  league: LeagueResponse;
  value: string | null;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rosters = league.rosters ?? [];
  const current = rosters.find((r) => r.team_key === value) ?? rosters[0];
  const isMe = current?.team_key === league.team_key;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-md border border-edge/50 bg-surface px-2.5 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-accent/40 cursor-pointer"
      >
        <span>{current?.data.team_name ?? "Team"}</span>
        {isMe && (
          <span className="rounded bg-accent/20 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-accent">
            You
          </span>
        )}
        <ChevronDown size={12} className={clsx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-64 overflow-y-auto rounded-lg border border-edge/50 bg-surface-2 py-1 shadow-lg">
          {rosters.map((r) => (
            <button
              key={r.team_key}
              type="button"
              onClick={() => {
                onChange(r.team_key);
                setOpen(false);
              }}
              className={clsx(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors cursor-pointer hover:bg-surface-3",
                r.team_key === value && "bg-accent/10",
              )}
            >
              <span className="truncate">{r.data.team_name}</span>
              {r.team_key === league.team_key && (
                <span className="ml-auto rounded bg-accent/20 px-1 py-[1px] font-mono text-[8px] uppercase tracking-wider text-accent">
                  You
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Player row ──────────────────────────────────────────────────

function PlayerRow({ player, subdued }: { player: RosterPlayer; subdued?: boolean }) {
  const injured = isInjuryStatus(player.status);
  const pts = player.player_points ?? 0;
  return (
    <div
      className={clsx(
        "flex items-center gap-3 px-3 py-2 transition-colors",
        subdued ? "text-fg-3 hover:bg-surface-2" : "hover:bg-surface-2",
      )}
    >
      {player.image_url ? (
        <img
          src={player.image_url}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="h-8 w-8 shrink-0 rounded-full bg-surface-3" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={clsx(
              "truncate text-[12px] font-medium",
              subdued ? "text-fg-3" : "text-fg",
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
        <div className="truncate text-[10px] text-fg-3">
          {player.editorial_team_abbr}
          {player.display_position && ` · ${player.display_position}`}
          {player.selected_position && !subdued && ` · slot ${player.selected_position}`}
        </div>
      </div>
      <div
        className={clsx(
          "shrink-0 font-mono tabular-nums",
          subdued
            ? "text-[11px] text-fg-3"
            : pts > 0
              ? "text-sm font-bold text-fg"
              : "text-[11px] text-fg-3",
        )}
      >
        {pts.toFixed(1)}
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function groupByDisplay(
  players: RosterPlayer[],
  gameCode: string,
): [string, RosterPlayer[]][] {
  const groups = new Map<string, RosterPlayer[]>();
  for (const p of players) {
    const key = p.selected_position || "FLEX";
    const bucket = groups.get(key) ?? [];
    bucket.push(p);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    return positionOrderIndex(gameCode, a) - positionOrderIndex(gameCode, b);
  });
}
