/**
 * SourcePageLayout — page chassis for channel and widget routes.
 *
 * Renders through the universal `PageLayout`. Source pages no longer
 * have a visible tab band — Feed is the single visible page. All
 * secondary actions (Configure, Display preferences, Manage on
 * ticker, Remove) live in a 3-dot OverflowMenu in the TopBar's
 * entityAction slot.
 *
 * The /feed and /configuration routes still exist (for direct
 * deeplinks, tray actions, and the Catalog "Open" → feed flow);
 * they're just no longer surfaced as competing tabs in the chrome.
 *
 * IA refactor 2026-05-09 — see
 * docs/superpowers/specs/2026-05-09-desktop-ia-refactor-design.md
 */
import { useState } from "react";
import { Settings as SettingsIcon, SlidersHorizontal, Tv, Trash2 } from "lucide-react";
import ConfirmDialog from "./ConfirmDialog";
import PageLayout from "./layout/PageLayout";
import OverflowMenu, { type OverflowMenuItem } from "./OverflowMenu";

// ── Shared tab constants ────────────────────────────────────────
//
// SourceTab is still part of the URL contract — channels can be
// deeplinked to /channel/$type/feed or /channel/$type/configuration.
// We just don't render a visible tab band anymore.

export const VALID_TABS = ["feed", "configuration"] as const;
export type SourceTab = (typeof VALID_TABS)[number];

/** Parse a raw tab parameter into a valid SourceTab.
 *  - "display" is migrated to "configuration" (Display tab was folded
 *    into Configure as a section in the IA refactor). Old bookmarks
 *    and tray deeplinks still work.
 *  - Anything else falls back to "feed". */
export function parseSourceTab(rawTab: string): SourceTab {
  if (rawTab === "display") return "configuration";
  return (VALID_TABS as readonly string[]).includes(rawTab)
    ? (rawTab as SourceTab)
    : "feed";
}

/** Fallback for when a source (channel or widget) is not found. */
export function SourceNotFound({
  kind,
  name,
}: {
  kind: "Channel" | "Widget";
  name: string;
}) {
  return (
    <PageLayout title={kind + " not found"} width="narrow">
      <div className="flex flex-col items-center justify-center text-center max-w-sm mx-auto gap-3 py-12">
        <p className="text-sm text-fg-3">
          The {kind.toLowerCase()} &ldquo;{name}&rdquo; is not installed.
        </p>
      </div>
    </PageLayout>
  );
}

// ── Layout ──────────────────────────────────────────────────────

interface SourcePageLayoutProps {
  name: string;
  /** Optional 1-line description rendered next to the name. */
  description?: string;
  /** Current tab — "feed" or "configuration". */
  activeTab: SourceTab;
  /** Navigate to a different tab (used by menu items + Configure CTAs). */
  onTabChange: (tab: SourceTab) => void;
  /** Click handler for the parent breadcrumb in the TopBar
   *  (typically navigates back to /feed). */
  onBack: () => void;
  /** Click handler for "Manage on ticker" — opens Settings → Ticker. */
  onManageTicker: () => void;
  children: React.ReactNode;

  /** Source-level remove action. */
  onRemove?: () => void;
  /** "channel" triggers a ConfirmDialog before removal; "widget" removes immediately. */
  sourceKind?: "channel" | "widget";
  /** Whether this source has display preferences. Channels: true.
   *  Widgets: their display options live alongside config; we don't
   *  surface a separate "Display" menu item for them. */
  hasDisplayPreferences?: boolean;
}

export default function SourcePageLayout({
  name,
  description,
  activeTab,
  onTabChange,
  onBack,
  onManageTicker,
  children,
  onRemove,
  sourceKind,
  hasDisplayPreferences = false,
}: SourcePageLayoutProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  function handleRemove() {
    if (sourceKind === "channel") {
      setConfirmRemove(true);
    } else {
      onRemove?.();
    }
  }

  // Build the menu items list. Order is intentional: most common
  // first (Configure), then Display, then ticker management, then
  // a divider, then destructive Remove at the bottom.
  const menuItems: OverflowMenuItem[] = [];

  // Configure entry — when on /configuration it acts as "back to
  // Feed" so the menu is dual-purpose; otherwise it opens Configure.
  if (activeTab === "configuration") {
    menuItems.push({
      key: "feed",
      label: "Back to feed",
      icon: Tv,
      onSelect: () => onTabChange("feed"),
    });
  } else {
    menuItems.push({
      key: "configure",
      label: sourceKind === "widget" ? "Configure widget" : "Configure source",
      hint:
        sourceKind === "widget"
          ? "Pick what to track and how it renders"
          : "Pick what to track",
      icon: SettingsIcon,
      onSelect: () => onTabChange("configuration"),
    });
  }

  // Display preferences — only for channels (widgets don't have a
  // separate display section). Jumping to Configure with a focus
  // hint is the natural place; we just rely on Configure showing
  // the Display section near the bottom.
  if (hasDisplayPreferences && activeTab !== "configuration") {
    menuItems.push({
      key: "display",
      label: "Display preferences",
      hint: "Choose what shows on Home and the ticker",
      icon: SlidersHorizontal,
      onSelect: () => onTabChange("configuration"),
    });
  }

  menuItems.push({
    key: "ticker",
    label: "Manage on ticker",
    hint: "Set rows, speed, and style",
    icon: Tv,
    onSelect: onManageTicker,
  });

  if (onRemove) {
    menuItems.push({ key: "div-1", divider: true });
    menuItems.push({
      key: "remove",
      label: `Remove ${name}`,
      icon: Trash2,
      destructive: true,
      onSelect: handleRemove,
    });
  }

  const entityAction = (
    <OverflowMenu
      items={menuItems}
      triggerLabel={`${name} options`}
    />
  );

  return (
    <>
      <PageLayout
        title={name}
        subtitle={description}
        parentLabel="Home"
        onParentClick={onBack}
        // When on Configure, clicking the source name in the breadcrumb
        // returns to the source's Feed view. On Feed itself the title
        // is plain text (no-op click would be confusing).
        onTitleClick={
          activeTab === "configuration" ? () => onTabChange("feed") : undefined
        }
        width="narrow"
        entityAction={entityAction}
      >
        {children}
      </PageLayout>

      {/* Channel removal confirmation. Widgets remove immediately
          via the useUndoableAction toast (see widget route). */}
      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${name}?`}
        description={`This will delete your ${name} configuration and remove it from the dashboard. You can re-add it from the Catalog.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          setConfirmRemove(false);
          onRemove?.();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
