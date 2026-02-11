import { useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import type { Game } from '~/utils/types';
import type { FeedTabProps } from '~/integrations/types';
import { useScrollrCDC } from '~/integrations/hooks/useScrollrCDC';
import GameItem from './GameItem';

/** Extract initial games from the dashboard response stored in streamConfig. */
function getInitialGames(config: Record<string, unknown>): Game[] {
  const items = config.__initialItems as Game[] | undefined;
  return items ?? [];
}

import type { IntegrationManifest } from '~/integrations/types';

export const sportsIntegration: IntegrationManifest = {
  id: 'sports',
  name: 'Sports',
  tabLabel: 'Sports',
  tier: 'official',
  FeedTab: SportsFeedTab,
};

export default function SportsFeedTab({ mode, streamConfig }: FeedTabProps) {
  const initialItems = useMemo(() => getInitialGames(streamConfig), [streamConfig]);

  const keyOf = useCallback((g: Game) => String(g.id), []);
  const validate = useCallback(
    (record: Record<string, unknown>) => record.id != null,
    [],
  );

  const { items: games } = useScrollrCDC<Game>({
    table: 'games',
    initialItems,
    keyOf,
    validate,
  });

  return (
    <div
      className={clsx(
        'grid gap-px bg-zinc-800',
        mode === 'compact'
          ? 'grid-cols-1'
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {games.length === 0 && (
        <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
          Waiting for game data...
        </div>
      )}
      {games.map((game) => (
        <GameItem key={String(game.id)} game={game} mode={mode} />
      ))}
    </div>
  );
}
