import { Cloud, Clock, Cpu, Activity, Github } from "lucide-react";
import clsx from "clsx";

const WIDGET_OPTIONS: { id: string; name: string; description: string; icon: typeof Cloud; hex: string }[] = [
  { id: "weather", name: "Weather", description: "Forecasts for your cities", icon: Cloud, hex: "#38bdf8" },
  { id: "clock", name: "Clock", description: "World clocks and timers", icon: Clock, hex: "#818cf8" },
  { id: "sysmon", name: "System Monitor", description: "CPU, memory, and disk", icon: Cpu, hex: "#4ade80" },
  { id: "uptime", name: "Uptime Kuma", description: "Service health monitoring", icon: Activity, hex: "#fb923c" },
  { id: "github", name: "GitHub Actions", description: "CI/CD workflow status", icon: Github, hex: "#e2e8f0" },
];

interface StepWidgetsProps {
  selected: Set<string>;
  onToggle: (id: string) => void;
}

export default function StepWidgets({ selected, onToggle }: StepWidgetsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {WIDGET_OPTIONS.map((w) => {
        const Icon = w.icon;
        const active = selected.has(w.id);
        return (
          <button
            key={w.id}
            onClick={() => onToggle(w.id)}
            className={clsx(
              "flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all",
              active
                ? "border-accent bg-accent/5"
                : "border-edge hover:border-fg-4 bg-surface-2/50",
            )}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${w.hex}15` }}
            >
              <Icon size={20} style={{ color: w.hex }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-fg">{w.name}</p>
              <p className="text-xs text-fg-4 mt-0.5">{w.description}</p>
            </div>
            {active && (
              <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
