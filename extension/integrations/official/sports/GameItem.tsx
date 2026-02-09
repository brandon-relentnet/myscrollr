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
      <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 text-xs">
        {game.away_team_logo && (
          <img
            src={game.away_team_logo}
            alt=""
            className="w-4 h-4 object-contain"
          />
        )}
        <span className="font-medium text-zinc-200 min-w-[28px]">
          {game.away_team_name.slice(0, 3).toUpperCase()}
        </span>
        <span className="text-zinc-300">
          {formatScore(game.away_team_score)}
        </span>
        <span className="text-zinc-600">-</span>
        <span className="text-zinc-300">
          {formatScore(game.home_team_score)}
        </span>
        <span className="font-medium text-zinc-200 min-w-[28px]">
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
            'ml-auto text-[10px] uppercase tracking-wide',
            live && 'text-red-400 font-semibold',
            final && 'text-zinc-500',
            !live && !final && 'text-zinc-500',
          )}
        >
          {statusLabel(game)}
        </span>
      </div>
    );
  }

  // Comfort mode
  return (
    <div className="px-3 py-2 bg-zinc-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {game.away_team_logo && (
            <img
              src={game.away_team_logo}
              alt=""
              className="w-5 h-5 object-contain"
            />
          )}
          <span className="text-sm text-zinc-200">{game.away_team_name}</span>
        </div>
        <span className="text-sm font-semibold text-zinc-100 tabular-nums">
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
          <span className="text-sm text-zinc-200">{game.home_team_name}</span>
        </div>
        <span className="text-sm font-semibold text-zinc-100 tabular-nums">
          {formatScore(game.home_team_score)}
        </span>
      </div>

      <div className="mt-1 text-right">
        <span
          className={clsx(
            'text-[10px] uppercase tracking-wide',
            live && 'text-red-400 font-semibold',
            final && 'text-zinc-500',
            !live && !final && 'text-zinc-500',
          )}
        >
          {statusLabel(game)}
        </span>
      </div>
    </div>
  );
}
