import { Zap } from "lucide-react";

interface WizardShellProps {
  /** Current step index (0-based). */
  stepIndex: number;
  /** Total number of steps. */
  totalSteps: number;
  /** Title shown above the step content. */
  title: string;
  /** Subtitle shown below the title. */
  subtitle?: string;
  /** Step content. */
  children: React.ReactNode;
  /** Show the Back button. */
  showBack?: boolean;
  /** Label for the forward button. Default: "Next". */
  nextLabel?: string;
  /** Whether the forward button is disabled. */
  nextDisabled?: boolean;
  /** Show a Skip button alongside Next. */
  showSkip?: boolean;
  onBack?: () => void;
  onNext: () => void;
  onSkip?: () => void;
}

export default function WizardShell({
  stepIndex,
  totalSteps,
  title,
  subtitle,
  children,
  showBack = false,
  nextLabel = "Next",
  nextDisabled = false,
  showSkip = false,
  onBack,
  onNext,
  onSkip,
}: WizardShellProps) {
  return (
    <div className="flex flex-col h-screen w-screen select-none">
      {/* Draggable region */}
      <div data-tauri-drag-region className="shrink-0 h-8" />

      {/* Progress bar */}
      <div className="shrink-0 px-8">
        <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col items-center overflow-y-auto px-8 py-8">
        <div className="w-full max-w-lg">
          {/* Logo + step title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-accent" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-fg">{title}</h2>
              {subtitle && (
                <p className="text-xs text-fg-4 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          {children}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="shrink-0 flex items-center justify-between px-8 py-4 border-t border-edge">
        <div>
          {showBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg text-sm text-fg-3 hover:text-fg-2 hover:bg-surface-hover transition-colors"
            >
              Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {showSkip && (
            <button
              onClick={onSkip}
              className="px-4 py-2 rounded-lg text-sm text-fg-4 hover:text-fg-3 transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={onNext}
            disabled={nextDisabled}
            className="px-6 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
