import { clsx } from "clsx";

// ── Toggle row ──────────────────────────────────────────────────

interface ToggleRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
      <div className="flex flex-col gap-0.5">
        <span className="text-fg-2">{label}</span>
        {description && (
          <span className="text-[10px] text-fg-4">{description}</span>
        )}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative w-9 h-5 rounded-full transition-colors cursor-pointer shrink-0 ml-4",
          checked ? "bg-accent" : "bg-base-350",
        )}
      >
        <span
          className={clsx(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </div>
  );
}

// ── Segmented row ───────────────────────────────────────────────

interface SegmentedRowProps<T extends string> {
  label: string;
  description?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SegmentedRow<T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: SegmentedRowProps<T>) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
      <div className="flex flex-col gap-0.5">
        <span className="text-fg-2">{label}</span>
        {description && (
          <span className="text-[10px] text-fg-4">{description}</span>
        )}
      </div>
      <div className="inline-flex items-center rounded bg-base-200 border border-edge overflow-hidden shrink-0 ml-4">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={clsx(
              "px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider transition-colors cursor-pointer leading-none",
              value === opt.value
                ? "bg-accent/15 text-accent"
                : "text-fg-3 hover:text-fg-2",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Slider row ──────────────────────────────────────────────────

interface SliderRowProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue?: string;
  onChange: (value: number) => void;
}

export function SliderRow({
  label,
  description,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
}: SliderRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
      <div className="flex flex-col gap-0.5">
        <span className="text-fg-2">{label}</span>
        {description && (
          <span className="text-[10px] text-fg-4">{description}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-4">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 h-1 accent-accent cursor-pointer"
        />
        <span className="text-[10px] text-fg-3 w-10 text-right tabular-nums">
          {displayValue ?? value}
        </span>
      </div>
    </div>
  );
}

// ── Display row (read-only) ─────────────────────────────────────

interface DisplayRowProps {
  label: string;
  value: string;
  valueClass?: string;
}

export function DisplayRow({ label, value, valueClass }: DisplayRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[12px] font-mono">
      <span className="text-fg-3">{label}</span>
      <span className={valueClass ?? "text-fg-2"}>{value}</span>
    </div>
  );
}

// ── Section card ────────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="border border-edge rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-edge bg-surface-2 text-[11px] font-mono font-semibold uppercase tracking-widest text-fg-3">
        {title}
      </div>
      <div className="divide-y divide-edge">{children}</div>
    </div>
  );
}

// ── Reset button ────────────────────────────────────────────────

interface ResetButtonProps {
  label?: string;
  onClick: () => void;
}

export function ResetButton({
  label = "Reset to defaults",
  onClick,
}: ResetButtonProps) {
  return (
    <button
      onClick={onClick}
      className="text-[11px] font-mono uppercase tracking-wider px-3 py-1.5 rounded border border-edge text-fg-3 hover:text-fg-2 hover:border-fg-4 transition-colors cursor-pointer"
    >
      {label}
    </button>
  );
}
