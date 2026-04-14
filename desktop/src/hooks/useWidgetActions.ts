/**
 * Widget toggle and pin actions.
 *
 * Handles enabling/disabling widgets, toggling their ticker presence,
 * and pinning them to the ticker edges.
 */
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { savePrefs, toggleWidgetOnTicker, toggleWidgetPin } from "../preferences";
import type { AppPreferences } from "../preferences";

interface WidgetActions {
  handleToggleWidgetTicker: (widgetId: string) => void;
  handleToggleWidget: (widgetId: string) => void;
  handleTogglePin: (widgetId: string) => void;
}

export function useWidgetActions(
  prefs: AppPreferences,
  setPrefs: React.Dispatch<React.SetStateAction<AppPreferences>>,
  activeItem: string,
): WidgetActions {
  const navigate = useNavigate();

  const handleToggleWidgetTicker = useCallback(
    (widgetId: string) => {
      const next = toggleWidgetOnTicker(prefs, widgetId);
      setPrefs(next);
      savePrefs(next);
    },
    [prefs, setPrefs],
  );

  const handleToggleWidget = useCallback(
    (widgetId: string) => {
      const enabledWidgets = prefs.widgets.enabledWidgets;
      const isEnabled = enabledWidgets.includes(widgetId);
      const nextEnabled = isEnabled
        ? enabledWidgets.filter((id) => id !== widgetId)
        : [...enabledWidgets, widgetId];
      const nextOnTicker = isEnabled
        ? prefs.widgets.widgetsOnTicker.filter((id) => id !== widgetId)
        : [...prefs.widgets.widgetsOnTicker, widgetId];
      const nextPinned = isEnabled
        ? prefs.pinnedSources.filter((id) => id !== widgetId)
        : prefs.pinnedSources;
      const next: AppPreferences = {
        ...prefs,
        widgets: {
          ...prefs.widgets,
          enabledWidgets: nextEnabled,
          widgetsOnTicker: nextOnTicker,
        },
        pinnedSources: nextPinned,
      };
      setPrefs(next);
      savePrefs(next);

      if (!isEnabled) {
        navigate({
          to: "/widget/$id/$tab",
          params: { id: widgetId, tab: "feed" },
        });
      }
      if (isEnabled && activeItem === widgetId) {
        navigate({ to: "/feed" });
      }
    },
    [prefs, setPrefs, activeItem, navigate],
  );

  const handleTogglePin = useCallback(
    (widgetId: string) => {
      setPrefs((prev) => {
        const updated = toggleWidgetPin(prev, widgetId);
        savePrefs(updated);
        return updated;
      });
    },
    [setPrefs],
  );

  return { handleToggleWidgetTicker, handleToggleWidget, handleTogglePin };
}
