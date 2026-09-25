import { Pencil } from "lucide-react";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { SectionLabel } from "../ui/bits";
import { HabitIcon } from "./icons";
import { bestStreak, currentStreak, doneOn, frequencyLabel, goalLabel, hueColor, hueSoft, level, mondayOf, rate30, reminderLabel, todLabel, totalDone, type Habit, type HabitRules } from "./model";

const opacity = [1, 0.35, 0.65, 1];

// The details panel (Habits.dc.html): the streak, best / 30 days / total,
// the last 12 weeks, and the reminder and time of day.
export default function HabitDetails({ h, today, rules, onEdit }: { h: Habit | null; today: string; rules: HabitRules; onEdit: () => void }) {
  if (!h) {
    return (
      <aside aria-label="Habit details" className="flex w-[340px] shrink-0 flex-col items-center justify-center gap-2 border-l border-line bg-side px-8 text-center">
        <span className="text-14 font-medium">No habit selected</span>
        <span className="text-13 leading-[1.5] text-muted">Pick a habit to see its streak and the last 12 weeks.</span>
      </aside>
    );
  }
  const color = hueColor(h.Hue);
  const streak = currentStreak(h, today, rules);
  const best = bestStreak(h, today, rules);
  const done = doneOn(h, today);
  const lastMonday = fromYmd(mondayOf(today));
  const firstMonday = addDays(lastMonday, -77);
  const cells = Array.from({ length: 84 }, (_, i) => ymd(addDays(firstMonday, Math.floor(i / 7) * 7 + (i % 7))));
  const range = `${firstMonday.toLocaleDateString(undefined, { month: "short" })} – ${fromYmd(today).toLocaleDateString(undefined, { month: "short" })}`;
  const rate = rate30(h, today);

  return (
    <aside aria-label="Habit details" className="flex w-[340px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-line bg-side px-[22px] py-6">
      <div className="flex items-center gap-3.5">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px]" style={{ background: hueSoft(h.Hue), color }}>
          <HabitIcon id={h.Icon} size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <h3 className="m-0 font-head text-22 leading-[1.15] font-bold">{h.Name}</h3>
          <span className="text-12 text-muted">
            {goalLabel(h)} · {frequencyLabel(h)}
          </span>
        </div>
        <button onClick={onEdit} className="flex h-9 items-center gap-1.5 rounded-[10px] border border-line px-3 text-13 font-medium hover:bg-panel">
          <Pencil size={13} />
          Edit
        </button>
      </div>

      <div className="flex items-end gap-3 rounded-[20px] p-[18px]" style={{ background: hueSoft(h.Hue) }}>
        <span className="font-head text-64 leading-[0.9] font-bold tracking-[-0.03em]" style={{ color }}>
          {streak.count}
        </span>
        <span className="flex flex-col gap-0.5 pb-1">
          <span className="text-14 font-semibold">{streak.unit} streak</span>
          <span className="text-12 text-muted">{done ? "Done today, nice." : "Check in today to keep it going"}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Best" value={`${best.count}${best.unit === "day" ? "d" : "w"}`} />
        <Stat label="30 days" value={`${rate}%`} />
        <Stat label="Total" value={String(totalDone(h))} />
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <SectionLabel>LAST 12 WEEKS</SectionLabel>
          <span className="text-11 text-muted">{range}</span>
        </div>
        <div className="flex gap-1.5">
          <div className="flex flex-col gap-1 font-mono text-9 text-muted">
            {["M", "", "W", "", "F", "", "S"].map((l, i) => (
              <span key={i} className="flex h-[17px] items-center">
                {l}
              </span>
            ))}
          </div>
          <div role="img" aria-label={`Last 12 weeks: done on ${rate} percent of the last 30 days`} className="grid flex-1 grid-flow-col grid-cols-12 grid-rows-[repeat(7,17px)] gap-1">
            {cells.map((day) => {
              const future = day > today;
              const lv = future ? 0 : level(h, day);
              return (
                <span
                  key={day}
                  title={fromYmd(day).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  className="rounded-[4px] border"
                  style={{
                    background: future ? "transparent" : lv ? color : "var(--panel2)",
                    opacity: future ? 1 : opacity[lv],
                    borderColor: day === today ? "var(--text)" : future ? "var(--line)" : "transparent",
                    borderStyle: future ? "dashed" : "solid",
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="flex items-center justify-end gap-1 text-10 text-muted">
          Less
          <span className="h-3 w-3 rounded-[3px] bg-panel2" />
          <span className="h-3 w-3 rounded-[3px]" style={{ background: color, opacity: 0.35 }} />
          <span className="h-3 w-3 rounded-[3px]" style={{ background: color, opacity: 0.65 }} />
          <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} />
          More
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-[14px] border border-line text-13">
        <div className="flex h-11 items-center justify-between border-b border-line px-3.5">
          <span className="text-muted">Reminder</span>
          <span className="font-medium">{reminderLabel(h)}</span>
        </div>
        <div className="flex h-11 items-center justify-between px-3.5">
          <span className="text-muted">Time of day</span>
          <span className="font-medium">{todLabel[h.TimeOfDay]}</span>
        </div>
      </div>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-panel p-3">
      <span className="text-11 text-muted">{label}</span>
      <span className="font-mono text-17">{value}</span>
    </div>
  );
}
