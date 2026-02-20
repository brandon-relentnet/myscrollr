import { clsx } from 'clsx';
import type { ConnectionStatus, DeliveryMode } from '~/utils/types';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  deliveryMode: DeliveryMode;
}

const SSE_STATUS_CONFIG = {
  connected: { dot: 'bg-accent', label: 'LIVE', labelClass: 'text-accent/70' },
  reconnecting: { dot: 'bg-warn animate-pulse', label: 'SYNC', labelClass: 'text-warn/70' },
  disconnected: { dot: 'bg-down/60', label: 'OFF', labelClass: 'text-fg-3' },
} as const;

const POLL_CONFIG = {
  dot: 'bg-info/70',
  label: 'POLL',
  labelClass: 'text-info/60',
} as const;

export default function ConnectionIndicator({
  status,
  deliveryMode,
}: ConnectionIndicatorProps) {
  // In polling mode, show a static "POLL" indicator instead of SSE status
  const config = deliveryMode === 'polling' ? POLL_CONFIG : SSE_STATUS_CONFIG[status];

  const isLive = deliveryMode !== 'polling' && status === 'connected';

  return (
    <div className="flex items-center gap-1.5" title={deliveryMode === 'polling' ? 'Polling every 30s' : `Status: ${status}`}>
      <div
        className={clsx('w-1.5 h-1.5 rounded-full', config.dot)}
        style={
          isLive
            ? { boxShadow: '0 0 5px rgba(52, 211, 153, 0.5), 0 0 12px rgba(52, 211, 153, 0.2)' }
            : undefined
        }
      />
      <span className={clsx('text-[9px] font-mono uppercase tracking-widest', config.labelClass)}>
        {config.label}
      </span>
    </div>
  );
}
