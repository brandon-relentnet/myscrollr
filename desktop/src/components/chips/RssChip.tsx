import { clsx } from "clsx";
import type { RssItem } from "~/utils/types";

interface RssChipProps {
  item: RssItem;
  onClick?: () => void;
}

export default function RssChip({ item, onClick }: RssChipProps) {
  const headline =
    item.title.length > 40 ? item.title.slice(0, 40) + "\u2026" : item.title;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "ticker-chip group flex items-center gap-2",
        "px-3 py-1 rounded-sm border",
        "text-[13px] whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-info/[0.06] border-info/25 hover:border-info/40"
      )}
    >
      <span className="text-info font-medium">{headline}</span>
      {item.source_name && (
        <>
          <span className="text-fg-4">&middot;</span>
          <span className="text-info/60 font-mono text-[12px]">
            {item.source_name}
          </span>
        </>
      )}
    </button>
  );
}
