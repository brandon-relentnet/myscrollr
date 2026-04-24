/**
 * Shared ticker pin toggle + side + row selector for widget ConfigPanels.
 *
 * Renders the "Keep in a fixed spot" toggle and conditional "Which side"
 * segmented control, using the useWidgetPin hook. When the ticker has 2+
 * rows, an additional "Which row" selector appears so users can target
 * a specific deck.
 */
import { useMemo } from "react";
import { ToggleRow, SegmentedRow } from "./SettingsControls";
import { useWidgetPin } from "../../hooks/useWidgetPin";
import { PIN_SIDE_OPTIONS } from "../../constants";
import type { AppPreferences } from "../../preferences";

interface TickerPinSectionProps {
  widgetId: string;
  prefs: AppPreferences;
  onPrefsChange: (prefs: AppPreferences) => void;
}

export default function TickerPinSection({
  widgetId,
  prefs,
  onPrefsChange,
}: TickerPinSectionProps) {
  const { isPinned, pinSide, pinRow, togglePin, setPinSide, setPinRow } =
    useWidgetPin(widgetId, prefs, onPrefsChange);

  const rowCount = prefs.appearance.tickerLayout.rows.length;

  // Row selector options — segmented control labelled "Row 1" / "Row 2" / ...
  // Stored as a string in the SegmentedRow value, parsed back to number on change.
  const rowOptions = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, i) => ({
        value: String(i),
        label: `Row ${i + 1}`,
      })),
    [rowCount],
  );

  // If the pin's stored row is out of range (e.g. user downgraded or
  // deleted rows), clamp the displayed value to 0. The underlying data
  // is fixed lazily on next setPinRow — never silently.
  const displayRow = pinRow < rowCount ? pinRow : 0;

  return (
    <>
      <ToggleRow
        label="Keep in a fixed spot"
        description="Stay on one side instead of scrolling across"
        checked={isPinned}
        onChange={togglePin}
      />
      {isPinned && (
        <SegmentedRow
          label="Which side"
          value={pinSide}
          options={PIN_SIDE_OPTIONS}
          onChange={setPinSide}
        />
      )}
      {isPinned && rowCount > 1 && (
        <SegmentedRow
          label="Which row"
          value={String(displayRow)}
          options={rowOptions}
          onChange={(v) => setPinRow(Number(v))}
        />
      )}
    </>
  );
}
