import { clockText } from "../lib/format";
import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";

// A Home card: panel, 1px line border, radius 24 (DESIGN.md §4).
export function Card({ className, style, label, children }: { className?: string; style?: CSSProperties; label?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={clsx("flex min-h-0 flex-col rounded-[24px] border border-line bg-panel", className)} style={style}>
      {children}
    </section>
  );
}

// "Schedule" on the left, a link or count on the right.
export function CardHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="m-0 text-16 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

// The small text links in card headers: "View week", "All notes".
export function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-13 text-muted hover:text-text hover:underline">
      {children}
    </button>
  );
}

// What a card says while it has nothing to show.
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("m-0 text-13 leading-[1.5] text-muted", className)}>{children}</p>;
}

// "9:30 AM"
export function clock(d: Date): string {
  return clockText(d);
}

// "5:00 – 5:45 PM", or "11:30 AM – 12:30 PM" across noon.
export function clockRange(start: Date, end: Date): string {
  const a = clock(start);
  const b = clock(end);
  const same = a.slice(-2) === b.slice(-2);
  return `${same ? a.slice(0, -3) : a} – ${b}`;
}
