import { useState } from "react";
import clsx from "clsx";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import type { CatalogItem, CatalogCategory } from "../../marketplace";
import type { SubscriptionTier } from "../../auth";
import { TIER_LABELS } from "../../auth";
import ConfirmDialog from "../ConfirmDialog";

// ── Confirm-dialog nouns per channel ────────────────────────────

const CHANNEL_NOUNS: Record<string, string> = {
  finance: "symbols",
  sports: "leagues",
  rss: "feeds",
  fantasy: "leagues",
};

const CATEGORY_BADGE: Record<CatalogCategory, string> = {
  channel: "Channel",
  widget: "Widget",
};

// ── Props ───────────────────────────────────────────────────────

interface CatalogCardProps {
  item: CatalogItem;
  enabled: boolean;
  tier: SubscriptionTier;
  authenticated: boolean;
  /** Disable Add button while dashboard is loading (channels enabled state unknown). */
  dashboardLoading: boolean;
  onAdd: (item: CatalogItem) => Promise<void>;
  onRemove: (item: CatalogItem) => Promise<void>;
  onLogin: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function CatalogCard({
  item,
  enabled,
  tier,
  authenticated,
  dashboardLoading,
  onAdd,
  onRemove,
  onLogin,
}: CatalogCardProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tierLocked =
    authenticated && item.requiredTier !== "free" && !tierMeetsRequirement(tier, item.requiredTier);

  async function handleAdd() {
    if (!authenticated && item.kind === "channel") {
      onLogin();
      return;
    }
    if (tierLocked) {
      open("https://myscrollr.com/uplink");
      return;
    }
    setLoading(true);
    try {
      await onAdd(item);
    } finally {
      setLoading(false);
    }
  }

  function handleRemoveClick() {
    if (item.kind === "channel") {
      setConfirmOpen(true);
    } else {
      doRemove();
    }
  }

  async function doRemove() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      await onRemove(item);
    } finally {
      setLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────

  const Icon = item.icon;

  return (
    <>
      <div
        className={clsx(
          "rounded-lg border p-4 transition-colors",
          enabled
            ? "bg-base-200/70 border-success/20"
            : "bg-base-200/40 border-edge/20 hover:bg-base-200/60",
        )}
      >
        {/* Header row: icon + name + category badge */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${item.hex}15`, color: item.hex }}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fg truncate">{item.name}</span>
              {enabled && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-success">
                  <Check size={10} />
                  Added
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium text-fg-4 uppercase tracking-wider">
              {CATEGORY_BADGE[item.category]}
            </span>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-fg-3 leading-relaxed mb-4 line-clamp-2">
          {item.description}
        </p>

        {/* Tier badge (only when locked) */}
        {tierLocked && (
          <div className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md bg-warn/10 border border-warn/20 w-fit">
            <span className="text-[10px] font-medium text-warn">
              Requires {TIER_LABELS[item.requiredTier]}
            </span>
          </div>
        )}

        {/* Unauthenticated channel hint */}
        {!authenticated && item.kind === "channel" && !enabled && (
          <div className="flex items-center gap-1.5 mb-3 px-2 py-1 rounded-md bg-info/10 border border-info/20 w-fit">
            <span className="text-[10px] font-medium text-info">
              Sign in to add
            </span>
          </div>
        )}

        {/* Action */}
        <div className="flex items-center justify-end">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-fg-4" />
          ) : enabled ? (
            <button
              onClick={handleRemoveClick}
              className="text-xs font-medium text-fg-4 hover:text-error transition-colors"
            >
              Remove
            </button>
          ) : tierLocked ? (
            <button
              onClick={() => open("https://myscrollr.com/uplink")}
              className="flex items-center gap-1 text-xs font-medium text-warn hover:text-warn/80 transition-colors"
            >
              Upgrade <ExternalLink size={10} />
            </button>
          ) : !authenticated && item.kind === "channel" ? (
            <button
              onClick={onLogin}
              className="text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
            >
              Sign in to add
            </button>
          ) : (
            <button
              onClick={handleAdd}
              disabled={dashboardLoading && item.kind === "channel"}
              className={clsx(
                "text-xs font-semibold transition-colors",
                dashboardLoading && item.kind === "channel"
                  ? "text-fg-4 cursor-not-allowed"
                  : "text-accent hover:text-accent/80",
              )}
            >
              Add
            </button>
          )}
        </div>
      </div>

      {/* Channel removal confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title={`Remove ${item.name}?`}
        description={`Your saved ${CHANNEL_NOUNS[item.id] ?? "data"} and configuration will be deleted.`}
        confirmLabel="Remove"
        destructive
        onConfirm={doRemove}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

const TIER_ORDER: SubscriptionTier[] = ["free", "uplink", "uplink_pro", "uplink_ultimate"];

function tierMeetsRequirement(current: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(required);
}
