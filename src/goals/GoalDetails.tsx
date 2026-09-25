import { locale } from "../lib/format";
import { Check, Ellipsis, Minus, Pencil, Plus } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { currentStreak, hueColor, hueSoft, type Habit, type HabitRules } from "../habits/model";
import { titleOf } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import { occurrences, type CalEvent } from "../schedule/events";
import { shortTime } from "../schedule/look";
import { requestSchedule } from "../schedule/nav";
import { showHabit } from "../shell/go";
import { formatDue, fromYmd, startOfDay } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import type { Task } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { SectionLabel } from "../ui/bits";
import { deleteGoal, logProgress, setDone, toggleMilestone } from "./actions";
import { fmt, historyOf, paceNote, paceOn, progressOn, statusLabel, statusOf, statusStyle, valueOn, type Area, type Goal } from "./model";

interface Props {
  goal: Goal | null;
  area: Area | null;
  habits: Habit[];
  tasks: Task[];
  events: CalEvent[];
  today: string;
  rules: HabitRules;
  onEdit: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
}

const W = 296;
const TOP = 8;
const BOT = 108;
const day = (d: string) => fromYmd(d).toLocaleDateString(locale(), { month: "short", day: "numeric" });

// The details panel (Goals.dc.html): why it matters, the progress chart
// against an even pace, logging or milestones, and what feeds the goal.
export default function GoalDetails({ goal, area, habits, tasks, events, today, rules, onEdit, openMenu }: Props) {
  const n = useNotes();
  if (!goal || !area) {
    return (
      <aside aria-label="Goal details" className="flex w-[340px] shrink-0 flex-col items-center justify-center gap-2 border-l border-line bg-side px-8 text-center">
        <span className="text-14 font-medium">No goal selected</span>
        <span className="text-13 leading-[1.5] text-muted">Pick a goal to see its progress, pace and what feeds it.</span>
      </aside>
    );
  }
  const color = hueColor(area.Hue);
  const pct = progressOn(goal, habits, today);
  const pace = paceOn(goal, today);
  const status = statusOf(pct, pace);
  const history = historyOf(goal, habits, today);
  const pts = history.map((p) => [Math.round((paceOn(goal, p.day) / 100) * W), Math.round(BOT - (p.pct / 100) * (BOT - TOP))] as const);
  const line = pts.map((p) => p.join(",")).join(" ");
  const nowX = Math.round((pace / 100) * W);
  const last = pts[pts.length - 1] ?? [0, BOT];
  const current = valueOn(goal, habits, today);
  const stepLabel = `${fmt(goal.Step)} ${goal.Step === 1 ? goal.Unit.replace(/s$/, "") : goal.Unit}`.trim();

  const feeds = [
    ...goal.Habits.map((link) => {
      const h = habits.find((x) => x.Id === link.Id);
      if (!h) return null;
      const s = currentStreak(h, today, rules);
      return {
        key: `h:${h.Id}`,
        tag: "HA",
        name: h.Name,
        note: [link.Count ? `Adds ${fmt(link.Per)} ${goal.Unit} each check-in` : "Habit", `${s.count} ${s.unit} streak`].join(" · "),
        color: hueColor(h.Hue),
        soft: hueSoft(h.Hue),
        open: () => showHabit(h.Id),
      };
    }),
    ...goal.Tasks.map((id) => {
      const t = tasks.find((x) => x.Id === id);
      if (!t) return null;
      const list = listFor(t.List);
      const subs = t.Subtasks?.length ? ` · ${t.Subtasks.filter((s) => s.Done).length} of ${t.Subtasks.length} subtasks` : "";
      return {
        key: `t:${t.Id}`,
        tag: "TA",
        name: t.Title,
        note: `Task · ${t.Completed ? "Done" : t.Due ? `Due ${formatDue(t.Due, t.DueTime, startOfDay(new Date()))}` : "Someday"}${subs}`,
        color: list.color,
        soft: `color-mix(in srgb, ${list.color} 16%, transparent)`,
        open: () => requestTasks({ kind: "open", id: t.Id, popup: true }),
      };
    }),
    ...goal.Events.map((id) => {
      const e = events.find((x) => x.Id === id);
      if (!e) return null;
      const next = occurrences([e], new Date(), new Date(Date.now() + 120 * 86_400_000))[0];
      const cal = listFor(e.Calendar);
      return {
        key: `e:${e.Id}`,
        tag: "EV",
        name: e.Title,
        note: `Event · ${next ? `${next.start.toLocaleDateString(locale(), { weekday: e.Repeat ? "long" : "short", month: e.Repeat ? undefined : "short", day: e.Repeat ? undefined : "numeric" })}${e.Repeat ? "s" : ""}, ${shortTime(next.start)}` : "Past"}`,
        color: cal.color,
        soft: `color-mix(in srgb, ${cal.color} 16%, transparent)`,
        open: () => requestSchedule({ kind: "open", id: e.Id, day: next?.day }),
      };
    }),
    ...goal.Notes.map((name) => ({
      key: `n:${name}`,
      tag: "NO",
      name: titleOf(name),
      note: "Linked note",
      color: "var(--accent)",
      soft: "var(--accent-soft)",
      open: () => void n.activate(name),
    })),
  ].filter((f): f is NonNullable<typeof f> => f !== null);

  const more = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: "Edit goal", onSelect: onEdit },
      goal.Kind === "once" ? { label: goal.Done ? "Mark not done" : "Mark done", onSelect: () => setDone(goal, !goal.Done) } : { type: "separator" },
      { label: "Delete goal", danger: true, onSelect: () => deleteGoal(goal) },
    ]);
  };

  return (
    <aside aria-label="Goal details" className="flex w-[340px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line bg-side px-[22px] py-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-12 text-muted">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: color }} />
            {area.Name} · Due {day(goal.Due)}
          </span>
          <span className="flex gap-1">
            <button aria-label="Edit goal" title="Edit" onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel hover:text-text">
              <Pencil size={14} />
            </button>
            <button aria-label="More" onClick={more} className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel hover:text-text">
              <Ellipsis size={16} />
            </button>
          </span>
        </div>
        <h3 className="m-0 font-head text-24 leading-[1.15] font-bold tracking-[-0.01em]">{goal.Title}</h3>
      </div>

      {goal.Why && (
        <div className="rounded-[16px] px-4 py-3.5 text-14 leading-[1.5]" style={{ background: hueSoft(area.Hue, 12) }}>
          <span className="mb-1 block font-mono text-10 tracking-[0.12em] text-muted">WHY IT MATTERS</span>
          {goal.Why}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <SectionLabel>PROGRESS</SectionLabel>
          <span className="flex h-6 items-center rounded-[8px] px-[9px] text-11 font-semibold" style={{ background: statusStyle[status].bg, color: statusStyle[status].fg }}>
            {statusLabel[status]}
          </span>
        </div>
        <svg width={W} height={118} viewBox={`0 0 ${W} 118`} role="img" aria-label={`${pct} percent done, an even pace would be ${pace} percent by today`} className="block">
          <line x1="0" y1={BOT} x2={W} y2={BOT} stroke="var(--line)" strokeWidth="1" />
          <line x1="0" y1={TOP} x2={W} y2={TOP} stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4" />
          <line x1="0" y1={BOT} x2={W} y2={TOP} stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" />
          {pts.length > 0 && <polyline points={`0,${BOT} ${line} ${last[0]},${BOT}`} fill={hueSoft(area.Hue, 12)} stroke="none" />}
          {pts.length > 0 && <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
          <line x1={nowX} y1={TOP} x2={nowX} y2={BOT} stroke="var(--text)" strokeWidth="1" opacity="0.25" />
          <circle cx={last[0]} cy={last[1]} r="5" fill={color} stroke="var(--side)" strokeWidth="2" />
        </svg>
        <div className="flex justify-between font-mono text-10 text-muted">
          <span>{day(goal.StartDate)}</span>
          <span>Today</span>
          <span>{day(goal.Due)}</span>
        </div>
        <div className="flex gap-3.5 text-11 text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-[3px] w-3.5 rounded-[2px]" style={{ background: color }} />
            You
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3.5 border-t-2 border-dashed border-faint" />
            Even pace
          </span>
        </div>
      </div>

      {goal.Kind === "number" && (
        <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-panel p-4">
          <div className="flex items-baseline gap-2">
            <span className="font-head text-34 font-bold tracking-[-0.02em]" style={{ color }}>
              {fmt(current)}
            </span>
            <span className="text-14 text-muted">
              of {fmt(goal.Target)} {goal.Unit}
            </span>
          </div>
          <span className="text-12 text-muted">{paceNote(goal, habits, today)}</span>
          <div className="flex gap-2">
            <button aria-label="Log less" onClick={() => logProgress(goal, -goal.Step)} className="flex h-11 w-11 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
              <Minus size={16} strokeWidth={2.2} />
            </button>
            <button onClick={() => logProgress(goal, goal.Step)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] text-13 font-semibold text-accent-ink" style={{ background: color }}>
              <Plus size={16} strokeWidth={2.4} />
              Log {stepLabel}
            </button>
          </div>
        </div>
      )}

      {goal.Kind === "milestones" && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between pb-1">
            <SectionLabel>MILESTONES</SectionLabel>
            <span className="font-mono text-11 text-muted">
              {goal.Milestones.filter((m) => m.Done).length} of {goal.Milestones.length}
            </span>
          </div>
          {goal.Milestones.map((m) => (
            <button key={m.Id} role="checkbox" aria-checked={Boolean(m.Done)} onClick={() => toggleMilestone(goal, m)} className="flex min-h-11 items-center gap-3 px-1 text-left text-14">
              <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-accent-ink" style={{ borderColor: m.Done ? color : "var(--faint)", background: m.Done ? color : "transparent" }}>
                {m.Done && <Check size={13} strokeWidth={3.2} />}
              </span>
              <span className={m.Done ? "flex-1 text-muted line-through" : "flex-1 text-text"}>{m.Text}</span>
              {m.Due && <span className="font-mono text-11 text-muted">{day(m.Due)}</span>}
            </button>
          ))}
          {goal.Milestones.length === 0 && <span className="px-1 text-13 text-muted">No milestones yet. Add them in Edit.</span>}
        </div>
      )}

      {goal.Kind === "once" && (
        <button
          onClick={() => setDone(goal, !goal.Done)}
          className="flex h-11 items-center justify-center gap-2 rounded-[12px] border text-13 font-semibold"
          style={goal.Done ? { background: color, borderColor: color, color: "var(--accent-ink)" } : { borderColor: color }}
        >
          <Check size={16} strokeWidth={2.6} />
          {goal.Done ? "Done" : "Mark as done"}
        </button>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel>FEEDS INTO THIS GOAL</SectionLabel>
        {feeds.map((f) => (
          <button key={f.key} onClick={f.open} className="flex items-center gap-3 rounded-[14px] border border-line bg-panel px-3 py-2.5 text-left hover:border-faint">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-mono text-11 font-semibold" style={{ background: f.soft, color: f.color }}>
              {f.tag}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-13 font-medium">{f.name}</span>
              <span className="truncate text-11 text-muted">{f.note}</span>
            </span>
          </button>
        ))}
        {feeds.length === 0 && <span className="text-13 text-muted">Nothing linked yet. Link habits, tasks, events or notes in Edit.</span>}
      </div>
    </aside>
  );
}
