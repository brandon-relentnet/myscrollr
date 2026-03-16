/**
 * Shared ticker pin toggle + side selector for widget ConfigPanels.
 *
 * Renders the "Keep in a fixed spot" toggle and conditional "Which side"
 * segmented control, using the useWidgetPin hook. Identical in all 5
 * widget ConfigPanels.
 */
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
  const { isPinned, pinSide, togglePin, setPinSide } = useWidgetPin(widgetId, prefs, onPrefsChange);

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
    </>
  );
}
