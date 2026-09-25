import clsx from "clsx";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  // Screen readers need a name when there's no visible label wired to it.
  label: string;
  // md: 40 x 24, Settings rows. sm: 38 x 22, inside pop-ups.
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

// On: accent track, accent-ink knob. Off: panel2 track, muted knob. The pill
// sits in a 44px-tall button so it's easy to hit.
export function Switch({ checked, onChange, label, size = "md", disabled, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx("flex h-11 min-w-11 shrink-0 items-center justify-center disabled:opacity-50", className)}
    >
      <span
        className={clsx(
          "flex rounded-full p-[3px] transition-colors duration-150",
          size === "md" ? "h-6 w-10" : "h-[22px] w-[38px]",
          checked ? "bg-accent" : "bg-panel2",
        )}
      >
        <span
          className={clsx(
            "rounded-full transition-[transform,background-color] duration-150",
            size === "md" ? "h-[18px] w-[18px]" : "h-4 w-4",
            checked ? "translate-x-4 bg-accent-ink" : "bg-muted",
          )}
        />
      </span>
    </button>
  );
}
