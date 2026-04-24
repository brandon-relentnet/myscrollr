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
  pinRow: number;
  togglePin: (pinned: boolean) => void;
  setPinSide: (side: PinSide) => void;
  setPinRow: (row: number) => void;
}

export function useWidgetPin(
  widgetId: string,
  prefs: AppPreferences,
  onPrefsChange: (prefs: AppPreferences) => void,
): UseWidgetPinResult {
  const pinConfig = prefs.widgets.pinnedWidgets[widgetId];
  const isPinned = !!pinConfig;
  const pinSide = pinConfig?.side ?? "left";
  const pinRow = pinConfig?.row ?? 0;

  const togglePin = useCallback(
    (pinned: boolean) => {
      const pw = { ...prefs.widgets.pinnedWidgets };
      if (pinned) {
        pw[widgetId] = { side: pinSide, row: pinRow };
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
    [prefs, pinSide, pinRow, onPrefsChange, widgetId],
  );

  const setPinSide = useCallback(
    (side: PinSide) => {
      const pw = { ...prefs.widgets.pinnedWidgets, [widgetId]: { side, row: pinRow } };
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, pinRow, onPrefsChange, widgetId],
  );

  const setPinRow = useCallback(
    (row: number) => {
      const pw = { ...prefs.widgets.pinnedWidgets, [widgetId]: { side: pinSide, row } };
      const next: AppPreferences = {
        ...prefs,
        widgets: { ...prefs.widgets, pinnedWidgets: pw },
      };
      onPrefsChange(next);
      savePrefs(next);
    },
    [prefs, pinSide, onPrefsChange, widgetId],
  );

  return { isPinned, pinSide, pinRow, togglePin, setPinSide, setPinRow };
}
