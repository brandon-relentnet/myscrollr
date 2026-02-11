import { useMemo, useCallback } from 'react';
import { clsx } from 'clsx';
import type { Trade } from '~/utils/types';
import type { FeedTabProps } from '~/integrations/types';
import { useScrollrCDC } from '~/integrations/hooks/useScrollrCDC';
import TradeItem from './TradeItem';

/** Extract initial trades from the dashboard response stored in streamConfig. */
function getInitialTrades(config: Record<string, unknown>): Trade[] {
  const items = config.__initialItems as Trade[] | undefined;
  return items ?? [];
}

import type { IntegrationManifest } from '~/integrations/types';

export const financeIntegration: IntegrationManifest = {
  id: 'finance',
  name: 'Finance',
  tabLabel: 'Finance',
  tier: 'official',
  FeedTab: FinanceFeedTab,
};

export default function FinanceFeedTab({ mode, streamConfig }: FeedTabProps) {
  const initialItems = useMemo(() => getInitialTrades(streamConfig), [streamConfig]);

  const keyOf = useCallback((t: Trade) => t.symbol, []);
  const validate = useCallback(
    (record: Record<string, unknown>) => typeof record.symbol === 'string',
    [],
  );

  const { items: trades } = useScrollrCDC<Trade>({
    table: 'trades',
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
          : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      )}
    >
      {trades.length === 0 && (
        <div className="col-span-full text-center py-8 text-zinc-500 text-sm">
          Waiting for trade data...
        </div>
      )}
      {trades.map((trade) => (
        <TradeItem key={trade.symbol} trade={trade} mode={mode} />
      ))}
    </div>
  );
}
