import type { ReactNode } from "react";

// The layout every screen but Home shares: a list panel (title, views and
// filters), the main area, and sometimes a details panel on the right. The
// widths come from each screen's mockup.
interface Props {
  title: string;
  listWidth: number;
  // Above the main heading, in mono: "FRIDAY, SEPTEMBER 25".
  eyebrow?: string;
  heading?: string;
  detailsWidth?: number;
  children?: ReactNode;
}

export function ScreenFrame({ title, listWidth, eyebrow, heading, detailsWidth, children }: Props) {
  return (
    <>
      <aside className="flex shrink-0 flex-col gap-[22px] border-r border-line bg-side px-4 pt-[22px] pb-[18px]" style={{ width: listWidth }}>
        <div className="flex items-center justify-between px-1.5">
          <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">{title}</h1>
        </div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-8 pt-[26px] pb-8">
        {(eyebrow || heading) && (
          <header className="flex flex-col gap-1.5">
            {eyebrow && <span className="font-mono text-12 tracking-[0.14em] text-muted">{eyebrow}</span>}
            {heading && <h2 className="m-0 font-head text-40 leading-none font-bold tracking-[-0.02em]">{heading}</h2>}
          </header>
        )}
        {children}
      </section>
      {detailsWidth && <aside aria-label="Details" className="shrink-0 border-l border-line bg-side" style={{ width: detailsWidth }} />}
    </>
  );
}

// Stands in for what a later phase builds.
export function ComingSoon({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[24px] border border-dashed border-line px-8 text-center">
      <span className="font-mono text-11 tracking-[0.12em] text-muted">PHASE {phase}</span>
      <span className="max-w-[420px] text-14 leading-[1.5] text-muted">{what} will show up here.</span>
    </div>
  );
}
