import { dayOfWeek } from "../lib/format";
import { clockText } from "../lib/format";
// Habits as they live in Data\habits.json, and how streaks, rates and the
// week strip are worked out. PascalCase keys, and keys this version doesn't
// know are kept.
//
// A habit's day runs until 3 AM (Settings → Habits → My day ends at, Phase 7),
// so a check-in at 1 AM counts for the day before. Days a habit isn't due
// don't break its streak, and with the streak saver on, one missed day a week
// doesn't either.
import { addDays, fromYmd, isYmd, startOfDay, ymd } from "../tasks/dates";

export type HabitKind = "check" | "count" | "time";
export type HabitFrequency = "daily" | "days" | "weekly";
export type TimeOfDay = "morning" | "anytime" | "evening";
export type HabitIconId = "drop" | "book" | "route" | "heart" | "pen" | "moon" | "dumbbell" | "music" | "leaf" | "code";
export type HabitReminderAt = "every2" | "09:00" | "12:00" | "19:00";

export interface Habit {
  Id: string;
  Name: string;
  Icon: HabitIconId;
  // 0–5: the six color picks (DESIGN.md §2), var(--hue-N).
  Hue: number;
  Kind: HabitKind;
  // Per day: glasses, minutes… (1 for check-off habits).
  Target: number;
  Unit: string;
  Frequency: HabitFrequency;
  // Monday first, for "specific days".
  Days: boolean[];
  // For "times a week".
  PerWeek: number;
  TimeOfDay: TimeOfDay;
  Reminder: { On: boolean; At: HabitReminderAt };
  // When the last reminder went off (ISO).
  Reminded?: string | null;
  ShowOnHome: boolean;
  InTasks: boolean;
  // Set when archived (ISO).
  Archived?: string | null;
  // "YYYY-MM-DD" → the day's value: 1 for a check, the count, or minutes.
  Log: Record<string, number>;
  // A running timer (time habits): when it started.
  Timer?: string | null;
  Created: string;
  [key: string]: unknown;
}

export interface HabitFile {
  Habits: Habit[];
  [key: string]: unknown;
}

export const iconIds: HabitIconId[] = ["drop", "book", "route", "heart", "pen", "moon", "dumbbell", "music", "leaf", "code"];
export const hueNames = ["Violet", "Mint", "Amber", "Coral", "Sky", "Pink"];
const KINDS: HabitKind[] = ["check", "count", "time"];
const FREQS: HabitFrequency[] = ["daily", "days", "weekly"];
const TODS: TimeOfDay[] = ["morning", "anytime", "evening"];
const REMINDERS: HabitReminderAt[] = ["every2", "09:00", "12:00", "19:00"];

export const hueColor = (hue: number) => `var(--hue-${Math.min(5, Math.max(0, hue))})`;
export const hueSoft = (hue: number, amount = 16) => `color-mix(in srgb, ${hueColor(hue)} ${amount}%, transparent)`;

export function parseHabits(text: string | null): HabitFile {
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Habits: [] };
  const data = JSON.parse(clean) as Partial<HabitFile>;
  const habits = Array.isArray(data.Habits) ? data.Habits : [];
  return {
    ...data,
    Habits: habits
      .filter((h): h is Habit => Boolean(h) && typeof h === "object" && typeof h.Id === "string" && typeof h.Name === "string")
      .map((h) => {
        const kind = KINDS.includes(h.Kind) ? h.Kind : "check";
        const log: Record<string, number> = {};
        if (h.Log && typeof h.Log === "object") for (const [k, v] of Object.entries(h.Log)) if (isYmd(k) && typeof v === "number" && v > 0) log[k] = v;
        const days = Array.isArray(h.Days) && h.Days.length === 7 ? h.Days.map(Boolean) : [true, true, true, true, true, true, true];
        return {
          ...h,
          Icon: iconIds.includes(h.Icon) ? h.Icon : "leaf",
          Hue: typeof h.Hue === "number" ? Math.min(5, Math.max(0, Math.round(h.Hue))) : 0,
          Kind: kind,
          Target: kind === "check" ? 1 : typeof h.Target === "number" && h.Target > 0 ? h.Target : kind === "time" ? 20 : 8,
          Unit: typeof h.Unit === "string" ? h.Unit : kind === "time" ? "minutes" : "",
          Frequency: FREQS.includes(h.Frequency) ? h.Frequency : "daily",
          Days: days.some(Boolean) ? days : [true, true, true, true, true, true, true],
          PerWeek: typeof h.PerWeek === "number" ? Math.min(7, Math.max(1, Math.round(h.PerWeek))) : 3,
          TimeOfDay: TODS.includes(h.TimeOfDay) ? h.TimeOfDay : "anytime",
          Reminder: { On: Boolean(h.Reminder?.On), At: REMINDERS.includes(h.Reminder?.At) ? h.Reminder.At : "09:00" },
          ShowOnHome: h.ShowOnHome !== false,
          InTasks: Boolean(h.InTasks),
          Log: log,
          Created: typeof h.Created === "string" ? h.Created : new Date().toISOString(),
        };
      }),
  };
}

export const serializeHabits = (f: HabitFile) => JSON.stringify(f, null, 2);

// ----- days -----

export interface HabitRules {
  // The hour the day ends (3 = 3 AM).
  dayEnds: number;
  streakSaver: boolean;
}

export const defaultRules: HabitRules = { dayEnds: 3, streakSaver: true };

// The habit day a moment belongs to: before 3 AM it's still yesterday.
export function habitDay(at: Date, rules: HabitRules = defaultRules): string {
  return ymd(startOfDay(new Date(at.getTime() - rules.dayEnds * 3_600_000)));
}

const mondayIndex = (d: Date) => (d.getDay() + 6) % 7;

// The first day of the week holding `day` (Settings → General → Week starts on).
export function weekStartOf(day: string): string {
  const d = fromYmd(day);
  return ymd(addDays(d, -dayOfWeek(d)));
}

// Whether the habit asks for a check-in on that day.
export function isDue(h: Habit, day: string): boolean {
  if (h.Frequency === "days") return h.Days[mondayIndex(fromYmd(day))];
  return true;
}

export const valueOn = (h: Habit, day: string) => h.Log[day] ?? 0;
export const doneOn = (h: Habit, day: string) => valueOn(h, day) >= h.Target;
export const partialOn = (h: Habit, day: string) => valueOn(h, day) > 0 && !doneOn(h, day);

// Days done in the week holding `day`.
export function weekCount(h: Habit, day: string): number {
  const mon = fromYmd(weekStartOf(day));
  let n = 0;
  for (let i = 0; i < 7; i++) if (doneOn(h, ymd(addDays(mon, i)))) n++;
  return n;
}

const createdDay = (h: Habit) => habitDay(new Date(h.Created));

// ----- streaks -----

export interface Streak {
  count: number;
  // "day" for daily and specific-days habits, "week" for times a week.
  unit: "day" | "week";
}

// The streak up to today. Today counts once it's done; not done yet, it
// doesn't break anything.
export function currentStreak(h: Habit, today: string, rules: HabitRules = defaultRules): Streak {
  if (h.Frequency === "weekly") return { count: weekStreak(h, today, false), unit: "week" };
  return { count: dayRun(h, today, rules).current, unit: "day" };
}

export function bestStreak(h: Habit, today: string, rules: HabitRules = defaultRules): Streak {
  if (h.Frequency === "weekly") return { count: weekStreak(h, today, true), unit: "week" };
  return { count: dayRun(h, today, rules).best, unit: "day" };
}

// Walks the days from the habit's first check-in (or creation) to today,
// keeping the current run and the best one.
function dayRun(h: Habit, today: string, rules: HabitRules): { current: number; best: number } {
  const logged = Object.keys(h.Log).sort();
  const first = [createdDay(h), logged[0] ?? today].sort()[0];
  let run = 0;
  let best = 0;
  let savedWeek: string | null = null;
  for (let d = fromYmd(first); ymd(d) <= today; d = addDays(d, 1)) {
    const day = ymd(d);
    if (doneOn(h, day)) {
      run++;
      best = Math.max(best, run);
      continue;
    }
    if (!isDue(h, day) || day === today) continue;
    // A missed day: the streak saver covers one a week.
    const week = weekStartOf(day);
    if (rules.streakSaver && savedWeek !== week && run > 0) {
      savedWeek = week;
      continue;
    }
    run = 0;
  }
  return { current: run, best };
}

// Weeks in a row that hit the times-a-week number. This week counts once
// it's hit; until then it doesn't break the run.
function weekStreak(h: Habit, today: string, best: boolean): number {
  const thisWeek = weekStartOf(today);
  const firstWeek = weekStartOf([createdDay(h), ...Object.keys(h.Log)].sort()[0] ?? today);
  let run = 0;
  let top = 0;
  for (let w = fromYmd(firstWeek); ymd(w) <= thisWeek; w = addDays(w, 7)) {
    const week = ymd(w);
    const hit = weekCount(h, week) >= h.PerWeek;
    if (hit) {
      run++;
      top = Math.max(top, run);
    } else if (week !== thisWeek) run = 0;
  }
  return best ? top : run;
}

// Done on how many of the due days in the last 30 (today only when done).
export function rate30(h: Habit, today: string): number {
  let due = 0;
  let done = 0;
  const start = [createdDay(h), ...Object.keys(h.Log)].sort()[0] ?? today;
  for (let i = 0; i < 30; i++) {
    const day = ymd(addDays(fromYmd(today), -i));
    if (day < start) break;
    if (h.Frequency === "weekly") {
      if (doneOn(h, day)) done++;
      continue;
    }
    if (!isDue(h, day)) continue;
    if (day === today && !doneOn(h, day)) continue;
    due++;
    if (doneOn(h, day)) done++;
  }
  if (h.Frequency === "weekly") {
    const weeks = Math.max(1, Math.min(30, Math.round((fromYmd(today).getTime() - fromYmd(start).getTime()) / 86_400_000) + 1) / 7);
    return Math.min(100, Math.round((done / (h.PerWeek * weeks)) * 100));
  }
  return due ? Math.round((done / due) * 100) : 0;
}

export const totalDone = (h: Habit) => Object.keys(h.Log).filter((d) => doneOn(h, d)).length;

// "8 glasses", "20 minutes", "Check off".
export function goalLabel(h: Pick<Habit, "Kind" | "Target" | "Unit">): string {
  if (h.Kind === "check") return "Check off";
  return `${h.Target} ${h.Unit}`.trim();
}

const dayLetters = ["M", "T", "W", "T", "F", "S", "S"];

export function frequencyLabel(h: Pick<Habit, "Frequency" | "Days" | "PerWeek">): string {
  if (h.Frequency === "daily") return "Every day";
  if (h.Frequency === "weekly") return `${h.PerWeek} times a week`;
  const on = h.Days.filter(Boolean).length;
  if (on === 7) return "Every day";
  if (on === 5 && h.Days.slice(0, 5).every(Boolean)) return "Weekdays";
  if (on === 2 && h.Days[5] && h.Days[6]) return "Weekends";
  return h.Days.map((d, i) => (d ? dayLetters[i] : "")).filter(Boolean).join(" ");
}

export const todLabel: Record<TimeOfDay, string> = { morning: "Morning", anytime: "Anytime", evening: "Evening" };

export const reminderLabel = (h: Habit) =>
  !h.Reminder.On
    ? "Off"
    : h.Reminder.At === "every2"
      ? "Every 2 hours"
      : clockText(new Date(`2000-01-01T${h.Reminder.At}`));

// Where a day stands, for the week strip and the 12-week grid.
export type DayState = "done" | "partial" | "missed" | "off" | "today" | "future";

export function dayState(h: Habit, day: string, today: string): DayState {
  if (day > today) return "future";
  if (doneOn(h, day)) return "done";
  if (partialOn(h, day)) return "partial";
  if (day === today) return "today";
  if (!isDue(h, day) || h.Frequency === "weekly") return "off";
  return "missed";
}

// 0–3: none, a little (35%), most (65%), all of the day's target.
export function level(h: Habit, day: string): number {
  const v = valueOn(h, day);
  if (!v) return 0;
  if (v >= h.Target) return 3;
  return v / h.Target >= 0.5 ? 2 : 1;
}

export const activeHabits = (habits: Habit[]) => habits.filter((h) => !h.Archived);
