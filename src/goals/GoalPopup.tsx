import clsx from "clsx";
import { ArrowRight, CalendarDays, ChevronDown, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import NotePicker from "../components/NotePicker";
import { activeHabits, hueColor, hueSoft, type Habit } from "../habits/model";
import { titleOf } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import type { CalEvent } from "../schedule/events";
import EventPicker from "../schedule/EventPicker";
import TaskPicker from "../schedule/TaskPicker";
import Calendar from "../tasks/Calendar";
import { addDays, daysBetween, fromYmd, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { newId, type Task } from "../tasks/model";
import { Button } from "../ui/Button";
import { Popup } from "../ui/Popup";
import { SectionLabel } from "../ui/bits";
import { fmt, progressOn, valueOn, type Area, type CheckIn, type Goal, type GoalKind, type HabitLink } from "./model";

interface Props {
  goal: Goal;
  isNew: boolean;
  areas: Area[];
  habits: Habit[];
  tasks: Task[];
  events: CalEvent[];
  today: string;
  onSave: (g: Goal) => void;
  onClose: () => void;
}

const short = (d: string) => fromYmd(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: fromYmd(d).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

// The quick due dates: the end of this month (or next, with under two weeks
// left), the end of the year (or next, with under a month left), 90 days.
function dueChoices(today: string): { id: string; label: string; date: string }[] {
  const t = fromYmd(today);
  let monthEnd = new Date(t.getFullYear(), t.getMonth() + 1, 0);
  if (daysBetween(today, ymd(monthEnd)) < 14) monthEnd = new Date(t.getFullYear(), t.getMonth() + 2, 0);
  let yearEnd = new Date(t.getFullYear(), 11, 31);
  if (daysBetween(today, ymd(yearEnd)) < 30) yearEnd = new Date(t.getFullYear() + 1, 11, 31);
  return [
    { id: "month", label: `End of ${monthEnd.toLocaleDateString(undefined, { month: "long" })}`, date: ymd(monthEnd) },
    { id: "year", label: yearEnd.getFullYear() === t.getFullYear() ? "End of year" : `End of ${yearEnd.getFullYear()}`, date: ymd(yearEnd) },
    { id: "90", label: "In 90 days", date: ymd(addDays(t, 90)) },
  ];
}

// The new goal pop-up (GoalNew.dc.html), for editing too: the goal with
// ideas, its area, why it matters, how it's measured, by when, what moves it
// forward, check-ins, and the plan worked out on the right.
export default function GoalPopup({ goal, isNew, areas, habits, tasks, events, today, onSave, onClose }: Props) {
  const n = useNotes();
  const [g, setG] = useState<Goal>(goal);
  const [startText, setStartText] = useState(String(goal.StartValue));
  const [targetText, setTargetText] = useState(String(goal.Target));
  const [msDraft, setMsDraft] = useState("");
  const [calendarAt, setCalendarAt] = useState<DOMRect | null>(null);
  const [picking, setPicking] = useState<"task" | "event" | "note" | null>(null);
  const set = (fields: Partial<Goal>) => setG((cur) => ({ ...cur, ...fields }));

  const area = areas.find((a) => a.Id === g.Area) ?? areas[0];
  const color = hueColor(area.Hue);
  const dues = dueChoices(today);
  const customDue = !dues.some((d) => d.date === g.Due);
  const from = isNew ? today : today > g.StartDate ? today : g.StartDate;
  const days = Math.max(1, daysBetween(from, g.Due));
  const active = activeHabits(habits);

  const startValue = Number(startText) || 0;
  const target = Number(targetText) || 0;
  const draft: Goal = { ...g, StartValue: startValue, Target: target, Step: g.Step };
  const current = isNew ? startValue : valueOn(draft, habits, today);
  const need = Math.max(0, target - current);
  const pct = isNew ? 0 : progressOn(draft, habits, today);

  const idea = (fields: Partial<Goal> & { start?: number; target?: number }) => {
    const { start, target: tg, ...rest } = fields;
    set({ ...rest, Area: areas.some((a) => a.Id === rest.Area) ? rest.Area! : g.Area });
    if (start !== undefined) setStartText(String(start));
    if (tg !== undefined) setTargetText(String(tg));
  };
  const nextYear = new Date().getFullYear() + (new Date().getMonth() >= 9 ? 1 : 0);
  const ideas: { label: string; apply: () => void }[] = [
    { label: "Read 12 books", apply: () => idea({ Title: `Read 12 books in ${nextYear}`, Kind: "number", start: 0, target: 12, Unit: "books", Area: "health", Step: 1 }) },
    {
      label: "Run a 5K",
      apply: () =>
        idea({
          Title: "Run a 5K without stopping",
          Kind: "milestones",
          Area: "health",
          Milestones: ["Walk 3 miles easy", "Run 1 mile", "Run 2 miles", "Race day"].map((Text) => ({ Id: newId(), Text, Due: null, Done: null })),
        }),
    },
    {
      label: "Finish a video series",
      apply: () =>
        idea({ Title: "Finish the video series", Kind: "milestones", Area: "creative", Milestones: ["Script every part", "Film", "Edit part 1", "Publish them all"].map((Text) => ({ Id: newId(), Text, Due: null, Done: null })) }),
    },
    { label: "Save for a trip", apply: () => idea({ Title: "Save for a trip", Kind: "number", start: 0, target: 1500, Unit: "dollars", Area: "home", Step: 50 }) },
  ];

  const toggleHabit = (h: Habit) => {
    const on = g.Habits.some((l) => l.Id === h.Id);
    set({ Habits: on ? g.Habits.filter((l) => l.Id !== h.Id) : [...g.Habits, { Id: h.Id, Count: g.Kind === "number", Per: 1 }] });
  };
  const patchLink = (id: string, fields: Partial<HabitLink>) => set({ Habits: g.Habits.map((l) => (l.Id === id ? { ...l, ...fields } : l)) });

  const addMilestone = () => {
    const text = msDraft.trim();
    if (!text) return;
    set({ Milestones: [...g.Milestones, { Id: newId(), Text: text, Due: null, Done: null }] });
    setMsDraft("");
  };

  // The plan on the right.
  let plan: { big: string; small: string; week: string; day: string };
  if (g.Kind === "number") {
    const perDay = need / days;
    const counted = g.Habits.filter((l) => l.Count && l.Per > 0);
    const first = counted[0] ? active.find((h) => h.Id === counted[0].Id) : null;
    const checkIns = first ? Math.ceil(need / counted[0].Per / (days / 7)) : 0;
    plan = {
      big: need > 0 ? `${fmt(perDay * 7)} ${g.Unit || "a week"}${g.Unit ? " a week" : ""}` : "Already there",
      small: first
        ? `That's about ${checkIns} ${first.Name} check-ins a week at ${fmt(counted[0].Per)} ${g.Unit} each. Check-ins count automatically.`
        : "Log progress whenever you like. You'll see if you're ahead or behind an even pace.",
      week: fmt(perDay * 7),
      day: fmt(perDay),
    };
  } else if (g.Kind === "milestones") {
    const count = Math.max(1, g.Milestones.length);
    plan = {
      big: `${g.Milestones.length} milestones, one every ${Math.round(days / count)} days`,
      small: "Each milestone gets its own date, spaced evenly up to the due date.",
      week: fmt(g.Milestones.length / (days / 7)),
      day: "–",
    };
  } else {
    plan = { big: `Done by ${short(g.Due)}`, small: "A simple finish line. Linked tasks show up here so you can see it moving.", week: "–", day: "–" };
  }

  const linked = [
    ...g.Habits.map((l) => {
      const h = habits.find((x) => x.Id === l.Id);
      return h ? { key: l.Id, name: `Habit: ${h.Name}`, dot: hueColor(h.Hue) } : null;
    }),
    ...g.Tasks.map((id) => {
      const t = tasks.find((x) => x.Id === id);
      return t ? { key: id, name: `Task: ${t.Title}`, dot: listFor(t.List).color } : null;
    }),
    ...g.Events.map((id) => {
      const e = events.find((x) => x.Id === id);
      return e ? { key: id, name: `Event: ${e.Title}`, dot: listFor(e.Calendar).color } : null;
    }),
    ...g.Notes.map((name) => ({ key: name, name: `Note: ${titleOf(name)}`, dot: "var(--accent)" })),
  ].filter((x): x is NonNullable<typeof x> => x !== null);

  const detail = g.Kind === "number" ? `${fmt(current)} / ${target || "?"} ${g.Unit}` : g.Kind === "milestones" ? `${g.Milestones.filter((m) => m.Done).length} of ${g.Milestones.length} milestones` : g.Done ? "Done" : "Not done yet";
  const summary = `${g.Title.trim() || "New goal"} · ${area.Name} · due ${short(g.Due)}${linked.length ? ` · ${linked.length} linked` : ""}`;
  const canSave = Boolean(g.Title.trim()) && (g.Kind !== "number" || target !== startValue);

  const save = () => {
    if (!canSave) return;
    onSave({ ...draft, Title: g.Title.trim(), Unit: g.Unit.trim(), StartDate: isNew ? today : g.StartDate });
  };

  const seg = (options: [GoalKind, string][]) => (
    <div role="radiogroup" aria-label="Measure" className="grid grid-cols-3 gap-1 rounded-[13px] border border-line bg-panel p-1">
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={g.Kind === v} onClick={() => set({ Kind: v })} className={clsx("h-[38px] rounded-[10px] text-13 font-medium", g.Kind === v ? "bg-panel2 text-text" : "text-muted hover:text-text")}>
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <Popup onClose={onClose} onSubmit={save} width={1060} height={920} labelledBy="pl-g-title">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-side pr-4 pl-6">
        <div className="flex items-center gap-3">
          <span className="flex h-[30px] items-center rounded-[9px] border border-line bg-panel px-2.5 font-mono text-11 tracking-[0.08em] text-muted">{isNew ? "NEW GOAL" : "EDIT GOAL"}</span>
          <span className="text-13 text-muted">Something you want to get done, and a way to know you got there.</span>
        </div>
        <button aria-label="Close" title="Close (Esc)" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
          <X size={16} strokeWidth={2.2} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-[22px]">
          <div className="flex flex-col gap-2">
            <label htmlFor="pl-g-title">
              <SectionLabel>THE GOAL</SectionLabel>
            </label>
            <input
              id="pl-g-title"
              autoFocus={isNew}
              value={g.Title}
              onChange={(e) => set({ Title: e.target.value })}
              placeholder="What do you want to achieve?"
              className="h-[50px] rounded-[14px] border border-line bg-panel px-4 font-head text-22 font-bold text-text outline-none placeholder:text-faint focus:border-faint"
            />
            {isNew && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-0.5 text-12 text-muted">Ideas</span>
                {ideas.map((i) => (
                  <button key={i.label} onClick={i.apply} className="h-7 rounded-[8px] border border-dashed border-line px-2.5 text-12 text-muted hover:border-faint hover:text-text">
                    {i.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <SectionLabel>AREA</SectionLabel>
            <div role="radiogroup" aria-label="Area" className="grid grid-cols-4 gap-1.5">
              {areas.map((a) => {
                const on = a.Id === g.Area;
                return (
                  <button
                    key={a.Id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ Area: a.Id })}
                    className="flex h-10 items-center justify-center gap-2 rounded-[11px] border px-3 text-13 font-medium"
                    style={on ? { background: hueSoft(a.Hue), borderColor: hueColor(a.Hue), color: "var(--text)" } : { borderColor: "var(--line)", color: "var(--muted)" }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: hueColor(a.Hue) }} />
                    <span className="truncate">{a.Name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pl-g-why">
              <SectionLabel>WHY IT MATTERS</SectionLabel>
            </label>
            <textarea
              id="pl-g-why"
              rows={3}
              value={g.Why}
              onChange={(e) => set({ Why: e.target.value })}
              placeholder="Why does this matter to you? It shows on the goal when you need a push."
              className="w-full resize-none rounded-[14px] border border-line bg-panel px-4 py-3 text-15 leading-[1.55] text-text outline-none placeholder:text-muted focus:border-faint"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>HOW YOU'LL MEASURE IT</SectionLabel>
            {seg([
              ["number", "Reach a number"],
              ["milestones", "Hit milestones"],
              ["once", "Done or not"],
            ])}
            {g.Kind === "number" && (
              <div className="flex items-end gap-2.5">
                <NumberField label="Starting at" value={startText} onChange={setStartText} />
                <span className="flex h-11 items-center text-muted">
                  <ArrowRight size={16} />
                </span>
                <NumberField label="Target" value={targetText} onChange={setTargetText} accent={color} />
                <label className="flex flex-1 flex-col gap-1.5 text-12 text-muted">
                  Unit
                  <input value={g.Unit} onChange={(e) => set({ Unit: e.target.value })} placeholder="miles" className="h-11 rounded-[12px] border border-line bg-panel px-3.5 text-15 text-text outline-none focus:border-faint" />
                </label>
                <NumberField label="Log adds" value={String(g.Step)} onChange={(v) => set({ Step: Math.max(0.1, Number(v) || 1) })} width={96} />
              </div>
            )}
            {g.Kind === "milestones" && (
              <div className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-panel">
                <div className="max-h-[132px] overflow-y-auto">
                  {g.Milestones.map((m, i) => (
                    <div key={m.Id} className="flex h-11 items-center gap-3 border-b border-line pr-2 pl-3.5 text-14">
                      <span className="w-4 font-mono text-11 text-muted">{i + 1}</span>
                      <span className={clsx("flex-1 truncate", m.Done && "text-muted line-through")}>{m.Text}</span>
                      {m.Due && <span className="font-mono text-11 text-muted">{short(m.Due)}</span>}
                      <button aria-label={`Remove ${m.Text}`} onClick={() => set({ Milestones: g.Milestones.filter((x) => x.Id !== m.Id) })} className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:text-text">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <label className="flex h-11 items-center gap-3 px-3.5 text-muted">
                  <Plus size={16} />
                  <input
                    value={msDraft}
                    onChange={(e) => setMsDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMilestone();
                      }
                    }}
                    placeholder="Add a milestone and press Enter"
                    aria-label="Add a milestone"
                    className="min-w-0 flex-1 bg-transparent text-14 text-text outline-none placeholder:text-muted"
                  />
                </label>
              </div>
            )}
            {g.Kind === "once" && (
              <div className="rounded-[14px] border border-dashed border-line px-3.5 py-3 text-13 text-muted">You'll mark it done when it's done. Linked tasks and habits below still show what's moving it.</div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>BY WHEN</SectionLabel>
            <div role="radiogroup" aria-label="Due date" className="grid grid-cols-4 gap-1.5">
              {dues.map((d) => {
                const on = g.Due === d.date;
                return (
                  <button
                    key={d.id}
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ Due: d.date })}
                    className={clsx("flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-[13px] border", on ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel text-text hover:border-faint")}
                  >
                    <span className="text-13 font-semibold">{d.label}</span>
                    <span className="font-mono text-10 opacity-80">{short(d.date)}</span>
                  </button>
                );
              })}
              <button
                role="radio"
                aria-checked={customDue}
                onClick={(e) => setCalendarAt(e.currentTarget.getBoundingClientRect())}
                className={clsx("flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-[13px] border", customDue ? "border-accent bg-accent text-accent-ink" : "border-line bg-panel text-text hover:border-faint")}
              >
                <span className="flex items-center gap-1.5 text-13 font-semibold">
                  <CalendarDays size={13} />
                  Pick a date
                </span>
                <span className="font-mono text-10 opacity-80">{customDue ? short(g.Due) : "Any day"}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>WHAT MOVES IT FORWARD</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {active.map((h) => {
                const on = g.Habits.some((l) => l.Id === h.Id);
                return (
                  <button
                    key={h.Id}
                    aria-pressed={on}
                    onClick={() => toggleHabit(h)}
                    className="flex h-[34px] items-center gap-2 rounded-[10px] border px-3 text-13 font-medium"
                    style={on ? { background: hueSoft(h.Hue), borderColor: hueColor(h.Hue), color: "var(--text)" } : { borderColor: "var(--line)", color: "var(--muted)" }}
                  >
                    <span className="font-mono text-10 text-muted">HABIT</span>
                    {h.Name}
                  </button>
                );
              })}
              {g.Tasks.map((id) => {
                const t = tasks.find((x) => x.Id === id);
                return t ? <LinkedChip key={id} kind="TASK" name={t.Title} color={listFor(t.List).color} onRemove={() => set({ Tasks: g.Tasks.filter((x) => x !== id) })} /> : null;
              })}
              {g.Events.map((id) => {
                const e = events.find((x) => x.Id === id);
                return e ? <LinkedChip key={id} kind="EVENT" name={e.Title} color={listFor(e.Calendar).color} onRemove={() => set({ Events: g.Events.filter((x) => x !== id) })} /> : null;
              })}
              {g.Notes.map((name) => (
                <LinkedChip key={name} kind="NOTE" name={titleOf(name)} color="var(--accent)" onRemove={() => set({ Notes: g.Notes.filter((x) => x !== name) })} />
              ))}
              {(
                [
                  ["task", "+ Task"],
                  ["event", "+ Event"],
                  ["note", "+ Note"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setPicking(k)} className="h-[34px] rounded-[10px] border border-dashed border-line px-3 text-13 text-muted hover:border-faint hover:text-text">
                  {label}
                </button>
              ))}
            </div>
            {g.Kind === "number" &&
              g.Habits.map((l) => {
                const h = habits.find((x) => x.Id === l.Id);
                if (!h) return null;
                return (
                  <div key={l.Id} className="flex min-h-[52px] items-center gap-3.5 rounded-[14px] border border-line px-3.5 py-2">
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className="text-14 font-medium">Count {h.Name} check-ins toward this goal</span>
                      <span className="text-12 text-muted">
                        Each one adds <b className="font-semibold text-text">{fmt(l.Per)}</b> {g.Unit || "toward it"}, counting from {short(isNew ? today : g.StartDate)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button aria-label="Less per check-in" onClick={() => patchLink(l.Id, { Per: Math.max(0.5, l.Per - (l.Per > 1 ? 1 : 0.5)) })} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-muted hover:text-text">
                        <Minus size={14} />
                      </button>
                      <button aria-label="More per check-in" onClick={() => patchLink(l.Id, { Per: l.Per + (l.Per >= 1 ? 1 : 0.5) })} className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] text-muted hover:text-text">
                        <Plus size={14} />
                      </button>
                    </span>
                    <button role="switch" aria-checked={l.Count} aria-label={`Count ${h.Name} check-ins`} onClick={() => patchLink(l.Id, { Count: !l.Count })} className="flex h-11 items-center">
                      <span className={clsx("flex h-[22px] w-[38px] rounded-full p-[3px]", l.Count ? "justify-end bg-accent" : "justify-start bg-panel2")}>
                        <span className={clsx("h-4 w-4 rounded-full", l.Count ? "bg-accent-ink" : "bg-muted")} />
                      </span>
                    </button>
                  </div>
                );
              })}
          </div>

          <div className="flex items-center gap-3">
            <SectionLabel>CHECK-INS</SectionLabel>
            <span className="relative flex flex-1">
              <select
                aria-label="Check-in reminder"
                value={g.CheckIn}
                onChange={(e) => set({ CheckIn: e.target.value as CheckIn })}
                className="h-[42px] w-full appearance-none rounded-[12px] border border-line bg-panel pr-9 pl-3.5 text-14 text-text outline-none focus:border-faint"
              >
                <option value="sun">Every Sunday evening, ask how it's going</option>
                <option value="mon">Every Monday morning, show this week's pace</option>
                <option value="month">First of the month, quick review</option>
                <option value="none">No check-in reminders</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
            </span>
          </div>
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-line bg-side px-[22px] py-6">
          <SectionLabel>PREVIEW</SectionLabel>
          <div className="flex flex-col gap-3.5 rounded-[22px] border-[1.5px] bg-panel p-[18px]" style={{ borderColor: color }}>
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-12 text-muted">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
                {area.Name} · Due {short(g.Due)}
              </span>
              <span className="flex h-6 items-center rounded-[8px] bg-panel2 px-[9px] text-11 font-semibold">{isNew ? "New" : "Editing"}</span>
            </span>
            <span className="text-18 leading-[1.3] font-semibold">{g.Title.trim() || "New goal"}</span>
            <span className="flex items-baseline justify-between text-12 text-muted">
              <b className="font-head text-26 font-bold text-text">{pct}%</b>
              <span>{detail}</span>
            </span>
            <span className="block h-2.5 overflow-hidden rounded-[10px] bg-panel2">
              <span className="block h-full rounded-[10px]" style={{ width: `${pct}%`, background: color }} />
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: hueSoft(area.Hue, 10) }}>
            <span className="font-mono text-10 tracking-[0.12em] text-muted">THE PLAN</span>
            <span className="text-20 leading-[1.3] font-semibold tracking-[-0.01em]">{plan.big}</span>
            <span className="text-13 leading-[1.5] text-muted">{plan.small}</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Days", String(days)],
                ["Per week", plan.week],
                ["Per day", plan.day],
              ].map(([l, v]) => (
                <div key={l} className="flex flex-col gap-0.5 rounded-[12px] bg-panel p-2.5">
                  <span className="text-10 text-muted">{l}</span>
                  <span className="font-mono text-16">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-mono text-10 tracking-[0.12em] text-muted">LINKED</span>
            {linked.length ? (
              <div className="flex flex-wrap gap-1.5">
                {linked.map((l) => (
                  <span key={l.key} className="flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border border-line bg-panel px-2.5 text-12">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: l.dot }} />
                    <span className="truncate">{l.name}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-13 text-muted">Nothing linked yet. You can add habits, tasks or events later.</span>
            )}
          </div>
        </aside>
      </div>

      <footer className="flex h-[68px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6">
        <span className="min-w-0 truncate text-13 text-muted">{summary}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" hint="Ctrl Enter" disabled={!canSave} onClick={save}>
            {isNew ? "Create goal" : "Save changes"}
          </Button>
        </div>
      </footer>

      {calendarAt && (
        <Calendar
          anchor={calendarAt}
          value={g.Due}
          time={null}
          onPick={(d) => {
            if (d > today) set({ Due: d });
            setCalendarAt(null);
          }}
          onClose={() => setCalendarAt(null)}
        />
      )}
      {picking === "task" && (
        <TaskPicker
          onPick={(id) => {
            if (!g.Tasks.includes(id)) set({ Tasks: [...g.Tasks, id] });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === "event" && (
        <EventPicker
          onPick={(id) => {
            if (!g.Events.includes(id)) set({ Events: [...g.Events, id] });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === "note" && n.notebook && (
        <NotePicker
          notes={n.notes}
          notebook={n.notebook}
          newTab={false}
          onPick={(name) => {
            if (!g.Notes.includes(name)) set({ Notes: [...g.Notes, name] });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Popup>
  );
}

function NumberField({ label, value, onChange, accent, width = 110 }: { label: string; value: string; onChange: (v: string) => void; accent?: string; width?: number }) {
  return (
    <label className="flex flex-col gap-1.5 text-12 text-muted" style={{ width }}>
      {label}
      <input
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, "").replace(",", "."))}
        className="h-11 rounded-[12px] border bg-panel px-3.5 font-mono text-15 text-text outline-none"
        style={{ borderColor: accent ?? "var(--line)", fontWeight: accent ? 500 : undefined }}
      />
    </label>
  );
}

function LinkedChip({ kind, name, color, onRemove }: { kind: string; name: string; color: string; onRemove: () => void }) {
  return (
    <span className="flex h-[34px] max-w-[260px] items-center gap-2 rounded-[10px] border pr-1 pl-3 text-13 font-medium" style={{ borderColor: color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}>
      <span className="font-mono text-10 text-muted">{kind}</span>
      <span className="truncate">{name}</span>
      <button aria-label={`Unlink ${name}`} onClick={onRemove} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] text-muted hover:text-text">
        <X size={12} />
      </button>
    </span>
  );
}
