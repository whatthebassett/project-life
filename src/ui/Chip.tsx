import clsx from "clsx";
import type { ReactNode } from "react";

type Variant =
  // #design, #onboarding: accent on accent-soft.
  | "tag"
  // Panel with a border: "Checkpoint / Design", due-date chips.
  | "outline"
  // Rounded filter pills (news topics, note filters). Selected turns solid.
  | "pill"
  // On/off choices like reminders. On is accent on accent-soft.
  | "toggle"
  // Dashed suggestions: goal ideas, "+ Tag".
  | "dashed";

interface Props {
  variant?: Variant;
  selected?: boolean;
  // A small colored square before the label (list and calendar colors).
  dot?: string;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}

const base: Record<Variant, string> = {
  tag: "h-7 px-[10px] rounded-[8px] text-12 font-medium bg-accent-soft text-accent",
  outline: "h-7 px-[10px] rounded-[8px] text-12 bg-panel border border-line text-muted",
  pill: "h-[30px] px-3 rounded-full text-12 font-medium border",
  toggle: "h-[34px] px-3 rounded-[10px] text-13 font-medium border",
  dashed: "h-7 px-[10px] rounded-[8px] text-12 border border-dashed border-line text-muted",
};

function stateClass(variant: Variant, selected: boolean) {
  if (variant === "pill") return selected ? "bg-text text-bg border-text" : "border-line text-muted hover:text-text";
  if (variant === "toggle") return selected ? "bg-accent-soft text-accent border-transparent" : "border-line text-muted hover:text-text";
  return "";
}

// Chips and tags, 26 to 34px tall. With onClick it's a button; with
// `selected` as well it reports pressed/not pressed.
export function Chip({ variant = "tag", selected = false, dot, onClick, className, children }: Props) {
  const classes = clsx(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors duration-150",
    base[variant],
    stateClass(variant, selected),
    className,
  );
  const content = (
    <>
      {dot && <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: dot }} />}
      {children}
    </>
  );
  if (!onClick) return <span className={classes}>{content}</span>;
  return (
    <button type="button" className={classes} onClick={onClick} aria-pressed={variant === "pill" || variant === "toggle" ? selected : undefined}>
      {content}
    </button>
  );
}
