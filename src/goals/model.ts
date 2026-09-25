// Goals as they live in Data\goals.json, with their areas, and how progress,
// pace and status are worked out (DESIGN.md §2: goal status). PascalCase
// keys, and keys this version doesn't know are kept.
import { doneOn, type Habit } from "../habits/model";
import { addDays, daysBetween, fromYmd, isYmd, ymd } from "../tasks/dates";

export type GoalKind = "number" | "milestones" | "once";
export type CheckIn = "sun" | "mon" | "month" | "none";

export interface Milestone {
  Id: string;
  Text: string;
  Due?: string | null;
  // When it was ticked off (ISO).
  Done?: string | null;
  [key: string]: unknown;
}

// A habit linked to a goal; with Count on, each day it's done adds Per.
export interface HabitLink {
  Id: string;
  Count: boolean;
  Per: number;
}

export interface Goal {
  Id: string;
  Title: string;
  Area: string;
  Why: string;
  Kind: GoalKind;
  StartValue: number;
  Target: number;
  Unit: string;
  // What Log adds each time.
  Step: number;
  Milestones: Milestone[];
  // "Done or not" goals: when it was marked done (ISO).
  Done?: string | null;
  StartDate: string;
  Due: string;
  // Progress logged by hand (number goals), newest last.
  Log: { At: string; Delta: number }[];
  Habits: HabitLink[];
  Tasks: string[];
  Events: string[];
  Notes: string[];
  CheckIn: CheckIn;
  // When the last check-in reminder went off (ISO).
  CheckedIn?: string | null;
  Created: string;
  [key: string]: unknown;
}

export interface Area {
  Id: string;
  Name: string;
  // 0–5: the six color picks.
  Hue: number;
  [key: string]: unknown;
}

export interface GoalFile {
  Goals: Goal[];
  Areas: Area[];
  [key: string]: unknown;
}

export const defaultAreas: Area[] = [
  { Id: "projects", Name: "Projects", Hue: 0 },
  { Id: "health", Name: "Health", Hue: 1 },
  { Id: "creative", Name: "Creative", Hue: 5 },
  { Id: "home", Name: "Home", Hue: 2 },
];

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s !== "") : []);
const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);

export function parseGoals(text: string | null): GoalFile {
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Goals: [], Areas: defaultAreas };
  const data = JSON.parse(clean) as Partial<GoalFile>;
  const areas = Array.isArray(data.Areas)
    ? data.Areas.filter((a): a is Area => Boolean(a) && typeof a.Id === "string" && typeof a.Name === "string").map((a) => ({ ...a, Hue: Math.min(5, Math.max(0, Math.round(num(a.Hue, 0)))) }))
    : [];
  const goals = Array.isArray(data.Goals) ? data.Goals : [];
  return {
    ...data,
    Areas: areas.length ? areas : defaultAreas,
    Goals: goals
      .filter((g): g is Goal => Boolean(g) && typeof g === "object" && typeof g.Id === "string" && typeof g.Title === "string")
      .map((g) => {
        const created = typeof g.Created === "string" ? g.Created : new Date().toISOString();
        const start = isYmd(g.StartDate) ? g.StartDate : created.slice(0, 10);
        return {
          ...g,
          Area: typeof g.Area === "string" ? g.Area : "projects",
          Why: typeof g.Why === "string" ? g.Why : "",
          Kind: (["number", "milestones", "once"] as const).includes(g.Kind) ? g.Kind : "number",
          StartValue: num(g.StartValue, 0),
          Target: num(g.Target, 100),
          Unit: typeof g.Unit === "string" ? g.Unit : "",
          Step: num(g.Step, 1) > 0 ? num(g.Step, 1) : 1,
          Milestones: Array.isArray(g.Milestones)
            ? g.Milestones.filter((m): m is Milestone => Boolean(m) && typeof m.Text === "string").map((m) => ({ ...m, Id: typeof m.Id === "string" ? m.Id : crypto.randomUUID(), Due: isYmd(m.Due) ? m.Due : null }))
            : [],
          StartDate: start,
          Due: isYmd(g.Due) && g.Due > start ? g.Due : ymd(addDays(fromYmd(start), 90)),
          Log: Array.isArray(g.Log) ? g.Log.filter((l) => l && typeof l.At === "string" && typeof l.Delta === "number") : [],
          Habits: Array.isArray(g.Habits) ? g.Habits.filter((l) => l && typeof l.Id === "string").map((l) => ({ Id: l.Id, Count: Boolean(l.Count), Per: num(l.Per, 1) })) : [],
          Tasks: strings(g.Tasks),
          Events: strings(g.Events),
          Notes: strings(g.Notes),
          CheckIn: (["sun", "mon", "month", "none"] as const).includes(g.CheckIn) ? g.CheckIn : "none",
          Created: created,
        };
      }),
  };
}

export const serializeGoals = (f: GoalFile) => JSON.stringify(f, null, 2);

// ----- progress -----

// Days a linked, counting habit was done from the goal's start to `upTo`.
function habitDays(goal: Goal, habits: Habit[], upTo: string): number {
  let total = 0;
  for (const link of goal.Habits) {
    if (!link.Count) continue;
    const h = habits.find((x) => x.Id === link.Id);
    if (!h) continue;
    const days = Object.keys(h.Log).filter((d) => d >= goal.StartDate && d <= upTo && doneOn(h, d)).length;
    total += days * link.Per;
  }
  return total;
}

// Where a number goal stands on a day: its start, what was logged, and what
// linked habits added.
export function valueOn(goal: Goal, habits: Habit[], day: string): number {
  const logged = goal.Log.filter((l) => l.At.slice(0, 10) <= day).reduce((n, l) => n + l.Delta, 0);
  return round(goal.StartValue + logged + habitDays(goal, habits, day));
}

const round = (n: number) => Math.round(n * 100) / 100;

export function progressOn(goal: Goal, habits: Habit[], day: string): number {
  if (goal.Kind === "once") return goal.Done && goal.Done.slice(0, 10) <= day ? 100 : 0;
  if (goal.Kind === "milestones") {
    if (!goal.Milestones.length) return 0;
    const done = goal.Milestones.filter((m) => m.Done && m.Done.slice(0, 10) <= day).length;
    return Math.round((done / goal.Milestones.length) * 100);
  }
  const span = goal.Target - goal.StartValue;
  const v = valueOn(goal, habits, day);
  if (span <= 0) return v >= goal.Target ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((v - goal.StartValue) / span) * 100)));
}

// How far along an even pace would be by `day`: the share of the time
// window that has gone by.
export function paceOn(goal: Goal, day: string): number {
  const total = daysBetween(goal.StartDate, goal.Due);
  if (total <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((daysBetween(goal.StartDate, day) / total) * 100)));
}

export type GoalStatus = "done" | "ahead" | "on" | "behind";

// DESIGN.md: Done at 100; Ahead at +8 or more over pace; On track within 8;
// Behind below that.
export function statusOf(pct: number, pace: number): GoalStatus {
  if (pct >= 100) return "done";
  const diff = pct - pace;
  if (diff >= 8) return "ahead";
  if (diff >= -8) return "on";
  return "behind";
}

export const statusLabel: Record<GoalStatus, string> = { done: "Done", ahead: "Ahead", on: "On track", behind: "Behind" };

export const statusStyle: Record<GoalStatus, { bg: string; fg: string }> = {
  done: { bg: "var(--accent2)", fg: "var(--accent-ink)" },
  ahead: { bg: "var(--accent2-soft)", fg: "var(--accent2)" },
  on: { bg: "var(--panel2)", fg: "var(--text)" },
  behind: { bg: "var(--warn-soft)", fg: "var(--warn)" },
};

// The progress line's points: at the start, on each day something changed,
// and today.
export function historyOf(goal: Goal, habits: Habit[], today: string): { day: string; pct: number }[] {
  const end = today < goal.Due ? today : goal.Due;
  const days = new Set<string>([goal.StartDate, end]);
  for (const l of goal.Log) days.add(l.At.slice(0, 10));
  for (const m of goal.Milestones) if (m.Done) days.add(m.Done.slice(0, 10));
  if (goal.Done) days.add(goal.Done.slice(0, 10));
  for (const link of goal.Habits) {
    const h = link.Count ? habits.find((x) => x.Id === link.Id) : null;
    if (h) for (const d of Object.keys(h.Log)) days.add(d);
  }
  let sorted = [...days].filter((d) => d >= goal.StartDate && d <= end).sort();
  // Many small changes (daily habits): keep the shape without a point a day.
  if (sorted.length > 40) {
    const every = Math.ceil(sorted.length / 40);
    sorted = sorted.filter((d, i) => i % every === 0 || d === end);
  }
  return sorted.map((day) => ({ day, pct: progressOn(goal, habits, day) }));
}

// "About 23 subscribers a week gets you there by Dec 31."
export function paceNote(goal: Goal, habits: Habit[], today: string): string {
  const left = goal.Target - valueOn(goal, habits, today);
  if (left <= 0) return "Goal reached. Nice work.";
  const days = Math.max(1, daysBetween(today, goal.Due));
  const perWeek = left / (days / 7);
  const due = fromYmd(goal.Due).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 7) return `${fmt(left)} ${goal.Unit} to go by ${due}.`;
  return `About ${fmt(perWeek)} ${goal.Unit} a week gets you there by ${due}.`;
}

export const fmt = (n: number) => (Math.abs(n) >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));

export const isFinished = (goal: Goal, habits: Habit[], today: string) => progressOn(goal, habits, today) >= 100;
