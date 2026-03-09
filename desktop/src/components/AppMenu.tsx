import { useEffect, useRef } from "react";

interface AppMenuProps {
  onClose: () => void;
  onSettings: () => void;
  onQuit: () => void;
  topOffset: number;
}

export default function AppMenu({
  onClose,
  onSettings,
  onQuit,
  topOffset,
}: AppMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest("[data-app-menu-trigger]")
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  const itemClass =
    "flex items-center gap-2.5 w-full px-3 py-2 text-left text-[12px] font-mono text-fg-2 hover:bg-surface-hover transition-colors cursor-pointer";

  return (
    <div
      ref={panelRef}
      className="fixed right-3 z-50 min-w-[150px] rounded-lg border border-edge bg-surface shadow-soft-md"
      style={{ top: `${topOffset}px` }}
    >
      <div className="py-1">
        <button
          onClick={() => {
            onSettings();
            onClose();
          }}
          className={itemClass}
        >
          <span className="text-fg-3 text-[14px] leading-none">&#x2699;</span>
          Settings
        </button>
        <div className="mx-2 my-1 h-px bg-edge" />
        <button
          onClick={() => {
            onQuit();
            onClose();
          }}
          className={`${itemClass} text-red-400 hover:text-red-300`}
        >
          <span className="text-[14px] leading-none">&#x2715;</span>
          Quit
        </button>
      </div>
    </div>
  );
}
