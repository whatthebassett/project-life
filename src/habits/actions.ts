// What people do to habits: check in, count, time, and edit.
import { newId } from "../tasks/model";
import { toast } from "../ui/Toast";
import type { Habit } from "./model";
import { habitStore } from "./useHabits";

const store = () => habitStore();

function edit(id: string, change: (h: Habit) => Habit) {
  store().change((f) => ({ ...f, Habits: f.Habits.map((h) => (h.Id === id ? change(h) : h)) }));
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
}

// Count and time habits: up or down a step (one, or five minutes).
export function stepDay(h: Habit, day: string, by: number) {
  const step = h.Kind === "time" ? 5 : 1;
  edit(h.Id, (x) => withValue(x, day, Math.max(0, Math.min(x.Target * 4, (x.Log[day] ?? 0) + by * step))));
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
