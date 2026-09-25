import clsx from "clsx";
import { Icon } from "./icons";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // What it checks off, for screen readers: "Mark done: Pay rent".
  label: string;
  // round: tasks. square: subtasks, note to-dos, and the Home tasks card.
  shape?: "round" | "square";
  // Drawn size: 22 for tasks, 20 for subtasks, 18 for calendar toggles.
  size?: number;
  // Border color while empty: faint, or the task's priority color.
  tone?: string;
  // Fill color once checked: accent, or accent2 for subtasks.
  fill?: string;
  className?: string;
}

// A small visual checkbox inside a 44 x 44 button.
export function Checkbox({ checked, onChange, label, shape = "round", size = 22, tone = "var(--faint)", fill = "var(--accent)", className }: Props) {
  const radius = shape === "round" ? "50%" : size >= 22 ? 7 : 6;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx("flex h-11 w-11 shrink-0 items-center justify-center", className)}
    >
      <span
        className="flex items-center justify-center text-accent-ink transition-colors duration-150"
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          border: `1.5px solid ${checked ? fill : tone}`,
          background: checked ? fill : "transparent",
        }}
      >
        {checked && <Icon name="check" size={Math.round(size * 0.6)} stroke={3.2} />}
      </span>
    </button>
  );
}
