import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { FAQ_ITEMS } from "./support-content";

export default function FAQSection() {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(index: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  // Wraps the question rows in the shared dense-card chrome used
  // by Settings/Catalog so the FAQ list reads as a single panel
  // instead of a flat divider stack.
  return (
    <div className="rounded-xl border border-edge/35 bg-base-150/35 overflow-hidden">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = expanded.has(i);
        return (
          <div
            key={i}
            className={clsx(
              i > 0 && "border-t border-edge/35",
            )}
          >
            <button
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-base-150/50 cursor-pointer"
            >
              <span className="text-ui-body font-medium">
                {item.question}
              </span>
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
              <p className="px-4 pb-4 pt-1 text-ui-meta">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
