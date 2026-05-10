/**
 * OverflowMenu — accessible "..." dropdown menu for contextual actions.
 *
 * Used on source pages (channels and widgets) to expose Configure,
 * Display preferences, ticker management, and Remove without
 * stealing screen real estate via a tab band. Feed becomes the
 * single visible page; secondary actions live behind the menu.
 *
 * Built on @floating-ui/react for positioning + a11y wiring. Items
 * render as buttons with optional icon, label, and a "destructive"
 * variant for Remove. A `divider: true` item renders a thin
 * separator. Pressing Escape or clicking outside closes the menu;
 * Enter/Space activates an item.
 */
import { useState, useRef, cloneElement } from "react";
import type { ReactElement, ReactNode, Ref } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useRole,
  useInteractions,
  useListNavigation,
  useTypeahead,
  useTransitionStyles,
  FloatingFocusManager,
  FloatingPortal,
} from "@floating-ui/react";
import type { Placement } from "@floating-ui/react";
import clsx from "clsx";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Item types ──────────────────────────────────────────────────

export type OverflowMenuItem =
  | {
      key: string;
      label: string;
      icon?: LucideIcon;
      onSelect: () => void;
      destructive?: boolean;
      disabled?: boolean;
      /** Optional small caption shown beneath the label. */
      hint?: string;
    }
  | { key: string; divider: true };

// ── Props ───────────────────────────────────────────────────────

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  /** Tooltip + aria label for the trigger button. Default: "More". */
  triggerLabel?: string;
  /** Custom trigger element. If omitted, a default "..." icon button renders. */
  trigger?: ReactElement<{ ref?: Ref<HTMLElement> }>;
  /** Preferred menu placement. Default: "bottom-end". */
  placement?: Placement;
}

// ── Component ───────────────────────────────────────────────────

export default function OverflowMenu({
  items,
  triggerLabel = "More",
  trigger,
  placement = "bottom-end",
}: OverflowMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  // useListNavigation index tracks position within `items`. Dividers
  // and disabled rows have null refs so keyboard nav skips them.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const listRef = useRef<Array<HTMLElement | null>>([]);

  const labels = items.map((it) =>
    "divider" in it ? null : it.label,
  );

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement,
    transform: false,
    middleware: [
      offset(4),
      flip({ fallbackAxisSideDirection: "end" }),
      shift({ padding: 8 }),
    ],
    whileElementsMounted: autoUpdate,
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const listNav = useListNavigation(context, {
    listRef,
    activeIndex,
    onNavigate: setActiveIndex,
  });
  const typeahead = useTypeahead(context, {
    listRef: { current: labels },
    activeIndex,
    onMatch: isOpen ? setActiveIndex : undefined,
  });

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([
    click,
    dismiss,
    role,
    listNav,
    typeahead,
  ]);

  const { isMounted, styles: transitionStyles } = useTransitionStyles(context, {
    duration: 120,
    initial: { opacity: 0, transform: "translateY(-4px) scale(0.97)" },
    open: { opacity: 1, transform: "translateY(0) scale(1)" },
  });

  // Default trigger: a 28px square ghost button with a 3-dot icon.
  const defaultTrigger: ReactNode = (
    <button
      type="button"
      aria-label={triggerLabel}
      className="w-7 h-7 flex items-center justify-center rounded-md text-fg-3 hover:text-fg hover:bg-surface-hover transition-colors"
    >
      <MoreHorizontal size={15} />
    </button>
  );

  return (
    <>
      {cloneElement(
        (trigger ?? defaultTrigger) as ReactElement<{ ref?: Ref<HTMLElement> }>,
        {
          ref: refs.setReference,
          ...getReferenceProps(),
        },
      )}

      <FloatingPortal>
        {isMounted && (
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              style={{ ...floatingStyles, ...transitionStyles }}
              {...getFloatingProps()}
              className="z-50 min-w-[200px] py-1 rounded-lg border border-edge/60 bg-surface-2 shadow-lg shadow-black/30 outline-none"
            >
              {items.map((item, i) => {
                if ("divider" in item) {
                  return (
                    <div
                      key={item.key}
                      role="separator"
                      className="my-1 h-px bg-edge/40"
                    />
                  );
                }

                const Icon = item.icon;
                const isActive = activeIndex === i;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    ref={(node) => {
                      listRef.current[i] = node;
                    }}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect();
                      setIsOpen(false);
                    }}
                    {...getItemProps()}
                    className={clsx(
                      "flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] transition-colors outline-none",
                      item.disabled && "opacity-40 cursor-not-allowed",
                      !item.disabled && item.destructive
                        ? isActive
                          ? "bg-error/10 text-error"
                          : "text-error hover:bg-error/10"
                        : isActive
                          ? "bg-accent/10 text-fg"
                          : "text-fg-2 hover:bg-surface-hover",
                    )}
                  >
                    {Icon && (
                      <Icon
                        size={13}
                        className="shrink-0"
                        aria-hidden
                      />
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.hint && (
                        <span className="block truncate text-[10px] text-fg-4 mt-0.5">
                          {item.hint}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </FloatingFocusManager>
        )}
      </FloatingPortal>
    </>
  );
}
