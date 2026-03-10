import { useEffect, useRef } from "react";
import { getWebChannel } from "../channels/webRegistry";
import { getChannel as getExtChannel } from "~/channels/registry";
import { getAllWidgets } from "../widgets/registry";
import type { Channel } from "../api/client";

/** Canonical display order */
const TAB_ORDER = ["finance", "sports", "fantasy", "rss"];

function sortChannels(channels: Channel[]): Channel[] {
  const known = TAB_ORDER.filter((id) =>
    channels.some((ch) => ch.channel_type === id),
  ).map((id) => channels.find((ch) => ch.channel_type === id)!);
  const unknown = channels
    .filter((ch) => !TAB_ORDER.includes(ch.channel_type))
    .sort((a, b) => a.channel_type.localeCompare(b.channel_type));
  return [...known, ...unknown];
}

interface ChannelPickerProps {
  channels: Channel[];
  activeTabs: string[];
  onToggle: (channelType: string, visible: boolean) => void;
  /** Widget IDs that are currently enabled. */
  enabledWidgets: string[];
  /** Called when a widget is toggled on/off. */
  onWidgetToggle: (widgetId: string) => void;
  onClose: () => void;
  /** Offset from top of viewport to position below the taskbar header */
  topOffset: number;
}

export default function ChannelPicker({
  channels,
  activeTabs,
  onToggle,
  enabledWidgets,
  onWidgetToggle,
  onClose,
  topOffset,
}: ChannelPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-channel-picker-trigger]")
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKey);
    // Delay click listener so the trigger click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  const sorted = sortChannels(channels);

  return (
    <div
      ref={panelRef}
      className="fixed left-3 z-50 min-w-[180px] rounded-lg border border-edge bg-surface shadow-soft-md"
      style={{ top: `${topOffset}px` }}
    >
      <div className="px-3 py-2 border-b border-edge">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-fg-3">
          Channels
        </span>
      </div>
      <div className="py-1">
        {sorted.map((ch) => {
          const webManifest = getWebChannel(ch.channel_type);
          const extManifest = getExtChannel(ch.channel_type);
          const name =
            webManifest?.name ?? extManifest?.name ?? ch.channel_type;
          const hex = webManifest?.hex ?? "#9494a0";
          const isVisible = activeTabs.includes(ch.channel_type);

          return (
            <button
              key={ch.channel_type}
              onClick={() => onToggle(ch.channel_type, !isVisible)}
              className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors group cursor-pointer"
            >
              {/* Color dot */}
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0 transition-opacity"
                style={{
                  background: hex,
                  opacity: isVisible ? 1 : 0.25,
                }}
              />
              {/* Channel name */}
              <span
                className="text-[12px] font-mono uppercase tracking-wide flex-1 transition-colors"
                style={{ color: isVisible ? hex : undefined }}
              >
                {isVisible ? (
                  name
                ) : (
                  <span className="text-fg-3">{name}</span>
                )}
              </span>
              {/* Toggle indicator */}
              <span
                className="text-[10px] font-mono uppercase tracking-wider transition-colors"
                style={{ color: isVisible ? hex : undefined }}
              >
                {isVisible ? (
                  "on"
                ) : (
                  <span className="text-fg-4">off</span>
                )}
              </span>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="px-3 py-3 text-[11px] text-fg-3 font-mono text-center">
            No channels configured
          </div>
        )}
      </div>

      {/* Widgets section */}
      {getAllWidgets().length > 0 && (
        <>
          <div className="px-3 py-2 border-t border-edge">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest text-fg-3">
              Widgets
            </span>
          </div>
          <div className="py-1">
            {getAllWidgets().map((widget) => {
              const isEnabled = enabledWidgets.includes(widget.id);
              return (
                <button
                  key={widget.id}
                  onClick={() => onWidgetToggle(widget.id)}
                  className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-surface-hover transition-colors group cursor-pointer"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 transition-opacity"
                    style={{
                      background: widget.hex,
                      opacity: isEnabled ? 1 : 0.25,
                    }}
                  />
                  <span
                    className="text-[12px] font-mono uppercase tracking-wide flex-1 transition-colors"
                    style={{ color: isEnabled ? widget.hex : undefined }}
                  >
                    {isEnabled ? (
                      widget.name
                    ) : (
                      <span className="text-fg-3">{widget.name}</span>
                    )}
                  </span>
                  <span
                    className="text-[10px] font-mono uppercase tracking-wider transition-colors"
                    style={{ color: isEnabled ? widget.hex : undefined }}
                  >
                    {isEnabled ? (
                      "on"
                    ) : (
                      <span className="text-fg-4">off</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
