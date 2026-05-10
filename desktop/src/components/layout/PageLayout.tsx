/**
 * PageLayout — universal page chassis used by every main-window route.
 *
 * Provides three canonical regions:
 *   1. Header band — title + subtitle (inline) + entityAction
 *      + optional tab band on the same row
 *   2. Content stack — children (typically <PageSection> blocks)
 *   3. Footer — optional destructive/peripheral actions
 *
 * Back navigation does NOT live in the page header anymore — it's in
 * the TopBar (always visible, Spotify-style forward/back). One
 * canonical home for "go back" across the whole app.
 *
 * The chassis enforces consistent vertical rhythm, header height,
 * paddings, and action placement across every route. Distinctive
 * content lives inside; the chrome stays the same so users find the
 * same things in the same places on every page.
 *
 * IA refactor 2026-05-09 — see
 * docs/superpowers/specs/2026-05-09-desktop-ia-refactor-design.md
 */
import type { ReactNode } from "react";
import clsx from "clsx";

// ── Tab type ────────────────────────────────────────────────────

export interface PageTab {
  /** URL-like identifier for the tab. */
  key: string;
  /** Human label rendered in the tab button. */
  label: string;
  /** Optional tooltip / aria description. */
  description?: string;
}

// ── Props ───────────────────────────────────────────────────────

interface PageLayoutProps {
  /** Page title — capitalized, normal-case. Sized for legibility, not stamped. */
  title: string;
  /** Single-line subtitle that explains the page. Optional. */
  subtitle?: string;

  /**
   * Destructive or contextual action tied to the page entity.
   * Source pages use this for the Trash button. Most pages omit it.
   */
  entityAction?: ReactNode;

  /** Optional tab band. When omitted, no tab bar renders. */
  tabs?: {
    items: PageTab[];
    activeKey: string;
    onChange: (key: string) => void;
  };

  /** Page content — typically a stack of <PageSection> components. */
  children: ReactNode;

  /** Optional footer band for destructive/peripheral page-level actions. */
  footer?: ReactNode;

  /**
   * Constrain the content width. Defaults to "narrow" (a comfortable
   * reading column for forms / settings). Use "wide" for grids/dashboards.
   */
  width?: "narrow" | "wide";
}

// ── Component ───────────────────────────────────────────────────

export default function PageLayout({
  title,
  subtitle,
  entityAction,
  tabs,
  children,
  footer,
  width = "narrow",
}: PageLayoutProps) {
  const widthClass = width === "wide" ? "max-w-6xl" : "max-w-3xl";

  return (
    <div className="flex flex-col h-full">
      {/* ── Header band ─────────────────────────────────────── */}
      <header className="shrink-0 border-b border-edge/30 bg-surface">
        <div className={clsx("mx-auto px-5 pt-3.5 pb-0", widthClass)}>
          {/* Single-line title row: title + subtitle inline + entityAction.
              Subtitle is rendered next to the title with a divider so
              the page header stays compact (one row instead of two). */}
          <div className="flex items-center justify-between gap-4 min-h-[24px]">
            <div className="flex items-baseline gap-2.5 min-w-0 flex-1">
              <h1 className="text-[15px] font-semibold text-fg tracking-tight truncate">
                {title}
              </h1>
              {subtitle && (
                <>
                  <span className="text-fg-4/40 text-xs shrink-0" aria-hidden>
                    ·
                  </span>
                  <p className="text-[12px] text-fg-4 truncate">{subtitle}</p>
                </>
              )}
            </div>
            {entityAction && (
              <div className="shrink-0 flex items-center gap-1">
                {entityAction}
              </div>
            )}
          </div>

          {/* Tab band — sits flush against the bottom border of the
              header so the active tab's accent line is the divider. */}
          {tabs && (
            <nav
              className="flex flex-wrap gap-0 mt-2.5 -mb-px"
              aria-label="Page sections"
            >
              {tabs.items.map((tab) => {
                const isActive = tab.key === tabs.activeKey;
                return (
                  <button
                    key={tab.key}
                    onClick={() => tabs.onChange(tab.key)}
                    aria-current={isActive ? "page" : undefined}
                    title={tab.description}
                    className={clsx(
                      "px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px",
                      isActive
                        ? "text-accent border-accent"
                        : "text-fg-3 border-transparent hover:text-fg-2",
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Bottom spacing when no tabs (so title doesn't kiss the border) */}
          {!tabs && <div className="h-3.5" />}
        </div>
      </header>

      {/* ── Content stack ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className={clsx("mx-auto px-5 py-5", widthClass)}>
          {children}
        </div>

        {/* ── Footer band (optional) ──────────────────────── */}
        {footer && (
          <div className="border-t border-edge/40">
            <div className={clsx("mx-auto px-5 py-4", widthClass)}>
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
