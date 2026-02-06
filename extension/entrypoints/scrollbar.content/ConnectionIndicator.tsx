import { clsx } from 'clsx';
import type { ConnectionStatus } from '~/utils/types';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
}

export default function ConnectionIndicator({
  status,
}: ConnectionIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5" title={`Status: ${status}`}>
      <div
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          status === 'connected' && 'bg-emerald-400',
          status === 'reconnecting' && 'bg-amber-400 animate-pulse',
          status === 'disconnected' && 'bg-red-400',
        )}
      />
      <span className="text-[10px] text-zinc-500 capitalize">{status}</span>
    </div>
  );
}
