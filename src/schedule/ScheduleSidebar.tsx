import clsx from "clsx";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Copy, FileText, Plus, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import { openUrl, titleOf } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import type { TaskList } from "../tasks/lists";
import { SectionLabel } from "../ui/bits";
import { toast } from "../ui/Toast";
import { patchEvent } from "./actions";
import { fromStamp, type CalEvent, type CallKind, type Occurrence } from "./events";
import { joinState, rangeLabel } from "./look";
import { monthGrid } from "./MonthView";

export interface CalendarRow {
  id: string;
  name: string;
  color: string;
  count: number;
  on: boolean;
}

interface Props {
  now: Date;
  // The day the view is on, and the days that have something on them.
  focus: Date;
  weekStart: Date;
  busy: Set<string>;
  onPickDay: (d: Date) => void;
  calendars: CalendarRow[];
  onToggle: (id: string) => void;
  onNew: () => void;
  quickPreview: (text: string) => CalEvent | null;
  onQuickAdd: (text: string) => void;
  selected: Occurrence | null;
  calendarOf: (id: string) => TaskList;
  onEdit: (o: Occurrence) => void;
}

// Schedule's left panel (Calendar.dc.html): quick add, the mini month, the
// calendars, and the selected event with its call and note.
export default function ScheduleSidebar(props: Props) {
  const { now, focus, weekStart, busy, calendars, selected } = props;
  const [draft, setDraft] = useState("");
  const [month, setMonth] = useState(() => new Date(focus.getFullYear(), focus.getMonth(), 1));
  const [shownFor, setShownFor] = useState(ymd(focus));
  // Follow the view to another month.
  if (ymd(focus) !== shownFor) {
    setShownFor(ymd(focus));
    if (focus.getMonth() !== month.getMonth() || focus.getFullYear() !== month.getFullYear()) setMonth(new Date(focus.getFullYear(), focus.getMonth(), 1));
  }
  const preview = draft.trim() ? props.quickPreview(draft) : null;
  const grid = monthGrid(month);
  const rows = grid.slice(35).some((d) => d.getMonth() === month.getMonth()) ? 42 : 35;
  const weekEnd = addDays(weekStart, 7);

  const whenOf = (e: CalEvent) => {
    const day = fromYmd(e.Start.slice(0, 10));
    const d = day.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    return e.AllDay ? `${d} · All day` : `${d} · ${rangeLabel({ start: fromStamp(e.Start), end: fromStamp(e.End) })}`;
  };

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-side px-[18px] py-[22px]">
      <div className="flex items-center justify-between px-1">
        <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">Schedule</h1>
        <button aria-label="New event" title="New event" onClick={props.onNew} className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink">
          <Plus size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="pl-qa" className={clsx("flex h-11 items-center gap-2.5 rounded-[13px] border bg-panel px-3 text-muted", preview ? "border-accent" : "border-line")}>
          <Sparkles size={16} strokeWidth={1.8} />
          <input
            id="pl-qa"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                props.onQuickAdd(draft);
                setDraft("");
              } else if (e.key === "Escape") setDraft("");
            }}
            placeholder="Haircut sat 3pm"
            aria-label="Quick add event"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-13 text-text outline-none placeholder:text-muted/80"
          />
        </label>
        {preview ? (
          <div aria-live="polite" className="flex items-center justify-between gap-2 rounded-[11px] bg-accent-soft px-2.5 py-2 text-12">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-semibold">{preview.Title}</span>
              <span className="text-muted">{whenOf(preview)}</span>
            </span>
            <span className="font-mono text-11 whitespace-nowrap text-accent">Enter</span>
          </div>
        ) : (
          <div className="px-1 text-12 text-muted">Type it like you'd say it. Dates and times are picked up automatically.</div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-14 font-semibold">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
          <div className="flex gap-0.5 text-muted">
            <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] hover:bg-panel hover:text-text">
              <ChevronLeft size={14} strokeWidth={2.2} />
            </button>
            <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] hover:bg-panel hover:text-text">
              <ChevronRight size={14} strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {["M", "T", "W", "T", "F", "S", "S"].map((h, i) => (
            <span key={i} className="flex h-[22px] items-center justify-center font-mono text-10 text-muted">
              {h}
            </span>
          ))}
          {grid.slice(0, rows).map((d) => {
            const key = ymd(d);
            const today = key === ymd(now);
            const inMonth = d.getMonth() === month.getMonth();
            const inWeek = d >= weekStart && d < weekEnd;
            return (
              <button
                key={key}
                aria-label={d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
                onClick={() => props.onPickDay(d)}
                className={clsx(
                  "flex h-[30px] flex-col items-center justify-center gap-0.5 rounded-[10px] text-12",
                  today ? "bg-accent font-semibold text-accent-ink" : inWeek ? "bg-panel" : "hover:bg-panel",
                  !today && (inMonth ? "text-text" : "text-faint"),
                )}
              >
                {d.getDate()}
                <span className="h-1 w-1 rounded-full" style={{ background: busy.has(key) && !today && inMonth ? "var(--accent2)" : "transparent" }} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <SectionLabel className="px-1 pb-1.5">CALENDARS</SectionLabel>
        {calendars.map((c) => (
          <button
            key={c.id}
            role="checkbox"
            aria-checked={c.on}
            onClick={() => props.onToggle(c.id)}
            className={clsx("flex h-9 items-center gap-3 rounded-[10px] px-1.5 text-left text-13 hover:bg-panel", c.on ? "text-text" : "text-muted")}
          >
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] text-accent-ink"
              style={{ border: `1.5px solid ${c.color}`, background: c.on ? c.color : "transparent" }}
            >
              {c.on && <Check size={11} strokeWidth={3.4} />}
            </span>
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="font-mono text-11 text-muted">{c.count}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {selected ? <SelectedCard occ={selected} now={now} calendarOf={props.calendarOf} onEdit={() => props.onEdit(selected)} /> : null}
    </aside>
  );
}

const providers: { id: CallKind | "none"; label: string }[] = [
  { id: "none", label: "None" },
  { id: "teams", label: "Teams" },
  { id: "meet", label: "Meet" },
  { id: "zoom", label: "Zoom" },
];

function SelectedCard({ occ, now, calendarOf, onEdit }: { occ: Occurrence; now: Date; calendarOf: (id: string) => TaskList; onEdit: () => void }) {
  const n = useNotes();
  const e = occ.event;
  const cal = calendarOf(e.Calendar);
  const join = joinState(occ, now);
  const meta = e.Place || e.Description?.split("\n").find((l) => l.trim()) || (e.Kind === "focus" ? "Focus time" : e.Kind === "reminder" ? "Reminder" : "");
  const day = occ.start.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  const primary = join.call
    ? {
        label: join.label,
        solid: join.live && Boolean(join.url),
        onClick: () => (join.url ? void openUrl(join.url) : onEdit()),
      }
    : e.Note
      ? { label: "Open note", solid: true, onClick: () => void n.activate(e.Note!) }
      : null;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: cal.color }} />
        <span className="font-mono text-11 tracking-[0.1em] text-muted uppercase">{cal.name}</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-17 font-semibold tracking-[-0.01em]">{e.Title || "Untitled event"}</div>
        <div className="text-13 text-muted">
          {day} · {rangeLabel(occ, e.AllDay)}
        </div>
      </div>
      {!join.call && meta && <div className="line-clamp-2 text-13 text-text">{meta}</div>}
      {join.call && join.url && (
        <div className="flex h-9 items-center gap-2.5 rounded-[11px] border border-dashed border-line pr-1.5 pl-2.5">
          <Video size={15} strokeWidth={2} className="shrink-0 text-accent2" />
          <span className="min-w-0 flex-1 truncate font-mono text-11 text-muted">{join.url.replace(/^https?:\/\//, "")}</span>
          <button
            aria-label="Copy meeting link"
            title="Copy link"
            onClick={() => void navigator.clipboard?.writeText(join.url!).then(() => toast("Copied the meeting link"))}
            className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted hover:bg-panel2 hover:text-text"
          >
            <Copy size={14} strokeWidth={1.9} />
          </button>
        </div>
      )}
      {e.Note && (
        <button onClick={() => void n.activate(e.Note!)} className="flex items-center gap-2.5 rounded-[12px] bg-panel2 p-2.5 text-left text-13 hover:brightness-110">
          <FileText size={16} strokeWidth={1.8} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">{titleOf(e.Note)}</span>
          <ArrowRight size={14} strokeWidth={2} className="text-muted" />
        </button>
      )}
      {e.Kind !== "reminder" && (
        <div className="flex items-center gap-2">
          <span className="w-10 text-12 text-muted">Video</span>
          <div role="radiogroup" aria-label="Video call" className="grid flex-1 grid-cols-4 gap-1 rounded-[11px] bg-panel2 p-[3px]">
            {providers.map((p) => {
              const on = (e.Call ?? "none") === p.id;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => patchEvent(e.Id, { Call: p.id === "none" ? null : p.id })}
                  className={clsx("h-7 rounded-[8px] text-12 font-medium", on ? "bg-panel text-text" : "text-muted hover:text-text")}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          {primary && (
            <button
              onClick={primary.onClick}
              className={clsx(
                "flex h-10 flex-1 items-center justify-center gap-2 rounded-[12px] border border-accent text-13 font-semibold",
                primary.solid ? "bg-accent text-accent-ink" : "bg-transparent text-text hover:bg-panel2",
                join.call && join.ended && "opacity-60",
              )}
            >
              {join.call && <Video size={16} strokeWidth={2} />}
              {primary.label}
            </button>
          )}
          <button onClick={onEdit} className={clsx("h-10 rounded-[12px] border border-line px-3.5 text-13 font-medium hover:bg-panel2", !primary && "flex-1")}>
            Edit
          </button>
        </div>
        {join.hint && <div className="text-center text-11 text-muted">{join.hint}</div>}
      </div>
    </div>
  );
}

