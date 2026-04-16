import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { getAllChannels } from "../../channels/registry";
import { getAllWidgets } from "../../widgets/registry";
import type { ChannelManifest, WidgetManifest } from "../../types";

const CHANNEL_TIERS: Record<string, string> = {
  finance: "Free",
  sports: "Free",
  rss: "Free",
  fantasy: "Uplink",
};

export default function FeatureGuidesSection() {
  const channels = useMemo(() => getAllChannels(), []);
  const widgets = useMemo(() => getAllWidgets(), []);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-6">
      {/* Channels */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-3">
          Channels
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {channels.map((ch) => (
            <GuideCard
              key={ch.id}
              manifest={ch}
              tier={CHANNEL_TIERS[ch.id] ?? "Free"}
              isOpen={expandedId === ch.id}
              onToggle={() => toggle(ch.id)}
            />
          ))}
        </div>
      </div>

      {/* Widgets */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-3">
          Widgets
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {widgets.map((w) => (
            <GuideCard
              key={w.id}
              manifest={w}
              tier="Free"
              isOpen={expandedId === w.id}
              onToggle={() => toggle(w.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function GuideCard({
  manifest,
  tier,
  isOpen,
  onToggle,
}: {
  manifest: ChannelManifest | WidgetManifest;
  tier: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const Icon = manifest.icon;

  return (
    <div className="overflow-hidden rounded-lg border border-edge/30">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/50"
      >
        <span className="shrink-0" style={{ color: manifest.hex }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-fg">{manifest.name}</span>
            <span
              className={clsx(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                tier === "Free"
                  ? "bg-accent/10 text-accent"
                  : "bg-amber-500/10 text-amber-400",
              )}
            >
              {tier === "Free" ? "Free" : "Uplink required"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-3">
            {manifest.description}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={clsx(
            "shrink-0 text-fg-3 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>
      <div
        className={clsx(
          "overflow-hidden transition-all duration-200",
          isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="space-y-3 px-4 pb-4 pt-1">
          <p className="text-sm text-fg-3">{manifest.info.about}</p>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-3">
              How to use
            </p>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-fg-3">
              {manifest.info.usage.map((step, j) => (
                <li key={j}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
