import { useMemo } from 'react';
import { clsx } from 'clsx';
import type { FeedTabProps, ChannelManifest } from '~/channels/types';
import type { FeedMode } from '~/utils/types';

// ── Types mirroring the Go API's MyLeaguesResponse shape ─────────

interface MatchupTeam {
  team_key: string;
  name: string;
  points: number;
  projected_points: number;
  team_logo: string;
  manager_name: string;
}

interface Matchup {
  week: number;
  status: string;
  teams: MatchupTeam[];
  winner_team_key: string;
  is_playoffs: boolean;
}

interface StandingsEntry {
  team_key: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  points_for: number;
  streak_type: string;
  streak_value: number;
  playoff_seed: number;
  clinched_playoffs: boolean;
  manager_name: string;
  waiver_priority: number;
  team_logo: string;
}

interface RosterPlayer {
  player_key: string;
  name: { full: string; first: string; last: string };
  display_position: string;
  selected_position: string;
  status: string;
  status_full: string;
  injury_note: string;
  player_points: number;
  editorial_team_abbr: string;
  image_url: string;
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
  num_teams: number;
  is_finished: boolean;
  current_week: number;
  scoring_type: string;
}

interface LeagueResponse {
  league_key: string;
  name: string;
  game_code: string;
  season: string;
  team_key: string;
  team_name: string;
  data: LeagueData;
  standings: StandingsEntry[];
  matchups: Matchup[];
  rosters: RosterEntry[];
}

interface MyLeaguesResponse {
  leagues: LeagueResponse[];
}

// ── Helpers ──────────────────────────────────────────────────────

const SPORT_EMOJI: Record<string, string> = {
  nfl: '\u{1F3C8}',
  nba: '\u{1F3C0}',
  nhl: '\u{1F3D2}',
  mlb: '\u26BE',
};

function sportEmoji(gameCode: string): string {
  return SPORT_EMOJI[gameCode] ?? '\u{1F3C6}';
}

/** Injury status badge color: red = out, orange = doubtful, yellow = questionable */
function injuryColor(status: string): string {
  const s = status?.toUpperCase();
  if (s === 'O' || s === 'IR' || s === 'SUSP' || s === 'NA') return 'bg-red-500';
  if (s === 'D' || s === 'DTD' || s === 'DL') return 'bg-orange-400';
  if (s === 'Q' || s === 'P') return 'bg-yellow-400';
  return 'bg-fg-4';
}

function formatRecord(w: number, l: number, t: number): string {
  return t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function streakLabel(type: string, value: number): string {
  if (!type || value === 0) return '';
  const prefix = type === 'win' ? 'W' : type === 'loss' ? 'L' : 'T';
  return `${prefix}${value}`;
}

// ── Extract fantasy data from channelConfig ──────────────────────

function getLeagues(config: Record<string, unknown>): LeagueResponse[] {
  // Fantasy data arrives as MyLeaguesResponse (object with .leagues array)
  // via channelConfig.__initialItems which is dashboard.data.fantasy
  const items = config.__initialItems;
  if (items && typeof items === 'object' && !Array.isArray(items)) {
    const resp = items as MyLeaguesResponse;
    return resp.leagues ?? [];
  }
  // If it's already an array (shouldn't happen, but defensive)
  if (Array.isArray(items)) return items as LeagueResponse[];
  return [];
}

// ── Channel manifest ─────────────────────────────────────────────

export const fantasyChannel: ChannelManifest = {
  id: 'fantasy',
  name: 'Fantasy',
  tabLabel: 'Fantasy',
  tier: 'official',
  FeedTab: FantasyFeedTab,
};

// ── Main FeedTab component ───────────────────────────────────────

export default function FantasyFeedTab({ mode, channelConfig }: FeedTabProps) {
  const leagues = useMemo(() => getLeagues(channelConfig), [channelConfig]);
  const dashboardLoaded = channelConfig.__dashboardLoaded as boolean | undefined;

  if (leagues.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4 bg-surface">
        <span className="text-xs font-mono text-fg-3">
          {dashboardLoaded
            ? 'No fantasy leagues \u2014 connect Yahoo on myscrollr.com'
            : 'Loading fantasy data\u2026'}
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

// ── League card ──────────────────────────────────────────────────

function LeagueCard({ league, mode }: { league: LeagueResponse; mode: FeedMode }) {
  const myTeamKey = league.team_key;
  const currentWeek = league.data?.current_week ?? 0;

  // Find the user's current matchup
  const myMatchup = useMemo(() => {
    return league.matchups?.find(
      (m) =>
        m.week === currentWeek &&
        m.teams?.some((t) => t.team_key === myTeamKey),
    );
  }, [league.matchups, currentWeek, myTeamKey]);

  // Find user's standing
  const myStanding = useMemo(() => {
    return league.standings?.find((s) => s.team_key === myTeamKey);
  }, [league.standings, myTeamKey]);

  // Count injuries across user's roster
  const injuryCount = useMemo(() => {
    const myRoster = league.rosters?.find((r) => r.team_key === myTeamKey);
    if (!myRoster?.data?.players) return 0;
    return myRoster.data.players.filter((p) => p.status && p.status !== '').length;
  }, [league.rosters, myTeamKey]);

  if (mode === 'compact') {
    return <LeagueCardCompact league={league} myMatchup={myMatchup} myStanding={myStanding} injuryCount={injuryCount} />;
  }

  return <LeagueCardComfort league={league} myMatchup={myMatchup} myStanding={myStanding} injuryCount={injuryCount} />;
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
      {/* League header row */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px]">{sportEmoji(league.game_code)}</span>
        <span className="text-[10px] font-mono font-medium text-fg truncate max-w-[140px]">
          {league.name}
        </span>
        {myStanding && (
          <span className="text-[9px] font-mono text-fg-3 ml-auto shrink-0">
            #{myStanding.rank} &middot; {formatRecord(myStanding.wins, myStanding.losses, myStanding.ties)}
          </span>
        )}
      </div>

      {/* Matchup score row */}
      {myMatchup && myMatchup.teams?.length === 2 && (
        <CompactMatchupScore matchup={myMatchup} myTeamKey={myTeamKey} />
      )}

      {/* Injury badge */}
      {injuryCount > 0 && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-400" />
          <span className="text-[9px] font-mono text-fg-3">
            {injuryCount} injur{injuryCount === 1 ? 'y' : 'ies'}
          </span>
        </div>
      )}
    </div>
  );
}

function CompactMatchupScore({
  matchup,
  myTeamKey,
}: {
  matchup: Matchup;
  myTeamKey: string;
}) {
  const myTeam = matchup.teams.find((t) => t.team_key === myTeamKey);
  const oppTeam = matchup.teams.find((t) => t.team_key !== myTeamKey);
  if (!myTeam || !oppTeam) return null;

  const isLive = matchup.status === 'midevent';
  const isFinal = matchup.status === 'postevent';
  const myWinning = myTeam.points > oppTeam.points;

  return (
    <div className="flex items-center gap-2 mt-0.5 text-xs">
      {/* My score */}
      <span
        className={clsx(
          'font-mono font-bold tabular-nums',
          myWinning ? 'text-up' : isFinal && !myWinning ? 'text-down' : 'text-fg',
        )}
      >
        {myTeam.points.toFixed(1)}
      </span>
      <span className="text-fg-4 font-mono">&ndash;</span>
      {/* Opponent score */}
      <span className="font-mono font-medium text-fg tabular-nums">
        {oppTeam.points.toFixed(1)}
      </span>
      {/* Opponent name */}
      <span className="text-[10px] font-mono text-fg-3 truncate max-w-[100px]">
        {oppTeam.name}
      </span>
      {/* Status */}
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
          <span className="text-[9px] font-mono text-fg-4 uppercase">Final</span>
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
      {/* League header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs">{sportEmoji(league.game_code)}</span>
        <span className="text-xs font-mono font-bold text-fg truncate">
          {league.name}
        </span>
        <span className="text-[9px] font-mono text-fg-4 ml-auto shrink-0 uppercase">
          {league.game_code} {league.season}
        </span>
      </div>

      {/* Matchup hero */}
      {myMatchup && myMatchup.teams?.length === 2 ? (
        <ComfortMatchupHero matchup={myMatchup} myTeamKey={myTeamKey} />
      ) : (
        <div className="text-[10px] font-mono text-fg-3 py-1">
          No current matchup
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {myStanding && (
          <>
            <StatPill label="Rank" value={`#${myStanding.rank}`} />
            <StatPill
              label="Record"
              value={formatRecord(myStanding.wins, myStanding.losses, myStanding.ties)}
            />
            {streakLabel(myStanding.streak_type, myStanding.streak_value) && (
              <StatPill
                label="Streak"
                value={streakLabel(myStanding.streak_type, myStanding.streak_value)}
                accent={myStanding.streak_type === 'win'}
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
              {injuryCount} injur{injuryCount === 1 ? 'y' : 'ies'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ComfortMatchupHero({
  matchup,
  myTeamKey,
}: {
  matchup: Matchup;
  myTeamKey: string;
}) {
  const myTeam = matchup.teams.find((t) => t.team_key === myTeamKey);
  const oppTeam = matchup.teams.find((t) => t.team_key !== myTeamKey);
  if (!myTeam || !oppTeam) return null;

  const isLive = matchup.status === 'midevent';
  const isFinal = matchup.status === 'postevent';
  const myWinning = myTeam.points > oppTeam.points;

  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-2 py-1.5 bg-surface-2 border border-edge-2',
        isLive && 'border-live/30',
      )}
    >
      {/* My team */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {myTeam.team_logo && (
          <img src={myTeam.team_logo} alt="" className="w-5 h-5 object-contain shrink-0" />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-mono text-fg truncate">{myTeam.name}</div>
          <div className="text-[9px] font-mono text-fg-4 tabular-nums">
            proj {myTeam.projected_points.toFixed(1)}
          </div>
        </div>
      </div>

      {/* Scores */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={clsx(
            'text-sm font-mono font-bold tabular-nums',
            myWinning ? 'text-up' : isFinal && !myWinning ? 'text-down' : 'text-fg',
          )}
        >
          {myTeam.points.toFixed(1)}
        </span>
        <span className="text-fg-4 text-[10px] font-mono">&ndash;</span>
        <span
          className={clsx(
            'text-sm font-mono font-bold tabular-nums',
            !myWinning && oppTeam.points > myTeam.points
              ? isFinal ? 'text-up' : 'text-fg'
              : 'text-fg',
          )}
        >
          {oppTeam.points.toFixed(1)}
        </span>
      </div>

      {/* Opponent */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
        <div className="min-w-0 text-right">
          <div className="text-[10px] font-mono text-fg truncate">{oppTeam.name}</div>
          <div className="text-[9px] font-mono text-fg-4 tabular-nums">
            proj {oppTeam.projected_points.toFixed(1)}
          </div>
        </div>
        {oppTeam.team_logo && (
          <img src={oppTeam.team_logo} alt="" className="w-5 h-5 object-contain shrink-0" />
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0 ml-1">
        {isLive && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
            <span className="text-[9px] font-mono text-live font-bold uppercase">Live</span>
          </span>
        )}
        {isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">Final</span>
        )}
        {!isLive && !isFinal && (
          <span className="text-[9px] font-mono text-fg-4 uppercase">Wk{matchup.week}</span>
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
          'text-[10px] font-mono font-medium tabular-nums',
          accent ? 'text-up' : 'text-fg-2',
        )}
      >
        {value}
      </span>
    </div>
  );
}
