import type { ReactNode } from "react";

interface RingProps {
  // 0 to 1.
  value: number;
  // Box size, ring radius and stroke, as the mockups give them: Home's Today
  // ring is 132 / 54 / 12, the Tasks panel's 60 / 24 / 7, Habits' 54 / 22 / 6.
  size: number;
  radius: number;
  stroke: number;
  color?: string;
  // For screen readers; without one the ring is decoration and the numbers
  // beside it do the talking.
  label?: string;
  // Drawn in the middle, like "67% DONE".
  children?: ReactNode;
}

// Track in panel2, value in accent or accent2, round caps, starting at 12 o'clock.
export function ProgressRing({ value, size, radius, stroke, color = "var(--accent)", label, children }: RingProps) {
  const c = 2 * Math.PI * radius;
  const v = Math.min(1, Math.max(0, value));
  const mid = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role={label ? "img" : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={mid} cy={mid} r={radius} fill="none" stroke="var(--panel2)" strokeWidth={stroke} />
        <circle
          cx={mid}
          cy={mid}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          transform={`rotate(-90 ${mid} ${mid})`}
          style={{ transition: "stroke-dashoffset 400ms ease" }}
          opacity={v === 0 ? 0 : 1}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">{children}</div>}
    </div>
  );
}

interface BarProps {
  // 0 to 100.
  value: number;
  // Where an even pace would be by today, 0 to 100 (goals). Drawn as a 2px marker.
  pace?: number;
  height?: number;
  color?: string;
  label?: string;
  className?: string;
}

// A 10px bar with an optional even-pace marker (goals); thinner ones show
// subtask progress.
export function ProgressBar({ value, pace, height = 10, color = "var(--accent)", label, className }: BarProps) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={`relative block rounded-full bg-panel2 ${className ?? ""}`}
      style={{ height }}
    >
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v}%`, background: color, transition: "width 400ms ease" }} />
      {pace != null && (
        <span
          title="Where you'd be at an even pace"
          className="absolute -top-1 -bottom-1 w-[2px] rounded-[2px] bg-text opacity-55"
          style={{ left: `${Math.min(100, Math.max(0, pace))}%` }}
        />
      )}
    </span>
  );
}
