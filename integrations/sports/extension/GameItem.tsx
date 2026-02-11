import { clsx } from 'clsx';
import type { Game, FeedMode } from '~/utils/types';

interface GameItemProps {
  game: Game;
  mode: FeedMode;
}

function formatScore(score: number | string): string {
  return String(score);
}

function statusLabel(game: Game): string {
  if (game.short_detail) return game.short_detail;
  if (game.state === 'final') return 'Final';
  if (game.state === 'pre') return 'Upcoming';
  if (game.state === 'in_progress' || game.state === 'in') return 'Live';
  return '';
}

function isLive(game: Game): boolean {
  return game.state === 'in_progress' || game.state === 'in';
}

export default function GameItem({ game, mode }: GameItemProps) {
  const live = isLive(game);
  const final = game.state === 'final';

  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface text-xs">
        {game.away_team_logo && (
          <img
            src={game.away_team_logo}
            alt=""
            className="w-4 h-4 object-contain"
          />
        )}
        <span className="font-mono font-medium text-fg min-w-[28px]">
          {game.away_team_name.slice(0, 3).toUpperCase()}
        </span>
        <span className="font-mono text-fg tabular-nums">
          {formatScore(game.away_team_score)}
        </span>
        <span className="text-fg-4 font-mono">&ndash;</span>
        <span className="font-mono text-fg tabular-nums">
          {formatScore(game.home_team_score)}
        </span>
        <span className="font-mono font-medium text-fg min-w-[28px]">
          {game.home_team_name.slice(0, 3).toUpperCase()}
        </span>
        {game.home_team_logo && (
          <img
            src={game.home_team_logo}
            alt=""
            className="w-4 h-4 object-contain"
          />
        )}
        <span
          className={clsx(
            'ml-auto text-[9px] font-mono uppercase tracking-wider',
            live && 'text-live font-bold',
            !live && 'text-fg-3',
          )}
        >
          {live && (
            <span className="inline-block w-1 h-1 rounded-full bg-live mr-1 align-middle animate-pulse" />
          )}
          {statusLabel(game)}
        </span>
      </div>
    );
  }

  // Comfort mode
  return (
    <div className={clsx(
      'px-3 py-2 bg-surface border-l-2',
      live ? 'border-l-live/40' : 'border-l-transparent',
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {game.away_team_logo && (
            <img
              src={game.away_team_logo}
              alt=""
              className="w-5 h-5 object-contain"
            />
          )}
          <span className="text-sm text-fg">{game.away_team_name}</span>
        </div>
        <span className="text-sm font-mono font-bold text-fg tabular-nums">
          {formatScore(game.away_team_score)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-0.5">
        <div className="flex items-center gap-2">
          {game.home_team_logo && (
            <img
              src={game.home_team_logo}
              alt=""
              className="w-5 h-5 object-contain"
            />
          )}
          <span className="text-sm text-fg">{game.home_team_name}</span>
        </div>
        <span className="text-sm font-mono font-bold text-fg tabular-nums">
          {formatScore(game.home_team_score)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center justify-end gap-1.5">
        {live && (
          <span className="inline-block w-1 h-1 rounded-full bg-live animate-pulse" />
        )}
        <span
          className={clsx(
            'text-[9px] font-mono uppercase tracking-wider',
            live && 'text-live font-bold',
            final && 'text-fg-3',
            !live && !final && 'text-fg-3',
          )}
        >
          {statusLabel(game)}
        </span>
      </div>
    </div>
  );
}
