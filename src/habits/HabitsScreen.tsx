import { weekLetters } from "../lib/format";
import clsx from "clsx";
import { Archive, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dayLabel, useNow } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { ProgressRing } from "../ui/Progress";
import { Popup, PopupHeader } from "../ui/Popup";
import { SectionLabel } from "../ui/bits";
import { archiveHabit, blankHabit, saveHabit } from "./actions";
import HabitDetails from "./HabitDetails";
import HabitEditPopup from "./HabitEditPopup";
import HabitRow from "./HabitRow";
import { HabitIcon } from "./icons";
import { activeHabits, bestStreak, doneOn, habitDay, hueColor, hueSoft, isDue, rate30, weekStartOf, type Habit, type TimeOfDay } from "./model";
import { rulesOf, useHabits } from "./useHabits";
import { clearHabit, peekHabit } from "../shell/go";

type View = "today" | "todo" | "done";
const groups: { id: TimeOfDay; label: string }[] = [
  { id: "morning", label: "MORNING" },
  { id: "anytime", label: "ANYTIME" },
  { id: "evening", label: "EVENING" },
];

// The Habits screen (Habits.dc.html): today's habits grouped by time of day,
// the week and records on the left, and the selected habit's streak and 12
// weeks on the right.
export default function HabitsScreen() {
  const { habits, error } = useHabits();
  const { settings, update } = useSettings();
  const now = useNow();
  const rules = rulesOf(settings);
  const today = habitDay(now, rules);
  const view: View = settings.HabitsView === "todo" || settings.HabitsView === "done" ? settings.HabitsView : "today";
  // Opened from a goal's linked habit, that one's picked.
  const [selectedId, setSelectedId] = useState<string | null>(peekHabit);
  useEffect(() => clearHabit(), []);
  const [editing, setEditing] = useState<{ habit: Habit; isNew: boolean } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const active = useMemo(() => activeHabits(habits), [habits]);
  const archived = habits.filter((h) => h.Archived);
  // Today's: due today (times-a-week habits are due every day until done).
  const todays = active.filter((h) => isDue(h, today));
  const done = todays.filter((h) => doneOn(h, today));
  const shown = view === "todo" ? todays.filter((h) => !doneOn(h, today)) : view === "done" ? done : todays;
  const selected = active.find((h) => h.Id === selectedId) ?? shown[0] ?? active[0] ?? null;

  // This week: check-ins done out of those due so far, and a bar a day.
  const letters = weekLetters();
  const mon = fromYmd(weekStartOf(today));
  const weekDays = letters.map((_, i) => ymd(addDays(mon, i)));
  const dayShare = (day: string) => {
    const due = active.filter((h) => isDue(h, day) && h.Frequency !== "weekly");
    return due.length ? due.filter((h) => doneOn(h, day)).length / due.length : 0;
  };
  const sofar = weekDays.filter((d) => d <= today);
  const dueSoFar = sofar.flatMap((d) => active.filter((h) => isDue(h, d) && h.Frequency !== "weekly" && (d < today || doneOn(h, d))).map((h) => [h, d] as const));
  const weekPct = dueSoFar.length ? Math.round((dueSoFar.filter(([h, d]) => doneOn(h, d)).length / dueSoFar.length) * 100) : 0;

  const byBest = [...active].sort((a, b) => bestStreak(b, today, rules).count - bestStreak(a, today, rules).count)[0];
  const byRate = [...active].map((h) => [h, rate30(h, today)] as const).sort((a, b) => b[1] - a[1]);

  const heading = view === "todo" ? "Still to do" : view === "done" ? "Done today" : "Today";

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line bg-side px-4 pt-[22px] pb-[18px]">
        <div className="flex items-center justify-between px-1.5">
          <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">Habits</h1>
          <button aria-label="New habit" title="New habit" onClick={() => setEditing({ habit: blankHabit(), isNew: true })} className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink">
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </div>

        <nav aria-label="Habit views" className="flex flex-col gap-0.5">
          {(
            [
              ["today", "All for today", todays.length],
              ["todo", "Still to do", todays.length - done.length],
              ["done", "Done today", done.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => update({ HabitsView: id })}
              data-row="nav"
              className={clsx("flex h-[42px] items-center gap-3 rounded-[12px] px-3 text-left text-14 font-medium", view === id ? "bg-panel text-text" : "text-muted hover:text-text")}
            >
              <span className="flex-1">{label}</span>
              <span className="font-mono text-12 text-muted">{count}</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-2.5">
          <SectionLabel className="px-2.5">THIS WEEK</SectionLabel>
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-panel p-4">
            <div className="flex items-baseline gap-2">
              <span className="font-head text-36 font-bold tracking-[-0.02em]">{weekPct}%</span>
              <span className="text-13 text-muted">of check-ins done</span>
            </div>
            <div className="flex h-16 items-end gap-1.5">
              {weekDays.map((d, i) => {
                const future = d > today;
                const h = future ? 44 : Math.max(6, Math.round(dayShare(d) * 44));
                return (
                  <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span
                      className="w-full rounded-[6px] border"
                      style={{
                        height: h,
                        background: future ? "transparent" : d === today ? "var(--accent2)" : "color-mix(in srgb, var(--accent2) 55%, transparent)",
                        borderColor: future ? "var(--faint)" : "transparent",
                        borderStyle: future ? "dashed" : "solid",
                      }}
                    />
                    <span className={clsx("font-mono text-10", d === today ? "text-accent2" : "text-muted")}>{letters[i]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {active.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <SectionLabel className="px-2.5">RECORDS</SectionLabel>
            <div className="flex flex-col overflow-hidden rounded-[16px] border border-line text-13">
              <Record label="Longest streak" value={byBest ? `${byBest.Name} · ${bestStreak(byBest, today, rules).count}${bestStreak(byBest, today, rules).unit === "day" ? "d" : "w"}` : "—"} border />
              <Record label="Most consistent" value={byRate[0] ? `${byRate[0][0].Name} · ${byRate[0][1]}%` : "—"} border />
              <Record label="Needs love" value={byRate.length > 1 ? byRate[byRate.length - 1][0].Name : "—"} warn />
            </div>
          </div>
        )}

        <div className="flex-1" />
        {archived.length > 0 && (
          <button onClick={() => setArchiveOpen(true)} className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-13 text-muted hover:bg-panel hover:text-text">
            <Archive size={14} />
            <span className="flex-1 text-left">Archived</span>
            <span className="font-mono text-12">{archived.length}</span>
          </button>
        )}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-[26px]">
        <header className="flex items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-12 tracking-[0.14em] text-muted">{dayLabel(fromYmd(today))}</span>
            <h2 className="m-0 font-head text-40 leading-none font-bold tracking-[-0.02em]">{heading}</h2>
          </div>
          {todays.length > 0 && (
            <div className="flex items-center gap-3.5">
              <ProgressRing value={done.length / todays.length} size={54} radius={22} stroke={6} color="var(--accent2)" />
              <div className="flex flex-col gap-0.5">
                <span className="text-15 font-semibold">
                  {done.length} of {todays.length} done
                </span>
                <span className="text-12 text-muted">{done.length === todays.length ? "Perfect day" : `${todays.length - done.length} to go today`}</span>
              </div>
            </div>
          )}
        </header>

        {error && <div className="rounded-[12px] border border-danger/40 bg-danger/10 px-4 py-3 text-13 text-danger">{error}</div>}

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-10">
          {groups.map((g) => {
            const items = shown.filter((h) => h.TimeOfDay === g.id);
            const all = todays.filter((h) => h.TimeOfDay === g.id);
            if (!items.length) return null;
            return (
              <div key={g.id} className="flex flex-col gap-2">
                <div className="flex h-6 items-center gap-2.5 font-mono text-11 tracking-[0.12em] text-muted">
                  <span>{g.label}</span>
                  <span>
                    {all.filter((h) => doneOn(h, today)).length}/{all.length}
                  </span>
                  <span className="h-px flex-1 bg-line" />
                </div>
                {items.map((h) => (
                  <HabitRow key={h.Id} h={h} today={today} rules={rules} selected={h.Id === selected?.Id} onSelect={() => setSelectedId(h.Id)} />
                ))}
              </div>
            );
          })}
          {active.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-line px-8 text-center">
              <span className="text-15 font-medium">No habits yet</span>
              <span className="max-w-[380px] text-13 leading-[1.5] text-muted">Start with something small, like a morning walk or eight glasses of water. Streaks build from the first check-in.</span>
              <button onClick={() => setEditing({ habit: blankHabit(), isNew: true })} className="mt-1 h-10 rounded-[12px] bg-accent px-4 text-13 font-semibold text-accent-ink">
                Add a habit
              </button>
            </div>
          ) : (
            shown.length === 0 && (
              <div className="flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-line px-8 text-center text-14 text-muted">
                {view === "todo" ? "All done for today. Nice." : view === "done" ? "Nothing checked off yet today." : "Nothing due today."}
              </div>
            )
          )}
        </div>
      </main>

      <HabitDetails h={selected} today={today} rules={rules} onEdit={() => selected && setEditing({ habit: selected, isNew: false })} />

      {editing && (
        <HabitEditPopup
          habit={editing.habit}
          isNew={editing.isNew}
          today={today}
          rules={rules}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            saveHabit(h);
            setSelectedId(h.Id);
            setEditing(null);
          }}
        />
      )}
      {archiveOpen && (
        <Popup onClose={() => setArchiveOpen(false)} width={560} label="Archived habits">
          <PopupHeader tag="ARCHIVED" onClose={() => setArchiveOpen(false)}>
            Their history is kept
          </PopupHeader>
          <div className="flex max-h-[480px] flex-col overflow-y-auto p-3">
            {archived.map((h) => (
              <div key={h.Id} className="flex min-h-[58px] items-center gap-3 border-b border-line px-2 last:border-b-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: hueSoft(h.Hue), color: hueColor(h.Hue) }}>
                  <HabitIcon id={h.Icon} size={17} />
                </span>
                <span className="flex-1 truncate text-14 font-medium">{h.Name}</span>
                <button onClick={() => archiveHabit(h, false)} className="h-9 rounded-[10px] border border-line px-3 text-13 font-medium hover:bg-panel">
                  Bring back
                </button>
                <button onClick={() => setEditing({ habit: h, isNew: false })} className="h-9 rounded-[10px] px-3 text-13 text-muted hover:bg-panel hover:text-text">
                  Edit
                </button>
              </div>
            ))}
            {archived.length === 0 && <div className="px-3 py-8 text-center text-13 text-muted">Nothing archived.</div>}
          </div>
        </Popup>
      )}
    </>
  );
}

function Record({ label, value, border, warn }: { label: string; value: string; border?: boolean; warn?: boolean }) {
  return (
    <div className={clsx("flex h-11 items-center justify-between gap-3 px-3.5", border && "border-b border-line")}>
      <span className="shrink-0 text-muted">{label}</span>
      <span className={clsx("truncate font-medium", warn && "text-warn")}>{value}</span>
    </div>
  );
}
