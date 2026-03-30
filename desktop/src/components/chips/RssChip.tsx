import { memo } from "react";
import { clsx } from "clsx";
import type { RssItem } from "../../types";
import type { ChipColorMode } from "../../preferences";
import { getChipColors, chipBaseClasses } from "./chipColors";
import { timeAgo } from "../../utils/format";

interface RssChipProps {
  item: RssItem;
  comfort?: boolean;
  colorMode?: ChipColorMode;
  /** Hide source name label (default: shown) */
  showSource?: boolean;
  /** Hide published timestamp (default: shown) */
  showTimestamps?: boolean;
  onClick?: () => void;
}

const RssChip = memo(function RssChip({ item, comfort, colorMode = "channel", showSource = true, showTimestamps = true, onClick }: RssChipProps) {
  const c = getChipColors(colorMode, "rss");
  const maxLen = comfort ? 60 : 40;
  const headline =
    item.title.length > maxLen ? item.title.slice(0, maxLen) + "\u2026" : item.title;
  const hasSource = showSource && item.source_name;
  const hasTime = showTimestamps && item.published_at;

  return (
    <button
      onClick={onClick}
      className={chipBaseClasses(comfort, c, "whitespace-nowrap")}
    >
      {/* Row 1: headline */}
      <span className={clsx("font-medium", c.text, comfort && "text-[13px]")}>{headline}</span>
      {/* Row 2: source + time (comfort) / inline source (compact) */}
      {comfort ? (
        (hasSource || hasTime) && (
          <div className={clsx("flex items-center gap-1.5 text-[10px] font-mono", c.textFaint)}>
            {hasSource && <span>{item.source_name}</span>}
            {hasSource && hasTime && <span className="text-fg-4">&middot;</span>}
            {hasTime && <span>{timeAgo(item.published_at, { suffix: true })}</span>}
          </div>
        )
      ) : (
        hasSource && (
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
  prev.showSource === next.showSource &&
  prev.showTimestamps === next.showTimestamps &&
  prev.onClick === next.onClick &&
  prev.item.guid === next.item.guid &&
  prev.item.feed_url === next.item.feed_url &&
  prev.item.title === next.item.title &&
  prev.item.source_name === next.item.source_name &&
  prev.item.published_at === next.item.published_at
);

export default RssChip;
