import { Check } from "lucide-react";
import { toggleDay } from "./actions";
import { Stepper, TimerButton } from "./HabitRow";
import { HabitIcon } from "./icons";
import { doneOn, goalLabel, hueColor, hueSoft, type Habit } from "./model";

// A habit in Tasks' Today view ("Add to Today in Tasks"): checked off right
// there, next to the to-dos.
export default function HabitTaskRow({ h, today }: { h: Habit; today: string }) {
  const done = doneOn(h, today);
  const color = hueColor(h.Hue);
  return (
    <div role="listitem" data-row="task" className="flex min-h-[58px] items-center gap-3 rounded-[14px] py-1.5 pr-2.5 pl-2.5 hover:bg-panel/60">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: hueSoft(h.Hue), color }}>
        <HabitIcon id={h.Icon} size={16} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className={done ? "truncate text-15 font-medium text-muted line-through" : "truncate text-15 font-medium"}>{h.Name}</span>
        <span className="text-12 text-muted">Habit · {goalLabel(h)}</span>
      </span>
      {h.Kind === "check" ? (
        <button
          aria-pressed={done}
          aria-label={`${done ? "Undo today" : "Mark done today"}: ${h.Name}`}
          onClick={() => toggleDay(h, today)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border-[1.5px]"
          style={done ? { background: color, borderColor: color, color: "var(--accent-ink)" } : { borderColor: "var(--faint)", color: "var(--muted)" }}
        >
          <Check size={16} strokeWidth={2.6} />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          {h.Kind === "time" && <TimerButton h={h} today={today} />}
          <Stepper h={h} today={today} compact />
        </div>
      )}
    </div>
  );
}
