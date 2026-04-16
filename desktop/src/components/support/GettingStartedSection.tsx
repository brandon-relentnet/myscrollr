import { LogIn, LayoutGrid, Settings, Monitor, Puzzle, Zap } from "lucide-react";
import { GETTING_STARTED_STEPS } from "./support-content";

const ICONS: Record<
  string,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  LogIn,
  LayoutGrid,
  Settings,
  Monitor,
  Puzzle,
  Zap,
};

export default function GettingStartedSection() {
  return (
    <div className="space-y-4">
      {GETTING_STARTED_STEPS.map((step, i) => {
        const Icon = ICONS[step.iconName];
        return (
          <div key={i} className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent">
              {i + 1}
            </div>
            {Icon && (
              <div className="mt-1 shrink-0">
                <Icon size={18} className="text-accent" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-fg">{step.title}</p>
              <p className="mt-0.5 text-sm text-fg-3">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
