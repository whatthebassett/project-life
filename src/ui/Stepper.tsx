import clsx from "clsx";
import { Icon } from "./icons";

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  // Shown as "5/8" when there's a target (count habits).
  target?: number;
  // The item's color: fills the + button and the count.
  color?: string;
  // habit: on a panel2 track with a filled + (Habits screen). field: on a
  // bordered panel with a panel2 + (targets in the Edit habit pop-up).
  variant?: "habit" | "field";
  decLabel: string;
  incLabel: string;
}

export function Stepper({ value, onChange, min = 0, max = Infinity, step = 1, target, color = "var(--accent)", variant = "habit", decLabel, incLabel }: Props) {
  const habit = variant === "habit";
  const button = habit ? "h-[38px] w-[38px]" : "h-10 w-10";
  return (
    <div className={clsx("flex shrink-0 items-center gap-1 rounded-[14px] p-[3px]", habit ? "bg-panel2" : "border border-line bg-panel")}>
      <button
        type="button"
        aria-label={decLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={clsx(button, "flex items-center justify-center rounded-[11px] text-muted transition-colors hover:text-text disabled:opacity-40")}
      >
        <Icon name="minus" size={14} stroke={2.4} />
      </button>
      <span
        aria-live="polite"
        className={clsx("text-center font-mono font-medium", habit ? "min-w-[54px] text-14" : "min-w-12 text-18")}
      >
        {target != null ? (
          <>
            <span style={{ color }}>{value}</span>/{target}
          </>
        ) : (
          value
        )}
      </span>
      <button
        type="button"
        aria-label={incLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={clsx(button, "flex items-center justify-center rounded-[11px] transition-[filter] hover:brightness-110 disabled:opacity-40", habit ? "text-accent-ink" : "bg-panel2")}
        style={habit ? { background: color } : undefined}
      >
        <Icon name="plus" size={14} stroke={habit ? 2.6 : 2.4} />
      </button>
    </div>
  );
}
