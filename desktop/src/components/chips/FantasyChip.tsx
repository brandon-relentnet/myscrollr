import { clsx } from "clsx";

interface FantasyChipProps {
  item: Record<string, unknown>;
  comfort?: boolean;
  onClick?: () => void;
}

export default function FantasyChip({ item, comfort, onClick }: FantasyChipProps) {
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
  const team = (item.team_name as string) || (item.team as string);
  const position = item.position as string | undefined;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group",
        "px-3 rounded-sm border",
        "font-mono whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-accent-purple/[0.06] border-accent-purple/25 hover:border-accent-purple/40",
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: name + points */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className="font-medium text-accent-purple">{label}</span>
        {value != null && (
          <span className="text-accent-purple/60">{Number(value).toFixed(1)}pts</span>
        )}
      </div>
      {/* Row 2: team + position (comfort only) */}
      {comfort && (team || position) && (
        <div className="flex items-center gap-1.5 text-[10px] text-accent-purple/40">
          {position && <span className="uppercase font-semibold">{position}</span>}
          {position && team && <span className="text-fg-4">&middot;</span>}
          {team && <span>{team}</span>}
        </div>
      )}
    </button>
  );
}
