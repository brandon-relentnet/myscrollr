/**
 * TopNav — horizontal navigation bar.
 *
 * Primary app-level navigation: Feed, Ticker on the left.
 * Settings gear and Account avatar on the right.
 */
import { LayoutDashboard, Radio, Settings, User } from "lucide-react";
import clsx from "clsx";
import { getUserIdentity, TIER_LABELS } from "../auth";
import type { SubscriptionTier } from "../auth";

// ── Types ───────────────────────────────────────────────────────

type ActiveView = "feed" | "ticker" | "settings" | "account" | "none";

interface TopNavProps {
  /** Which top-level view is active. */
  activeView: ActiveView;
  /** Whether the user is authenticated. */
  authenticated: boolean;
  /** User's subscription tier. */
  tier: SubscriptionTier;
  /** Navigate to the Feed dashboard. */
  onNavigateToFeed: () => void;
  /** Navigate to Ticker management. */
  onNavigateToTicker: () => void;
  /** Navigate to Settings. */
  onNavigateToSettings: () => void;
  /** Navigate to Account. */
  onNavigateToAccount: () => void;
  /** Trigger sign-in flow (when clicking Account while unauthenticated). */
  onLogin: () => void;
}

// ── Component ───────────────────────────────────────────────────

export default function TopNav({
  activeView,
  authenticated,
  tier,
  onNavigateToFeed,
  onNavigateToTicker,
  onNavigateToSettings,
  onNavigateToAccount,
  onLogin,
}: TopNavProps) {
  const identity = authenticated ? getUserIdentity() : null;
  const initials = identity
    ? (identity.name ?? identity.email ?? "")
        .split(/[\s@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join("")
    : null;

  return (
    <nav
      aria-label="Primary navigation"
      className="flex items-center justify-between h-12 px-4 border-b border-edge shrink-0 bg-surface-2/50"
    >
      {/* Left — primary tabs */}
      <div className="flex items-center gap-1">
        <NavTab
          icon={<LayoutDashboard size={14} />}
          label="Feed"
          active={activeView === "feed"}
          onClick={onNavigateToFeed}
        />
        <NavTab
          icon={<Radio size={14} />}
          label="Ticker"
          active={activeView === "ticker"}
          onClick={onNavigateToTicker}
        />
      </div>

      {/* Right — settings + account */}
      <div className="flex items-center gap-1">
        <button
          onClick={onNavigateToSettings}
          title="Settings"
          className={clsx(
            "w-8 h-8 flex items-center justify-center rounded-lg transition-colors",
            activeView === "settings"
              ? "bg-accent/10 text-accent"
              : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
          )}
        >
          <Settings size={15} />
        </button>

        {/* Account button */}
        <button
          onClick={authenticated ? onNavigateToAccount : onLogin}
          title={
            authenticated
              ? `${identity?.email ?? "Account"} — ${TIER_LABELS[tier]}`
              : "Sign in"
          }
          className={clsx(
            "h-8 flex items-center gap-2 rounded-lg transition-colors px-2",
            activeView === "account"
              ? "bg-accent/10 text-accent"
              : authenticated
                ? "text-fg-2 hover:text-fg hover:bg-surface-hover"
                : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
          )}
        >
          {authenticated && initials ? (
            <span className="w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center text-[10px] font-bold shrink-0">
              {initials}
            </span>
          ) : (
            <User size={15} />
          )}
          {!authenticated && (
            <span className="text-[11px] font-medium">Sign in</span>
          )}
        </button>
      </div>
    </nav>
  );
}

// ── NavTab ───────────────────────────────────────────────────────

function NavTab({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
        active
          ? "bg-accent/10 text-accent"
          : "text-fg-3 hover:text-fg-2 hover:bg-surface-hover",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
