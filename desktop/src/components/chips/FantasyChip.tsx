import { clsx } from "clsx";
import type { ChipColorMode } from "../../preferences";
import { getChipColors, chipBaseClasses } from "./chipColors";

interface FantasyChipProps {
  item: Record<string, unknown>;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

export default function FantasyChip({ item, comfort, colorMode = "channel", onClick }: FantasyChipProps) {
  const c = getChipColors(colorMode, "fantasy");

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
      className={chipBaseClasses(comfort, c, "font-mono whitespace-nowrap")}
    >
      {/* Row 1: name + points */}
      <div className={clsx("flex items-center gap-2", comfort && "text-[13px]")}>
        <span className={clsx("font-medium", c.text)}>{label}</span>
        {value != null && (
          <span className={c.textDim}>{Number(value).toFixed(1)}pts</span>
        )}
      </div>
      {/* Row 2: team + position (comfort only) */}
      {comfort && (team || position) && (
        <div className={clsx("flex items-center gap-1.5 text-[10px]", c.textFaint)}>
          {position && <span className="uppercase font-semibold">{position}</span>}
          {position && team && <span className="text-fg-4">&middot;</span>}
          {team && <span>{team}</span>}
        </div>
      )}
    </button>
  );
}
