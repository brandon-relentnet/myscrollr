/**
 * Shared layout wrapper for widget ConfigPanels.
 *
 * Renders the colored icon + title header, children (the actual
 * settings sections), and the reset button footer. Eliminates
 * ~20 lines of identical wrapper JSX from each ConfigPanel.
 */
import { ResetButton } from "./SettingsControls";

interface ConfigPanelLayoutProps {
  icon: React.ReactNode;
  hex: string;
  title: string;
  subtitle: string;
  onReset: () => void;
  children: React.ReactNode;
}

export default function ConfigPanelLayout({
  icon,
  hex,
  title,
  subtitle,
  onReset,
  children,
}: ConfigPanelLayoutProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 px-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `color-mix(in srgb, ${hex} 15%, transparent)` }}
        >
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold text-fg">{title}</h2>
          <p className="text-[11px] text-fg-4">{subtitle}</p>
        </div>
      </div>

      {children}

      {/* Reset footer */}
      <div className="flex items-center justify-end pt-2 px-3">
        <ResetButton onClick={onReset} />
      </div>
    </div>
  );
}
