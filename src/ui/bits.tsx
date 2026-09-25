import clsx from "clsx";
import type { ElementType, ReactNode } from "react";

// SCHEDULE, WHY IT MATTERS: Geist Mono 11px, uppercase, 0.12em, muted.
export function SectionLabel({ as: Tag = "span", className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return <Tag className={clsx("font-mono text-11 uppercase tracking-[0.12em] text-muted", className)}>{children}</Tag>;
}

// A bordered group of rows with an optional section label above (Settings).
export function ListGroup({ title, className, children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={clsx("flex flex-col gap-[10px]", className)}>
      {title && <SectionLabel>{title}</SectionLabel>}
      <div className="flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel [&>*+*]:border-t [&>*+*]:border-line">{children}</div>
    </div>
  );
}

// One row: the label (and an optional line of description) on the left, the
// control on the right. 60px tall at least.
export function ListRow({ label, description, danger, children }: { label: ReactNode; description?: ReactNode; danger?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 py-[10px] pr-[14px] pl-[18px]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={clsx("text-14 font-medium", danger ? "text-danger" : "text-text")}>{label}</span>
        {description && <span className="text-12 leading-[1.45] text-muted">{description}</span>}
      </div>
      {children}
    </div>
  );
}

export type PillTone = "done" | "ahead" | "neutral" | "behind";

const pillTones: Record<PillTone, string> = {
  done: "bg-accent2 text-accent-ink",
  ahead: "bg-accent2-soft text-accent2",
  neutral: "bg-panel2 text-text",
  behind: "bg-warn-soft text-warn",
};

// Goal status and similar: 24px, radius 8, 11px semibold.
export function StatusPill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={clsx("inline-flex h-6 shrink-0 items-center rounded-[8px] px-[9px] text-11 font-semibold", pillTones[tone])}>{children}</span>;
}

// Keyboard shortcuts: Geist Mono 12px on panel2 with a 2px bottom edge.
export function KeyCaps({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1", className)} aria-label={keys.join(" + ")}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          aria-hidden="true"
          className="flex h-[30px] min-w-[30px] items-center justify-center rounded-[8px] border border-b-2 border-line bg-panel2 px-2 font-mono text-12"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}
