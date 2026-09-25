import clsx from "clsx";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

type Size = "sm" | "md" | "lg";

interface Props<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  // Names the group for screen readers ("Group by", "Text size").
  label: string;
  // What the control sits on. On the page background the track is panel with
  // a border and the chosen segment is panel2 (Tasks, Notes, Schedule). On a
  // panel the two swap and the border goes (Settings rows, event details).
  surface?: "bg" | "panel";
  // sm: Settings rows. md: screen headers. lg: pop-up choices like "How
  // you'll measure it".
  size?: Size;
  // Equal-width segments that fill the row.
  fill?: boolean;
  className?: string;
}

const track: Record<Size, string> = {
  sm: "gap-[3px] p-[3px] rounded-[11px]",
  md: "p-[3px] rounded-[12px]",
  lg: "gap-1 p-1 rounded-[13px]",
};

const segment: Record<Size, string> = {
  sm: "h-8 px-3 rounded-[8px] text-12",
  md: "h-8 px-[14px] rounded-[9px] text-13",
  lg: "h-[38px] px-3 rounded-[10px] text-13",
};

// A row of mutually exclusive choices. It's a radio group: Tab lands on the
// chosen segment and the arrow keys move the choice.
export function SegmentedControl<T extends string>({ options, value, onChange, label, surface = "bg", size = "md", fill = false, className }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : step ? (index + step + options.length) % options.length : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(options[to].value);
    refs.current[to]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        fill ? "grid" : "inline-flex w-fit shrink-0",
        track[size],
        surface === "bg" ? "border border-line bg-panel" : "bg-panel2",
        className,
      )}
      style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}
    >
      {options.map((option, i) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              "whitespace-nowrap font-medium transition-colors duration-150",
              segment[size],
              on ? clsx("text-text", surface === "bg" ? "bg-panel2" : "bg-panel") : "text-muted hover:text-text",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
