// What people do to habits: check in, count, time, and edit.
import { newId } from "../tasks/model";
import { toast } from "../ui/Toast";
import { announce, announcing } from "../lib/announce";
import { currentSettings } from "../lib/settings";
import { locale } from "../lib/format";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { currentStreak, doneOn, type Habit } from "./model";
import { habitStore, rulesOf } from "./useHabits";

const store = () => habitStore();

function edit(id: string, change: (h: Habit) => Habit) {
  store().change((f) => ({ ...f, Habits: f.Habits.map((h) => (h.Id === id ? change(h) : h)) }));
}

// Checking in, said out loud for screen readers: done, and the streak.
function sayDay(before: Habit, day: string) {
  if (!announcing()) return;
  const after = store().getState().file.Habits.find((h) => h.Id === before.Id);
  if (!after || doneOn(after, day) === doneOn(before, day)) return;
  if (!doneOn(after, day)) return announce(`${after.Name}: not done`);
  const streak = currentStreak(after, day, rulesOf(currentSettings()));
  announce(streak.count > 1 ? `${after.Name} done, ${streak.count} ${streak.unit === "week" ? "week" : "day"} streak` : `${after.Name} done`);
}

function withValue(h: Habit, day: string, value: number): Habit {
  const log = { ...h.Log };
  if (value > 0) log[day] = value;
  else delete log[day];
  return { ...h, Log: log };
}

// Check-off habits: done or not for the day.
export function toggleDay(h: Habit, day: string) {
  edit(h.Id, (x) => withValue(x, day, (x.Log[day] ?? 0) >= x.Target ? 0 : x.Target));
  sayDay(h, day);
}

// "yesterday", or "Monday, Sep 28", for a day before today.
export function dayName(day: string, today: string): string {
  if (day === ymd(addDays(fromYmd(today), -1))) return "yesterday";
  return fromYmd(day).toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" });
}

// Filling in a day after the fact (a click on it in the week, the history or
// Home): done, or cleared, whatever kind of habit, with Undo in case the
// click was a slip. Today works the same way, without the toast.
export function fillDay(h: Habit, day: string, today: string) {
  const latest = store().getState().file.Habits.find((x) => x.Id === h.Id) ?? h;
  const was = latest.Log[day] ?? 0;
  const wasDone = doneOn(latest, day);
  toggleDay(latest, day);
  if (day === today) return;
  toast(`${wasDone ? "Cleared" : "Marked"} ${dayName(day, today)} ${wasDone ? "for" : "done for"} ${latest.Name}`, () =>
    edit(h.Id, (x) => withValue(x, day, was)),
  );
}

// Count and time habits: up or down a step (one, or five minutes).
export function stepDay(h: Habit, day: string, by: number) {
  const step = h.Kind === "time" ? 5 : 1;
  edit(h.Id, (x) => withValue(x, day, Math.max(0, Math.min(x.Target * 4, (x.Log[day] ?? 0) + by * step))));
  sayDay(h, day);
}

// The timer for time habits: it runs while Project Life is open (the tray
// too) and, stopped, adds its minutes to today.
export function startTimer(h: Habit) {
  edit(h.Id, (x) => ({ ...x, Timer: new Date().toISOString() }));
}

export function stopTimer(h: Habit, day: string) {
  if (!h.Timer) return;
  const minutes = Math.round((Date.now() - Date.parse(h.Timer)) / 60_000);
  if (minutes < 1) {
    edit(h.Id, (x) => ({ ...x, Timer: null }));
    toast("Stopped after less than a minute, so nothing was added");
    return;
  }
  edit(h.Id, (x) => ({ ...withValue(x, day, (x.Log[day] ?? 0) + minutes), Timer: null }));
  toast(`Added ${minutes} ${minutes === 1 ? "minute" : "minutes"} to ${h.Name}`);
}

export function blankHabit(): Habit {
  return {
    Id: newId(),
    Name: "",
    Icon: "leaf",
    Hue: 1,
    Kind: "check",
    Target: 1,
    Unit: "",
    Frequency: "daily",
    Days: [true, true, true, true, true, true, true],
    PerWeek: 3,
    TimeOfDay: "anytime",
    Reminder: { On: false, At: "09:00" },
    ShowOnHome: true,
    InTasks: false,
    Log: {},
    Created: new Date().toISOString(),
  };
}

export function saveHabit(h: Habit) {
  store().change((f) => ({ ...f, Habits: f.Habits.some((x) => x.Id === h.Id) ? f.Habits.map((x) => (x.Id === h.Id ? h : x)) : [...f.Habits, h] }));
}

export function archiveHabit(h: Habit, archived: boolean) {
  edit(h.Id, (x) => ({ ...x, Archived: archived ? new Date().toISOString() : null, Timer: null }));
  if (archived) toast(`Archived “${h.Name}”`, () => edit(h.Id, (x) => ({ ...x, Archived: null })));
}

export function deleteHabit(h: Habit) {
  const before = store().getState().file.Habits;
  store().change((f) => ({ ...f, Habits: f.Habits.filter((x) => x.Id !== h.Id) }));
  toast(`Deleted “${h.Name}” and its history`, () => store().change((f) => ({ ...f, Habits: before })));
}
