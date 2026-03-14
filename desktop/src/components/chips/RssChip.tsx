import { memo } from "react";
import { clsx } from "clsx";
import type { RssItem } from "../../types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors } from "./chipColors";
import { timeAgo } from "../../utils/format";

interface RssChipProps {
  item: RssItem;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  onClick?: () => void;
}

const RssChip = memo(function RssChip({ item, comfort, colorMode = "channel", onClick }: RssChipProps) {
  const c = getChipColors(colorMode, "rss");
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
        c.bg, c.border, c.hoverBorder,
        comfort ? "flex flex-col items-start py-1.5 gap-0.5" : "flex items-center gap-2 py-1 text-[13px]",
      )}
    >
      {/* Row 1: headline */}
      <span className={clsx("font-medium", c.text, comfort && "text-[13px]")}>{headline}</span>
      {/* Row 2: source + time (comfort) / inline source (compact) */}
      {comfort ? (
        <div className={clsx("flex items-center gap-1.5 text-[10px] font-mono", c.textFaint)}>
          {item.source_name && <span>{item.source_name}</span>}
          {item.published_at && (
            <>
              <span className="text-fg-4">&middot;</span>
              <span>{timeAgo(item.published_at, { suffix: true })}</span>
            </>
          )}
        </div>
      ) : (
        item.source_name && (
          <>
            <span className="text-fg-4">&middot;</span>
            <span className={clsx("font-mono text-[12px]", c.textDim)}>
              {item.source_name}
            </span>
          </>
        )
      )}
    </button>
  );
}, (prev, next) =>
  prev.comfort === next.comfort &&
  prev.colorMode === next.colorMode &&
  prev.onClick === next.onClick &&
  prev.item.guid === next.item.guid &&
  prev.item.feed_url === next.item.feed_url &&
  prev.item.title === next.item.title &&
  prev.item.source_name === next.item.source_name &&
  prev.item.published_at === next.item.published_at
);

export default RssChip;
