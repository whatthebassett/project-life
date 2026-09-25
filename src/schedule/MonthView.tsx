import { dayOfWeek, weekStartsMonday } from "../lib/format";
import { locale } from "../lib/format";
import clsx from "clsx";
import { addDays, ymd } from "../tasks/dates";
import type { TaskList } from "../tasks/lists";
import type { Occurrence } from "./events";
import { softOf } from "./look";

interface Props {
  // The first of the month shown.
  month: Date;
  occs: Occurrence[];
  now: Date;
  calendarOf: (id: string) => TaskList;
  onDay: (day: Date) => void;
  onSelect: (o: Occurrence) => void;
}

// Six weeks from the week holding the 1st, starting on the day weeks start on.
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -dayOfWeek(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// The month (Calendar.dc.html): up to two chips a day plus "+N more".
// Clicking a day opens its week; clicking a chip picks that event.
export default function MonthView({ month, occs, now, calendarOf, onDay, onSelect }: Props) {
  const days = monthGrid(month);
  const todayKey = ymd(now);
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occs) {
    // An event over several days shows on each of them.
    const first = new Date(o.start.getFullYear(), o.start.getMonth(), o.start.getDate());
    for (let d = first; d.getTime() === first.getTime() || d < o.end; d = addDays(d, 1)) {
      const k = ymd(d);
      byDay.set(k, [...(byDay.get(k) ?? []), o]);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-line bg-panel">
      <div className="grid grid-cols-7 border-b border-line">
        {(weekStartsMonday() ? ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] : ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]).map((d) => (
          <span key={d} className="p-3 font-mono text-11 tracking-[0.08em] text-muted">
            {d}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const key = ymd(d);
          const inMonth = d.getMonth() === month.getMonth();
          const today = key === todayKey;
          const list = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              role="button"
              tabIndex={-1}
              aria-label={d.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })}
              onClick={() => onDay(d)}
              className="flex min-h-0 cursor-pointer flex-col gap-1 overflow-hidden border-b border-l border-line p-2 hover:bg-panel2/40"
              style={{ background: !inMonth ? "var(--bg)" : today ? "var(--today-tint)" : undefined }}
            >
              <span className={clsx("flex h-[26px] min-w-[26px] items-center justify-center self-start rounded-[8px] px-1.5 text-13 font-semibold", today ? "bg-accent text-accent-ink" : inMonth ? "text-text" : "text-faint")}>
                {d.getDate()}
              </span>
              {list.slice(0, 2).map((o) => {
                const cal = calendarOf(o.event.Calendar);
                return (
                  <button
                    key={o.key}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(o);
                    }}
                    className="flex h-[22px] shrink-0 items-center gap-1.5 overflow-hidden rounded-[6px] px-1.5 text-left text-11 font-medium whitespace-nowrap"
                    style={{ background: softOf(cal.tone) }}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cal.color }} />
                    <span className="truncate">{o.event.Title || "Untitled event"}</span>
                  </button>
                );
              })}
              {list.length > 2 && <span className="pl-1.5 text-11 text-muted">+{list.length - 2} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
