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

  return (
    <div className="space-y-0">
      {FAQ_ITEMS.map((item, i) => {
        const isOpen = expanded.has(i);
        return (
          <div key={i} className="border-b border-edge/30">
            <button
              onClick={() => toggle(i)}
              className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left hover:bg-surface-2/50"
            >
              <span className="text-sm font-medium text-fg">
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
              <p className="px-1 pb-4 pt-1 text-sm text-fg-3">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
