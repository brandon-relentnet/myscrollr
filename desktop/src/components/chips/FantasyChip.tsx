import { clsx } from "clsx";

interface FantasyChipProps {
  item: Record<string, unknown>;
  onClick?: () => void;
}

export default function FantasyChip({ item, onClick }: FantasyChipProps) {
  // Fantasy data shape varies — extract what's available
  const label =
    (item.player_name as string) ||
    (item.name as string) ||
    (item.team_name as string) ||
    "Fantasy";
  const value =
    (item.points as number) ??
    (item.total_points as number) ??
    (item.score as number);

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group flex items-center gap-1.5",
        "px-2.5 py-1 rounded border",
        "text-[11px] font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-surface-2/50 border-edge hover:border-edge-2"
      )}
    >
      <span className="font-medium text-fg">{label}</span>
      {value != null && (
        <span className="text-fg-2">{Number(value).toFixed(1)}pts</span>
      )}
    </button>
  );
}
