import clsx from "clsx";
import { Check, Flame, Minus, Pause, Play, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { startTimer, stepDay, stopTimer, toggleDay } from "./actions";
import { HabitIcon } from "./icons";
import { currentStreak, dayState, doneOn, goalLabel, hueColor, hueSoft, mondayOf, valueOn, weekCount, type Habit, type HabitRules } from "./model";

const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// The week strip: done filled, part-done half filled, missed outlined, today
// outlined in the habit's color, days to come dashed.
export function WeekStrip({ h, today, size = "md" }: { h: Habit; today: string; size?: "sm" | "md" }) {
  const mon = fromYmd(mondayOf(today));
  const color = hueColor(h.Hue);
  return (
    <div aria-label={`This week: ${weekCount(h, today)} done`} className="flex gap-[5px]">
      {dayNames.map((name, i) => {
        const day = ymd(addDays(mon, i));
        const state = dayState(h, day, today);
        const style: React.CSSProperties =
          state === "done"
            ? { background: color, borderColor: color }
            : state === "partial"
              ? { background: hueSoft(h.Hue, 45), borderColor: color }
              : state === "today"
                ? { borderColor: color }
                : state === "future"
                  ? { borderColor: "var(--faint)", borderStyle: "dashed" }
                  : state === "off"
                    ? { borderColor: "transparent", background: "var(--panel2)" }
                    : { borderColor: "var(--faint)" };
        const title = `${name}${day === today ? " (today)" : ""}: ${state === "done" ? "done" : state === "partial" ? `${valueOn(h, day)} of ${h.Target}` : state === "missed" ? "missed" : state === "off" ? "not due" : ""}`;
        return <span key={i} title={title} className={clsx("rounded-[5px] border-[1.5px]", size === "md" ? "h-[30px] w-3.5" : "h-6 w-3")} style={style} />;
      })}
    </div>
  );
}

interface Props {
  h: Habit;
  today: string;
  rules: HabitRules;
  selected: boolean;
  onSelect: () => void;
}

// One habit (Habits.dc.html): icon, name, goal and streak, the week, and the
// check button, or the stepper for count and time habits.
export default function HabitRow({ h, today, rules, selected, onSelect }: Props) {
  const done = doneOn(h, today);
  const streak = currentStreak(h, today, rules);
  const color = hueColor(h.Hue);
  const sub = h.Frequency === "weekly" ? `${weekCount(h, today)} of ${h.PerWeek} this week` : goalLabel(h);
  return (
    <div className={clsx("flex min-h-20 items-center gap-4 rounded-[18px] border py-3 pr-3.5 pl-3", selected ? "border-line bg-panel" : "border-transparent hover:bg-panel/50")}>
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ background: hueSoft(h.Hue), color }}>
          <HabitIcon id={h.Icon} />
        </span>
        <span className="flex min-w-0 flex-col gap-[5px]">
          <span className="truncate text-16 font-semibold">{h.Name}</span>
          <span className="flex items-center gap-2.5 text-12 text-muted">
            <span>{sub}</span>
            <span className="flex items-center gap-1" style={{ color: done ? color : undefined }}>
              <Flame size={13} strokeWidth={2} />
              {streak.count} {streak.unit} streak
            </span>
          </span>
        </span>
      </button>
      <WeekStrip h={h} today={today} />
      {h.Kind === "check" ? (
        <button
          aria-pressed={done}
          aria-label={`${done ? "Undo today" : "Mark done today"}: ${h.Name}`}
          onClick={() => toggleDay(h, today)}
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] border-[1.5px] transition-colors"
          style={done ? { background: color, borderColor: color, color: "var(--accent-ink)" } : { borderColor: "var(--faint)", color: "var(--muted)" }}
        >
          <Check size={22} strokeWidth={2.6} />
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {h.Kind === "time" && <TimerButton h={h} today={today} />}
          <Stepper h={h} today={today} />
        </div>
      )}
    </div>
  );
}

export function Stepper({ h, today, compact }: { h: Habit; today: string; compact?: boolean }) {
  const color = hueColor(h.Hue);
  const v = valueOn(h, today);
  const size = compact ? "h-8 w-8 rounded-[9px]" : "h-[38px] w-[38px] rounded-[11px]";
  return (
    <div className="flex items-center gap-1 rounded-[14px] bg-panel2 p-[3px]">
      <button aria-label={`Remove ${h.Kind === "time" ? "5 minutes" : "one"} from ${h.Name}`} onClick={() => stepDay(h, today, -1)} className={clsx("flex items-center justify-center text-muted hover:text-text", size)}>
        <Minus size={16} strokeWidth={2.2} />
      </button>
      <span className={clsx("text-center font-mono font-medium", compact ? "min-w-11 text-13" : "min-w-[54px] text-14")}>
        <span style={{ color }}>{v}</span>/{h.Target}
      </span>
      <button
        aria-label={`Add ${h.Kind === "time" ? "5 minutes" : "one"} to ${h.Name}`}
        onClick={() => stepDay(h, today, 1)}
        className={clsx("flex items-center justify-center text-accent-ink", size)}
        style={{ background: color }}
      >
        <Plus size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}

// Time habits: start and stop a timer; its minutes go to today.
export function TimerButton({ h, today }: { h: Habit; today: string }) {
  const running = Boolean(h.Timer);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const secs = running ? Math.max(0, Math.floor((Date.now() - Date.parse(h.Timer!)) / 1000)) : 0;
  const color = hueColor(h.Hue);
  return (
    <button
      aria-label={running ? `Stop the timer for ${h.Name}` : `Start a timer for ${h.Name}`}
      aria-pressed={running}
      onClick={() => (running ? stopTimer(h, today) : startTimer(h))}
      className="flex h-11 items-center gap-2 rounded-[13px] border px-3 font-mono text-13"
      style={running ? { borderColor: color, color } : { borderColor: "var(--line)", color: "var(--muted)" }}
    >
      {running ? <Pause size={15} strokeWidth={2.2} /> : <Play size={15} strokeWidth={2.2} />}
      {running ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "Timer"}
    </button>
  );
}
