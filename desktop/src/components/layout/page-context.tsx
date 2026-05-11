/**
 * PageContext — lets every route declare its identity (title, optional
 * subtitle, optional menu of contextual actions) so the TopBar can
 * render that identity as breadcrumb-style navigation.
 *
 * The TopBar renders the breadcrumb as:
 *   parentLabel / title / subtitle
 * The LAST segment (subtitle if present, otherwise title) becomes the
 * trigger for the page's contextual menu when `menuItems` is provided.
 * That way the breadcrumb segment IS the menu — no separate "Options"
 * button competing with the breadcrumb for attention.
 *
 * Pre-polish-pass the page header lived inside the route's content
 * area. Now the page identity sits in the always-visible TopBar and
 * the route just publishes its title via this context.
 */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { OverflowMenuItem } from "../OverflowMenu";

export interface PageIdentity {
  /** Page title, e.g. "Sports", "Settings", "Catalog". */
  title: string;
  /** Optional 1-line subtitle / tagline. */
  subtitle?: string;
  /**
   * For source pages, the parent breadcrumb label (e.g. "Home"). Used
   * to render "Home / Sports" style breadcrumb in the TopBar.
   */
  parentLabel?: string;
  /** Click handler for the parent breadcrumb (e.g. navigate to /feed). */
  onParentClick?: () => void;
  /**
   * Optional click handler for the title itself. Used when the page
   * has sub-routes (e.g. on `/channel/sports/configuration`, clicking
   * "Sports" should go back to `/channel/sports/feed`). When omitted,
   * and no menuItems make the title a menu, the title renders as plain
   * text.
   */
  onTitleClick?: () => void;
  /**
   * Optional contextual menu items. When provided, the LAST breadcrumb
   * segment (subtitle if present, otherwise title) becomes the menu
   * trigger — clicking it opens an OverflowMenu with these items.
   */
  menuItems?: OverflowMenuItem[];
  /** Aria label for the menu trigger. Default: 'Page options'. */
  menuLabel?: string;
  /**
   * Kind of menu this is. Controls which trigger TopBar renders.
   *  - "actions": page-scoped actions like Configure, Remove on
   *    source pages. The TopBar renders a visible "Options" pill
   *    button as the SOLE menu trigger. Breadcrumb segments stay
   *    plain navigation text.
   *  - "tabs": the menu is a sibling-tab switcher (Settings,
   *    Catalog). The last breadcrumb segment IS the trigger —
   *    clicking it opens a menu of the OTHER tabs. No separate pill,
   *    because the breadcrumb already names the active section and
   *    the chevron signals "switch."
   */
  menuKind?: "actions" | "tabs";
  /**
   * Optional non-menu action rendered after the breadcrumb (e.g. a
   * raw Trash button on routes that don't otherwise have a menu).
   * Most routes should prefer menuItems; this is a fallback for
   * surfaces that need a plain icon button.
   */
  entityAction?: ReactNode;
}

interface PageIdentityRegistry {
  identity: PageIdentity | null;
  setIdentity: (next: PageIdentity | null) => void;
}

const PageIdentityContext = createContext<PageIdentityRegistry | null>(null);

/** Provider — mount once at the app shell. */
export function PageIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<PageIdentity | null>(null);
  return (
    <PageIdentityContext.Provider value={{ identity, setIdentity }}>
      {children}
    </PageIdentityContext.Provider>
  );
}

/** TopBar reads the current page identity here. */
export function usePageIdentity(): PageIdentity | null {
  const ctx = useContext(PageIdentityContext);
  return ctx?.identity ?? null;
}

/**
 * Routes call this from inside PageLayout to publish their identity.
 * Effect-based so the identity stays in sync with prop changes; the
 * cleanup clears the identity on unmount so brief flashes of "stale"
 * identity don't appear during route transitions.
 */
export function useRegisterPageIdentity(identity: PageIdentity) {
  const ctx = useContext(PageIdentityContext);
  // Stringify so the effect deps capture nested-object equality
  // without forcing parents to memoize the menu nodes / handlers.
  // We hash the menu by its keys + labels — that's what visually
  // changes between routes; click handlers are stable closures.
  const menuKey = identity.menuItems
    ? identity.menuItems
        .map((it) =>
          "divider" in it ? `div:${it.key}` : `${it.key}:${it.label}`,
        )
        .join("|")
    : "";
  const key = JSON.stringify({
    title: identity.title,
    subtitle: identity.subtitle,
    parentLabel: identity.parentLabel,
    menuLabel: identity.menuLabel,
    menuKind: identity.menuKind,
    menuKey,
  });
  useEffect(() => {
    ctx?.setIdentity(identity);
    return () => ctx?.setIdentity(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    key,
    identity.entityAction,
    identity.onParentClick,
    identity.onTitleClick,
    identity.menuItems,
  ]);
}
