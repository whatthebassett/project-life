import { useRef } from "react";
import { Sparkles, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import Dialog from "../components/Dialog";
import { motionReduced } from "../lib/motion";
import { releases, type Release } from "./releases";

type Kind = "features" | "fixes" | "known";

// Each kind of note has its own color from the theme, so they suit all four.
const kinds: Record<Kind, { label: string; icon: LucideIcon; color: string; soft: string }> = {
  features: { label: "Features", icon: Sparkles, color: "var(--accent)", soft: "var(--accent-soft)" },
  fixes: { label: "Defect fixes", icon: Wrench, color: "var(--accent2)", soft: "var(--accent2-soft)" },
  known: { label: "Known issues", icon: TriangleAlert, color: "var(--warn)", soft: "var(--warn-soft)" },
};

// Settings → About → What's new: every release, newest first.
export default function ReleaseNotes({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="What’s new" width={620} onClose={onClose}>
      <div className="flex flex-col gap-10">
        {releases.map((r, i) => (
          <ReleaseView key={r.version} release={r} latest={i === 0} />
        ))}
      </div>
    </Dialog>
  );
}

function ReleaseView({ release: r, latest }: { release: Release; latest: boolean }) {
  const sections = useRef<Partial<Record<Kind, HTMLElement | null>>>({});
  const counts: Record<Kind, number> = {
    features: r.features.reduce((n, g) => n + g.items.length, 0),
    fixes: r.fixes.length,
    known: r.known.length,
  };
  const shown = (Object.keys(kinds) as Kind[]).filter((k) => counts[k] > 0);
  const [y, m, d] = r.date.split("-").map(Number);
  const date = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <article className="flex flex-col gap-7">
      <header
        className="relative overflow-hidden rounded-[20px] border border-line px-6 pt-5 pb-6"
        style={{ background: "linear-gradient(135deg, var(--accent-soft) 0%, var(--accent2-soft) 55%, var(--warn-soft) 100%)" }}
      >
        {/* A soft glow in the corner. */}
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl" style={{ background: "var(--glow)" }} />
        <div className="relative flex flex-wrap items-center gap-2 text-12 text-muted">
          <span className="rounded-full border border-line bg-panel px-2.5 py-0.5 font-mono text-11 text-text">v{r.version}</span>
          <span>{date}</span>
          {latest && (
            <span className="rounded-full px-2.5 py-0.5 text-11 font-semibold" style={{ background: "var(--accent)", color: "var(--accent-ink)" }}>
              Latest
            </span>
          )}
        </div>
        <h3
          className="relative m-0 mt-3 w-fit font-head text-40 leading-[1.1] font-extrabold tracking-[-0.02em]"
          style={{ backgroundImage: "linear-gradient(90deg, var(--accent), var(--accent2))", backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" }}
        >
          {r.name}
        </h3>
        <p className="relative m-0 mt-2 max-w-[46ch] leading-[1.5] text-muted">{r.summary}</p>
        <div className="relative mt-5 flex flex-wrap gap-2">
          {shown.map((k) => (
            <Badge key={k} kind={k} count={counts[k]} onClick={() => sections.current[k]?.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth", block: "start" })} />
          ))}
        </div>
      </header>

      {r.features.length > 0 && (
        <section ref={(el) => void (sections.current.features = el)} className="flex scroll-mt-2 flex-col gap-4">
          <SectionHead kind="features" count={counts.features} />
          <div className="grid gap-3">
            {r.features.map((g) => (
              <div key={g.area} className="rounded-[14px] border border-line bg-panel px-4 py-3.5">
                <div className="mb-2 text-11 font-semibold tracking-[0.08em] uppercase" style={{ color: kinds.features.color }}>
                  {g.area}
                </div>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 leading-[1.5]">
                  {g.items.map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: kinds.features.color }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {(["fixes", "known"] as const).map(
        (k) =>
          r[k].length > 0 && (
            <section key={k} ref={(el) => void (sections.current[k] = el)} className="flex scroll-mt-2 flex-col gap-4">
              <SectionHead kind={k} count={counts[k]} />
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {r[k].map((n) => (
                  <li key={n.text} className="flex gap-3 rounded-[14px] border border-line bg-panel py-3 pr-4 pl-3">
                    <span aria-hidden className="w-1 shrink-0 rounded-full" style={{ background: kinds[k].color }} />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-11 font-semibold tracking-[0.08em] text-muted uppercase">{n.area}</span>
                      <span className="leading-[1.5]">{n.text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </article>
  );
}

function Badge({ kind, count, onClick }: { kind: Kind; count: number; onClick?: () => void }) {
  const { label, icon: Icon, color, soft } = kinds[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Go to ${label.toLowerCase()}`}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border pr-1.5 pl-3 text-12 font-semibold transition-[filter] duration-150 hover:brightness-110"
      style={{ background: soft, color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      <Icon size={14} strokeWidth={2.4} />
      {label}
      <span className="ml-0.5 min-w-5 rounded-full px-1.5 py-px text-center text-11 font-bold" style={{ background: color, color: "var(--accent-ink)" }}>
        {count}
      </span>
    </button>
  );
}

function SectionHead({ kind, count }: { kind: Kind; count: number }) {
  const { label, icon: Icon, color, soft } = kinds[kind];
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-12 font-semibold" style={{ background: soft, color }}>
        <Icon size={14} strokeWidth={2.4} />
        {label}
      </span>
      <span className="text-12 text-muted">{count}</span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
