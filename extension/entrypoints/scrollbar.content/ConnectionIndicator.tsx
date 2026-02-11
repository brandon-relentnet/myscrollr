import { clsx } from 'clsx';
import type { ConnectionStatus } from '~/utils/types';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
}

const STATUS_CONFIG = {
  connected: { dot: 'bg-accent', label: 'LIVE', labelClass: 'text-accent/70' },
  reconnecting: { dot: 'bg-warn animate-pulse', label: 'SYNC', labelClass: 'text-warn/70' },
  disconnected: { dot: 'bg-down/60', label: 'OFF', labelClass: 'text-fg-3' },
} as const;

export default function ConnectionIndicator({
  status,
}: ConnectionIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5" title={`Status: ${status}`}>
      <div className={clsx('w-1.5 h-1.5 rounded-full', config.dot)} />
      <span className={clsx('text-[9px] font-mono uppercase tracking-widest', config.labelClass)}>
        {config.label}
      </span>
    </div>
  );
}
