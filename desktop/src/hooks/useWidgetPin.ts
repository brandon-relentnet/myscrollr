/**
 * Shared hook for widget pin toggle + pin side logic.
 *
 * Extracts the identical pattern repeated in all three widget
 * ConfigPanels (clock, weather, sysmon).
 */
import { useCallback } from "react";
import { savePrefs } from "../preferences";
import type { AppPreferences, PinSide } from "../preferences";

interface UseWidgetPinResult {
  isPinned: boolean;
  pinSide: PinSide;
  togglePin: (pinned: boolean) => void;
  setPinSide: (side: PinSide) => void;
}

export function useWidgetPin(
  widgetId: string,
  prefs: AppPreferences,
  onPrefsChange: (prefs: AppPreferences) => void,
): UseWidgetPinResult {
  const isPinned = !!prefs.widgets.pinnedWidgets[widgetId];
  const pinSide = prefs.widgets.pinnedWidgets[widgetId]?.side ?? "left";

  const togglePin = useCallback(
    (pinned: boolean) => {
      const pw = { ...prefs.widgets.pinnedWidgets };
      if (pinned) {
        pw[widgetId] = { side: pinSide };
      } else {
        delete pw[widgetId];
      }
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, pinSide, onPrefsChange, widgetId],
  );

  const setPinSide = useCallback(
    (side: PinSide) => {
      const pw = { ...prefs.widgets.pinnedWidgets, [widgetId]: { side } };
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, onPrefsChange, widgetId],
  );

  return { isPinned, pinSide, togglePin, setPinSide };
}
