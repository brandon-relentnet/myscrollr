import { useState, useEffect, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  // Track maximize state for the restore/maximize icon swap
  useEffect(() => {
    appWindow.isMaximized().then(setMaximized).catch(() => {});

    let unlisten: (() => void) | undefined;
    const setup = async () => {
      unlisten = await appWindow.onResized(() => {
        appWindow.isMaximized().then(setMaximized).catch(() => {});
      });
    };
    setup();
    return () => unlisten?.();
  }, []);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    // Only primary button
    if (e.buttons !== 1) return;
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  }, []);

  const btnBase =
    "flex items-center justify-center w-11 h-full transition-colors duration-150";

  return (
    <div
      className="titlebar flex items-center h-9 shrink-0 bg-surface-2 select-none"
      onMouseDown={handleDrag}
    >
      {/* Left spacer — leaves room for sidebar alignment */}
      <div className="flex-1 h-full" />

      {/* Window controls — right side */}
      <div className="flex items-center h-full">
        {/* Minimize */}
        <button
          onClick={() => appWindow.minimize()}
          className={`${btnBase} text-fg-3 hover:text-fg hover:bg-surface-hover`}
          title="Minimize"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <rect fill="currentColor" width="10" height="1" rx="0.5" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button
          onClick={() => appWindow.toggleMaximize()}
          className={`${btnBase} text-fg-3 hover:text-fg hover:bg-surface-hover`}
          title={maximized ? "Restore" : "Maximize"}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {maximized ? (
            // Restore icon — two overlapping rectangles
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect
                x="2"
                y="3"
                width="7"
                height="7"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <path
                d="M3 3V2a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          ) : (
            // Maximize icon — single rectangle
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect
                x="1"
                y="1"
                width="8"
                height="8"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.2"
              />
            </svg>
          )}
        </button>

        {/* Close */}
        <button
          onClick={() => appWindow.close()}
          className={`${btnBase} text-fg-3 hover:text-fg hover:bg-error/80 hover:text-white`}
          title="Close"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M1 1l8 8M9 1l-8 8"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
