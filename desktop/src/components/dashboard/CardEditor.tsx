/**
 * CardEditor — compact toggle/stepper list rendered inside a
 * DashboardCard when the dashboard is in edit mode.
 *
 * Each card type provides a schema of EditorFields (toggles + steppers)
 * and its current prefs slice. Changes are applied immediately.
 */
import { Minus, Plus } from "lucide-react";
import clsx from "clsx";
import type { EditorField } from "./dashboardPrefs";

interface CardEditorProps {
  schema: EditorField[];
  values: Record<string, boolean | number>;
  onChange: (key: string, value: boolean | number) => void;
}

export default function CardEditor({ schema, values, onChange }: CardEditorProps) {
  return (
    <div className="space-y-0.5">
      {schema.map((field) => {
        const parentOff = field.parent != null && !values[field.parent];

        if (field.type === "stepper") {
          const val = (values[field.key] as number) ?? field.min;
          return (
            <div
              key={field.key}
              className={clsx(
                "flex items-center justify-between py-1 rounded-md transition-opacity",
                field.parent && "pl-4",
                parentOff && "opacity-30 pointer-events-none",
              )}
            >
              <span className="text-[11px] text-fg-3 select-none">
                {field.label}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onChange(field.key, Math.max(field.min, val - 1))}
                  disabled={val <= field.min}
                  className="w-5 h-5 flex items-center justify-center rounded bg-surface-3/60 text-fg-3 hover:bg-surface-3 hover:text-fg disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <Minus size={10} />
                </button>
                <span className="text-[11px] font-mono font-semibold text-fg tabular-nums w-4 text-center">
                  {val}
                </span>
                <button
                  onClick={() => onChange(field.key, Math.min(field.max, val + 1))}
                  disabled={val >= field.max}
                  className="w-5 h-5 flex items-center justify-center rounded bg-surface-3/60 text-fg-3 hover:bg-surface-3 hover:text-fg disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <Plus size={10} />
                </button>
              </div>
            </div>
          );
        }

        // Toggle
        const checked = (values[field.key] as boolean) ?? true;
        return (
          <label
            key={field.key}
            className={clsx(
              "flex items-center justify-between py-1 rounded-md cursor-pointer transition-opacity",
              field.parent && "pl-4",
              parentOff && "opacity-30 pointer-events-none",
            )}
          >
            <span className="text-[11px] text-fg-3 select-none">
              {field.label}
            </span>
            <button
              role="switch"
              aria-checked={checked}
              onClick={() => onChange(field.key, !checked)}
              className={clsx(
                "relative w-7 h-4 rounded-full transition-colors shrink-0",
                checked ? "bg-accent" : "bg-surface-3",
              )}
            >
              <span
                className={clsx(
                  "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                  checked && "translate-x-3",
                )}
              />
            </button>
          </label>
        );
      })}
    </div>
  );
}
