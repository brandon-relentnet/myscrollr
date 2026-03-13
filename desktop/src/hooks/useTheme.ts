/**
 * Apply theme and UI scale to a shell element.
 *
 * Shared between the app window (#app-shell) and ticker window (#desktop-shell).
 * Handles dark/light/system themes with smooth transitions and prefers-color-scheme
 * media query listening for system mode.
 */
import { useEffect } from "react";
import { savePref, resolveTheme } from "../preferences";
import type { Theme } from "../preferences";

export function useTheme(shellId: string, theme: Theme, uiScale: number): void {
  // ── Theme application ────────────────────────────────────────
  useEffect(() => {
    const shell = document.getElementById(shellId);
    if (!shell) return;

    const resolved = resolveTheme(theme);
    shell.classList.add("theme-transition");
    shell.dataset.theme = resolved;
    const timer = setTimeout(
      () => shell.classList.remove("theme-transition"),
      350,
    );
    savePref("theme", resolved);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (e: MediaQueryListEvent) => {
        shell.dataset.theme = e.matches ? "dark" : "light";
        savePref("theme", e.matches ? "dark" : "light");
      };
      mq.addEventListener("change", handler);
      return () => {
        clearTimeout(timer);
        mq.removeEventListener("change", handler);
      };
    }

    return () => clearTimeout(timer);
  }, [shellId, theme]);

  // ── UI scale application ─────────────────────────────────────
  useEffect(() => {
    const shell = document.getElementById(shellId);
    if (!shell) return;
    shell.style.zoom = uiScale === 100 ? "" : `${uiScale}%`;
  }, [shellId, uiScale]);
}
