import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "lg" | "md" | "sm";

const sizes: Record<Size, string> = {
  // Pop-up footers, Home's Up next.
  lg: "h-11 px-[18px] rounded-[13px] text-14",
  // Headers and side panels.
  md: "h-10 px-[14px] rounded-[12px] text-13",
  // Settings rows.
  sm: "h-[38px] px-[14px] rounded-[11px] text-13",
};

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border border-accent font-semibold hover:brightness-110",
  secondary: "border border-line font-medium hover:bg-panel",
  quiet: "text-muted font-medium hover:text-text hover:bg-panel",
  danger: "border border-danger text-danger font-semibold hover:bg-panel",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  // Shown after the label in mono, like "Ctrl Enter" on a pop-up's main button.
  hint?: string;
  children: ReactNode;
}

export function Button({ variant = "secondary", size = "lg", icon, hint, className, children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap transition-[background-color,filter,color] duration-150 disabled:opacity-50",
        sizes[size],
        variants[variant],
        variant === "primary" && size === "lg" && "px-5",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} stroke={2.2} />}
      {children}
      {hint && <span className="ml-0.5 font-mono text-11 font-medium opacity-75">{hint}</span>}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  // Read out by screen readers and shown as the tooltip.
  label: string;
  size?: 36 | 40 | 44;
  iconSize?: number;
  iconStroke?: number;
  bordered?: boolean;
}

// A square icon-only button: the close X in pop-up headers, pop-out, delete.
// At 36 or 40 it still gets a 44 x 44 hit area.
export function IconButton({ icon, label, size = 40, iconSize = 16, iconStroke = 2, bordered = true, className, title, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={title ?? label}
      className={clsx(
        "relative flex shrink-0 items-center justify-center text-muted transition-colors duration-150 hover:text-text",
        size === 44 ? "h-11 w-11 rounded-[12px]" : size === 40 ? "hit h-10 w-10 rounded-[12px]" : "hit h-9 w-9 rounded-[10px]",
        bordered ? "border border-line hover:bg-panel" : "hover:bg-panel",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={iconSize} stroke={iconStroke} />
    </button>
  );
}
