import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Ghost,
  Link2,
  Loader2,
  Plus,
  Shield,
  Unlink,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import {
  Section,
  DisplayRow,
  ActionRow,
  SegmentedRow,
} from "../components/settings/SettingsControls";
import { authenticatedFetch, API_BASE } from "../api/client";
import type { Channel } from "../api/client";

// ── Data Types ───────────────────────────────────────────────────

interface StandingsEntry {
  team_key: string;
  team_id: number;
  name: string;
  url: string;
  team_logo: string;
  manager_name: string;
  rank: number | null;
  wins: number;
  losses: number;
  ties: number;
  percentage: string;
  games_back: string;
  points_for: string;
  points_against: string;
  streak_type: string;
  streak_value: number;
  playoff_seed: number | null;
  clinched_playoffs: boolean;
  waiver_priority: number | null;
}

interface MatchupTeam {
  team_key: string;
  team_id: number;
  name: string;
  team_logo: string;
  manager_name: string;
  points: number | null;
  projected_points: number | null;
}

interface Matchup {
  week: number;
  week_start: string;
  week_end: string;
  status: string;
  is_playoffs: boolean;
  is_consolation: boolean;
  is_tied: boolean;
  winner_team_key: string | null;
  teams: MatchupTeam[];
}

interface RosterPlayer {
  player_key: string;
  player_id: number;
  name: { full: string; first: string; last: string };
  editorial_team_abbr: string;
  display_position: string;
  selected_position: string;
  image_url: string;
  status: string | null;
  status_full: string | null;
  injury_note: string | null;
  player_points: number | null;
}

interface RosterEntry {
  team_key: string;
  data: {
    team_key: string;
    team_name: string;
    players: RosterPlayer[];
  };
}

interface LeagueData {
  league_key: string;
  name: string;
  game_code: string;
  season: string;
  team_key: string | null;
  team_name: string | null;
  data: {
    num_teams: number;
    is_finished: boolean;
    current_week: number | null;
    scoring_type: string;
    [k: string]: unknown;
  };
  standings: StandingsEntry[] | null;
  matchups: Matchup[] | null;
  rosters: RosterEntry[] | null;
}

interface MyLeaguesResponse {
  leagues: LeagueData[];
}

interface DiscoveredLeague {
  league_key: string;
  name: string;
  game_code: string;
  season: number;
  num_teams: number;
  is_finished: boolean;
  logo_url?: string;
  url?: string;
}

type Phase =
  | "disconnected"
  | "discovering"
  | "picking"
  | "importing"
  | "connected";

type ImportStatus = "pending" | "importing" | "done" | "error";

// ── Constants ────────────────────────────────────────────────────

const GAME_CODE_LABELS: Record<string, string> = {
  nfl: "Football",
  nba: "Basketball",
  nhl: "Hockey",
  mlb: "Baseball",
};

const GAME_CODE_EMOJI: Record<string, string> = {
  nfl: "\uD83C\uDFC8",
  nba: "\uD83C\uDFC0",
  nhl: "\uD83C\uDFD2",
  mlb: "\u26BE",
};

const INJURY_COLORS: Record<string, string> = {
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

const LEAGUES_PER_PAGE = 5;

// ── Props ────────────────────────────────────────────────────────

interface FantasyConfigPanelProps {
  channel: Channel;
  getToken: () => Promise<string | null>;
  subscriptionTier: string;
  connected: boolean;
  hex: string;
}

// ── Main Component ───────────────────────────────────────────────

export default function FantasyConfigPanel({
  channel: _channel,
  getToken,
  subscriptionTier,
  connected,
  hex,
}: FantasyConfigPanelProps) {
  const isUnlimited = subscriptionTier === "uplink_unlimited";
  const isUplink = subscriptionTier === "uplink" || isUnlimited;

  const [leagues, setLeagues] = useState<LeagueData[]>([]);
  const [yahooConnected, setYahooConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>("disconnected");
  const [discoveredLeagues, setDiscoveredLeagues] = useState<
    DiscoveredLeague[]
  >([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [importStatuses, setImportStatuses] = useState<
    Record<string, ImportStatus>
  >({});
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "finished">("active");
  const [leagueVisibleCount, setLeagueVisibleCount] =
    useState(LEAGUES_PER_PAGE);

  const initialLoadDone = useRef(false);

  // ── Fetch existing Yahoo data ──────────────────────────────────

  const fetchYahooData = useCallback(async () => {
    try {
      const [statusData, leaguesData] = await Promise.all([
        authenticatedFetch<{ connected: boolean; synced: boolean }>(
          "/users/me/yahoo-status",
          {},
          getToken,
        ).catch(() => null),
        authenticatedFetch<MyLeaguesResponse>(
          "/users/me/yahoo-leagues",
          {},
          getToken,
        ).catch(() => null),
      ]);

      const isConn = statusData?.connected ?? false;
      setYahooConnected(isConn);
      setLeagues(leaguesData?.leagues ?? []);

      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        if (isConn && (leaguesData?.leagues?.length ?? 0) > 0) {
          setPhase("connected");
        } else if (isConn) {
          setPhase("connected");
        } else {
          setPhase("disconnected");
        }
      }
    } catch (err) {
      console.error("[Fantasy] fetchYahooData error:", err);
      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        setPhase("disconnected");
      }
    }
  }, [getToken]);

  useEffect(() => {
    fetchYahooData();
  }, [fetchYahooData]);

  // ── League discovery ───────────────────────────────────────────

  const startDiscovery = useCallback(async () => {
    setPhase("discovering");
    setDiscoverError(null);
    setDiscoveredLeagues([]);

    try {
      const result = await authenticatedFetch<{
        leagues: DiscoveredLeague[];
        error?: string;
      }>("/users/me/yahoo-leagues/discover", { method: "POST" }, getToken);

      if (result.error) {
        setDiscoverError(result.error);
        setPhase(leagues.length > 0 ? "connected" : "disconnected");
        return;
      }

      const discovered = result.leagues || [];
      setDiscoveredLeagues(discovered);

      const alreadyImported = new Set(leagues.map((l) => l.league_key));
      const newLeagues = discovered.filter(
        (l) => !alreadyImported.has(l.league_key),
      );

      if (newLeagues.length === 0) {
        setPhase("connected");
        return;
      }

      const preSelected = new Set(
        newLeagues.filter((l) => !l.is_finished).map((l) => l.league_key),
      );
      setSelectedKeys(preSelected);
      setPhase("picking");
    } catch (err: unknown) {
      console.error("[Fantasy] discover failed:", err);
      setDiscoverError(
        err instanceof Error ? err.message : "Discovery failed",
      );
      setPhase(leagues.length > 0 ? "connected" : "disconnected");
    }
  }, [getToken, leagues]);

  // ── Import selected leagues ────────────────────────────────────

  const importSelected = useCallback(async () => {
    const keys = Array.from(selectedKeys);
    if (keys.length === 0) return;

    setPhase("importing");

    const statuses: Record<string, ImportStatus> = {};
    for (const key of keys) statuses[key] = "pending";
    setImportStatuses({ ...statuses });

    for (const key of keys) {
      const league = discoveredLeagues.find((l) => l.league_key === key);
      if (!league) continue;

      statuses[key] = "importing";
      setImportStatuses({ ...statuses });

      try {
        const result = await authenticatedFetch<{
          status: string;
          error?: string;
        }>(
          "/users/me/yahoo-leagues/import",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              league_key: league.league_key,
              game_code: league.game_code,
              season: league.season,
            }),
          },
          getToken,
        );
        statuses[key] = result.error ? "error" : "done";
      } catch {
        statuses[key] = "error";
      }
      setImportStatuses({ ...statuses });
    }

    await fetchYahooData();
    setPhase("connected");
  }, [selectedKeys, discoveredLeagues, getToken, fetchYahooData]);

  // ── Listen for Yahoo auth popup completion ─────────────────────

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "yahoo-auth-complete") {
        setYahooConnected(true);
        startDiscovery();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [startDiscovery]);

  // ── Yahoo connect / disconnect ─────────────────────────────────

  const handleYahooConnect = useCallback(async () => {
    const token = await getToken();
    if (!token) return;

    let sub: string | undefined;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      sub = payload.sub;
    } catch {
      /* ignore */
    }
    if (!sub) return;

    const popupUrl = `${API_BASE}/yahoo/start?logto_sub=${sub}`;
    window.open(popupUrl, "yahoo-auth", "width=600,height=700");
  }, [getToken]);

  const handleYahooDisconnect = useCallback(async () => {
    try {
      await authenticatedFetch(
        "/users/me/yahoo",
        { method: "DELETE" },
        getToken,
      );
      setYahooConnected(false);
      setLeagues([]);
      setPhase("disconnected");
      initialLoadDone.current = false;
    } catch (err) {
      console.error("[Fantasy] disconnect failed:", err);
    }
  }, [getToken]);

  // ── Derived data ───────────────────────────────────────────────

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

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter as "active" | "finished");
    setLeagueVisibleCount(LEAGUES_PER_PAGE);
  };

  // ── Picking helpers ────────────────────────────────────────────

  const alreadyImported = new Set(leagues.map((l) => l.league_key));
  const pickableLeagues = discoveredLeagues.filter(
    (l) => !alreadyImported.has(l.league_key),
  );
  const pickableActive = pickableLeagues.filter((l) => !l.is_finished);
  const pickableFinished = pickableLeagues.filter((l) => l.is_finished);

  const toggleLeague = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const selectAll = () =>
    setSelectedKeys(new Set(pickableLeagues.map((l) => l.league_key)));
  const deselectAll = () => setSelectedKeys(new Set());

  const totalLeagues = leagues.length;
  const totalActiveMatchups = activeLeagues.reduce(
    (n, l) => n + (l.matchups?.length ?? 0),
    0,
  );

  const delivery = isUnlimited
    ? "Real-time SSE"
    : isUplink
      ? "Poll 30s"
      : "Poll 60s";

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{
            background: `${hex}15`,
            boxShadow: `0 0 15px ${hex}15, 0 0 0 1px ${hex}20`,
          }}
        >
          <Ghost size={16} style={{ color: hex }} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">Fantasy</h2>
          <p className="text-[11px] text-fg-4">Yahoo Fantasy Sports</p>
        </div>
      </div>

      {/* ── DISCONNECTED ──────────────────────────────────────── */}
      {phase === "disconnected" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-10 space-y-4 px-3"
        >
          <Ghost size={40} className="mx-auto text-fg-4/30" />
          <div className="space-y-2">
            <p className="text-sm font-bold text-fg-2">No Fantasy Data</p>
            <p className="text-[12px] text-fg-3 max-w-xs mx-auto">
              Connect your Yahoo account to see your fantasy leagues, matchup
              scores, standings, and rosters.
            </p>
          </div>
          {discoverError && (
            <p className="text-[12px] text-error max-w-xs mx-auto">
              {discoverError}
            </p>
          )}
          <button
            onClick={handleYahooConnect}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-colors cursor-pointer"
            style={{ background: hex }}
          >
            <Link2 size={14} />
            Connect Yahoo Account
          </button>
        </motion.div>
      )}

      {/* ── DISCOVERING ───────────────────────────────────────── */}
      {phase === "discovering" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-10 space-y-4 px-3"
        >
          <div className="flex items-center justify-center gap-1.5 h-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 rounded-full origin-center"
                style={{ height: 8, background: hex }}
                animate={{
                  scaleY: [1, 3, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.12,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <div className="space-y-2">
            <p
              className="text-sm font-bold"
              style={{ color: `${hex}B3` }}
            >
              Discovering Leagues
            </p>
            <p className="text-[12px] text-fg-3 max-w-xs mx-auto">
              Scanning your Yahoo Fantasy account for leagues across all
              sports.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── PICKING ───────────────────────────────────────────── */}
      {phase === "picking" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Section title={`Select Leagues (${pickableLeagues.length} found)`}>
            <div className="px-3 space-y-3">
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={selectAll}
                  className="text-[11px] text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-fg-4">|</span>
                <button
                  onClick={deselectAll}
                  className="text-[11px] text-fg-3 hover:text-fg-2 transition-colors cursor-pointer"
                >
                  Deselect All
                </button>
              </div>

              {pickableActive.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-success/80 flex items-center gap-1.5 mb-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                    Active Leagues
                  </p>
                  {pickableActive.map((league) => (
                    <LeaguePickerRow
                      key={league.league_key}
                      league={league}
                      selected={selectedKeys.has(league.league_key)}
                      onToggle={() => toggleLeague(league.league_key)}
                      hex={hex}
                    />
                  ))}
                </div>
              )}

              {pickableFinished.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-fg-4 mb-1.5">
                    Past Leagues
                  </p>
                  {pickableFinished.map((league) => (
                    <LeaguePickerRow
                      key={league.league_key}
                      league={league}
                      selected={selectedKeys.has(league.league_key)}
                      onToggle={() => toggleLeague(league.league_key)}
                      hex={hex}
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={importSelected}
                  disabled={selectedKeys.size === 0}
                  className="flex-1 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-colors disabled:opacity-30 cursor-pointer"
                  style={{
                    background:
                      selectedKeys.size > 0 ? hex : "var(--color-base-300)",
                  }}
                >
                  Import Selected ({selectedKeys.size})
                </button>
                <button
                  onClick={() =>
                    setPhase(
                      leagues.length > 0 ? "connected" : "disconnected",
                    )
                  }
                  className="px-4 py-2 rounded-lg text-[12px] font-medium text-fg-3 hover:text-fg-2 hover:bg-base-250/50 transition-colors cursor-pointer"
                >
                  Skip
                </button>
              </div>
            </div>
          </Section>
        </motion.div>
      )}

      {/* ── IMPORTING ─────────────────────────────────────────── */}
      {phase === "importing" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Section title="Importing Leagues">
            <div className="px-3 space-y-1.5">
              {Array.from(selectedKeys).map((key) => {
                const league = discoveredLeagues.find(
                  (l) => l.league_key === key,
                );
                const status = importStatuses[key] || "pending";
                const sportLabel =
                  GAME_CODE_LABELS[league?.game_code || ""] ||
                  league?.game_code ||
                  "Fantasy";

                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-edge/20 bg-base-250/30"
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      {status === "done" && (
                        <Check size={14} className="text-success" />
                      )}
                      {status === "importing" && (
                        <Loader2
                          size={14}
                          className="animate-spin"
                          style={{ color: hex }}
                        />
                      )}
                      {status === "pending" && (
                        <span className="h-2 w-2 rounded-full bg-fg-4/30" />
                      )}
                      {status === "error" && (
                        <span className="text-error text-[12px] font-bold">
                          !
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-bold text-fg-2 truncate">
                        {league?.name || key}
                      </p>
                      <p className="text-[11px] text-fg-4">
                        {sportLabel} &middot; {league?.season}
                      </p>
                    </div>
                    <span
                      className="text-[10px] font-mono"
                      style={{
                        color:
                          status === "done"
                            ? "var(--color-success)"
                            : status === "importing"
                              ? hex
                              : status === "error"
                                ? "var(--color-error)"
                                : "var(--color-fg-4)",
                      }}
                    >
                      {status}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </Section>
        </motion.div>
      )}

      {/* ── CONNECTED — Status ────────────────────────────────── */}
      {phase === "connected" && leagues.length > 0 && (
        <Section title="Status">
          <DisplayRow label="Leagues" value={String(totalLeagues)} />
          <DisplayRow
            label="Active Matchups"
            value={String(totalActiveMatchups)}
          />
          <DisplayRow label="Delivery" value={delivery} />
          <DisplayRow
            label="Connection"
            value={
              isUnlimited ? (connected ? "Live" : "Offline") : "Polling"
            }
          />
        </Section>
      )}

      {/* ── CONNECTED — Filter toggle ─────────────────────────── */}
      {phase === "connected" && leagues.length > 0 && (
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
                  <LeagueCard league={league} hex={hex} />
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Empty filter state */}
            {filteredLeagues.length === 0 && (
              <p className="text-center text-[11px] text-fg-4 py-6">
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
                className="w-full p-3 rounded-lg bg-base-250/30 border border-edge/20 text-fg-3 hover:text-fg-2 hover:border-edge/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
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

      {/* Connected but no leagues at all */}
      {phase === "connected" && yahooConnected && leagues.length === 0 && (
        <div className="text-center py-8 space-y-3 px-3">
          <p className="text-[12px] text-fg-3">
            Yahoo account connected — no leagues imported yet
          </p>
          <button
            onClick={startDiscovery}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-medium text-white transition-colors cursor-pointer"
            style={{ background: hex }}
          >
            <Plus size={14} />
            Import Leagues
          </button>
        </div>
      )}

      {/* ── Account actions ───────────────────────────────────── */}
      {phase === "connected" && yahooConnected && (
        <Section title="Account">
          <ActionRow
            label="Add more leagues"
            description="Discover and import new Yahoo Fantasy leagues"
            action="Discover"
            onClick={startDiscovery}
          />
          <ActionRow
            label="Disconnect Yahoo"
            description="Remove your Yahoo account connection"
            action="Disconnect"
            actionClass="bg-error/10 text-error hover:bg-error/20"
            onClick={handleYahooDisconnect}
          />
        </Section>
      )}
    </div>
  );
}

// ── League Picker Row ────────────────────────────────────────────

function LeaguePickerRow({
  league,
  selected,
  onToggle,
  hex,
}: {
  league: DiscoveredLeague;
  selected: boolean;
  onToggle: () => void;
  hex: string;
}) {
  const sportLabel =
    GAME_CODE_LABELS[league.game_code] || league.game_code || "Fantasy";

  return (
    <button
      onClick={onToggle}
      className={clsx(
        "w-full flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left cursor-pointer",
        selected
          ? "bg-base-250/40 border-edge/30"
          : "bg-base-250/15 border-edge/15 opacity-60",
      )}
      style={
        selected ? { borderColor: `${hex}30`, background: `${hex}08` } : {}
      }
    >
      <div
        className="h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all"
        style={
          selected
            ? { background: hex, borderColor: hex }
            : { borderColor: "var(--color-fg-4)" }
        }
      >
        {selected && <Check size={10} className="text-white" />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-fg-2 truncate">
          {league.name}
        </p>
        <p className="text-[11px] text-fg-4">
          {sportLabel} &middot; {league.num_teams} Teams &middot;{" "}
          {league.season}
        </p>
      </div>

      {!league.is_finished ? (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-success/10 border border-success/20">
          <span className="h-1 w-1 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] font-bold text-success">Active</span>
        </span>
      ) : (
        <span className="text-[10px] font-mono text-fg-4">
          {league.season}
        </span>
      )}
    </button>
  );
}

// ── League Card ──────────────────────────────────────────────────

function LeagueCard({
  league,
  hex,
}: {
  league: LeagueData;
  hex: string;
}) {
  const [openSection, setOpenSection] = useState<
    "matchups" | "standings" | "roster" | null
  >(null);

  const isActive = !league.data?.is_finished;
  const sportLabel =
    GAME_CODE_LABELS[league.game_code] || league.game_code || "Fantasy";
  const sportEmoji = GAME_CODE_EMOJI[league.game_code] || "";
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
          ? "bg-base-250/30 border-edge/25"
          : "bg-base-250/15 border-edge/15",
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
                      background: `${hex}15`,
                      boxShadow: `0 0 0 1px ${hex}20`,
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
              <p className="text-[11px] text-fg-4">
                {sportLabel} &middot; {numTeams} Teams
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
            <span className="text-[10px] font-mono text-fg-4">
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
        <div className="h-px bg-edge/20 mb-2" />
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
            <div className="h-px bg-edge/20 mb-2" />
            <p className="text-[11px] text-fg-4 text-center">
              Data not yet available — syncing soon
            </p>
          </div>
        )}
    </div>
  );
}

// ── Section Toggle ───────────────────────────────────────────────

function SectionToggle({
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

function ExpandableSection({ children }: { children: React.ReactNode }) {
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

function MatchupScoreCard({
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
  const isLive = matchup.status === "midevent";
  const isDone = matchup.status === "postevent";

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        background: `${hex}08`,
        borderColor: `${hex}15`,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-fg-4">
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
              alt=""
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
              isWinning ? "" : isLosing ? "text-fg-4" : "text-fg-2",
            )}
            style={isWinning ? { color: hex } : undefined}
          >
            {userPoints.toFixed(1)}
          </span>
          <span className="text-[10px] text-fg-4 font-bold">-</span>
          <span
            className={clsx(
              "text-base font-bold font-mono tabular-nums",
              isLosing ? "text-error" : isWinning ? "text-fg-4" : "text-fg-2",
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
              alt=""
              className="h-7 w-7 rounded object-cover shrink-0"
            />
          )}
        </div>
      </div>

      {(userTeam.projected_points || opponentTeam.projected_points) &&
        !isDone && (
          <div className="flex justify-between mt-1.5 text-[10px] text-fg-4 font-mono">
            <span>
              Proj: {userTeam.projected_points?.toFixed(1) ?? "---"}
            </span>
            <span>
              Proj: {opponentTeam.projected_points?.toFixed(1) ?? "---"}
            </span>
          </div>
        )}
    </div>
  );
}

// ── Matchups Section ─────────────────────────────────────────────

function MatchupsSection({
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
                ? "border-edge/25"
                : "border-edge/15 bg-base-250/15",
            )}
            style={
              isUserMatchup
                ? {
                    borderColor: `${hex}25`,
                    background: `${hex}06`,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {teamA.team_logo && (
                <img
                  src={teamA.team_logo}
                  alt=""
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
              <span className="text-[10px] text-fg-4">vs</span>
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
                  alt=""
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

function StandingsSection({
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
              isUser ? "border-edge/25" : "border-edge/15 bg-base-250/15",
            )}
            style={
              isUser
                ? { borderColor: `${hex}25`, background: `${hex}06` }
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
                  alt=""
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
                  <span className="text-[10px] text-fg-4 block truncate max-w-[120px]">
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
              <span className="text-[11px] font-mono text-fg-4 tabular-nums w-16 text-right">
                {team.points_for} PF
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Roster Section ───────────────────────────────────────────────

function RosterSection({
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
                {r.data?.team_name || r.team_key}
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
                <span className="text-[10px] font-mono text-fg-4 w-6 text-center shrink-0">
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
                          background: `${injuryColor}15`,
                        }}
                      >
                        {player.status}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-fg-4">
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
          <p className="text-[11px] text-fg-4 text-center py-3">
            No roster data available
          </p>
        )}
      </div>
    </div>
  );
}
