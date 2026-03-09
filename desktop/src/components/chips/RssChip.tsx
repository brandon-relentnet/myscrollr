import { clsx } from "clsx";
import type { RssItem } from "~/utils/types";

interface RssChipProps {
  item: RssItem;
  comfort?: boolean;
  onClick?: () => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function RssChip({ item, comfort, onClick }: RssChipProps) {
  const maxLen = comfort ? 60 : 40;
  const headline =
    item.title.length > maxLen ? item.title.slice(0, maxLen) + "\u2026" : item.title;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group",
        "px-3 rounded-sm border",
        "whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-info/[0.06] border-info/25 hover:border-info/40",
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: headline */}
      <span className={clsx("text-info font-medium", comfort && "text-[13px]")}>{headline}</span>
      {/* Row 2: source + time (comfort) / inline source (compact) */}
      {comfort ? (
        <div className="flex items-center gap-1.5 text-[10px] text-info/40 font-mono">
          {item.source_name && <span>{item.source_name}</span>}
          {item.published_at && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span>{timeAgo(item.published_at)}</span>
            </>
          )}
        </div>
      ) : (
        item.source_name && (
          <>
            <span className="text-fg-4">&middot;</span>
            <span className="text-info/60 font-mono text-[12px]">
              {item.source_name}
            </span>
          </>
        )
      )}
    </button>
  );
}
