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
        "ticker-chip group flex items-center gap-1.5",
        "px-2.5 py-1 rounded border",
        "text-[11px] whitespace-nowrap",
        "transition-colors cursor-pointer",
        "bg-surface-2/50 border-edge hover:border-edge-2"
      )}
    >
      <span className="text-fg font-medium">{headline}</span>
      {item.source_name && (
        <>
          <span className="text-fg-4">&middot;</span>
          <span className="text-fg-3 font-mono text-[10px]">
            {item.source_name}
          </span>
        </>
      )}
    </button>
  );
}
