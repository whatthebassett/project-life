// What people do to goals and their areas.
import { newId } from "../tasks/model";
import { addDays, daysBetween, fromYmd, ymd } from "../tasks/dates";
import { currentSettings } from "../lib/settings";
import { toast } from "../ui/Toast";
import type { Area, Goal, Milestone } from "./model";
import { goalStore } from "./useGoals";

const store = () => goalStore();

function edit(id: string, change: (g: Goal) => Goal) {
  store().change((f) => ({ ...f, Goals: f.Goals.map((g) => (g.Id === id ? change(g) : g)) }));
}

// Number goals: Log adds a step; – takes one back.
export function logProgress(goal: Goal, delta: number) {
  edit(goal.Id, (g) => ({ ...g, Log: [...g.Log, { At: new Date().toISOString(), Delta: delta }] }));
}

export function toggleMilestone(goal: Goal, m: Milestone) {
  edit(goal.Id, (g) => ({ ...g, Milestones: g.Milestones.map((x) => (x.Id === m.Id ? { ...x, Done: x.Done ? null : new Date().toISOString() } : x)) }));
}

export function setDone(goal: Goal, done: boolean) {
  edit(goal.Id, (g) => ({ ...g, Done: done ? new Date().toISOString() : null }));
}

// Milestones without a date get one, spaced evenly up to the due date.
export function spaceMilestones(ms: Milestone[], start: string, due: string): Milestone[] {
  const span = Math.max(1, daysBetween(start, due));
  return ms.map((m, i) => (m.Due ? m : { ...m, Due: ymd(addDays(fromYmd(start), Math.round((span * (i + 1)) / ms.length))) }));
}

export function blankGoal(area: string): Goal {
  const today = ymd(new Date());
  return {
    Id: newId(),
    Title: "",
    Area: area,
    Why: "",
    Kind: "number",
    StartValue: 0,
    Target: 100,
    Unit: "",
    Step: 1,
    Milestones: [],
    Done: null,
    StartDate: today,
    Due: `${new Date().getFullYear()}-12-31`,
    Log: [],
    Habits: [],
    Tasks: [],
    Events: [],
    Notes: [],
    // Settings → Habits and goals picks the day new goals check in.
    CheckIn: currentSettings().GoalCheckIn ?? "sun",
    CheckedIn: new Date().toISOString(),
    Created: new Date().toISOString(),
  };
}

export function saveGoal(goal: Goal) {
  const g = { ...goal, Milestones: spaceMilestones(goal.Milestones, goal.StartDate, goal.Due) };
  store().change((f) => ({ ...f, Goals: f.Goals.some((x) => x.Id === g.Id) ? f.Goals.map((x) => (x.Id === g.Id ? g : x)) : [...f.Goals, g] }));
}

export function deleteGoal(goal: Goal) {
  const before = store().getState().file.Goals;
  store().change((f) => ({ ...f, Goals: f.Goals.filter((x) => x.Id !== goal.Id) }));
  toast(`Deleted “${goal.Title}”`, () => store().change((f) => ({ ...f, Goals: before })));
}

// ----- areas -----

export function addArea(name: string, taken: Area[]): Area {
  const used = new Set(taken.map((a) => a.Hue));
  const hue = [0, 1, 2, 3, 4, 5].find((h) => !used.has(h)) ?? taken.length % 6;
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "area";
  let id = base;
  for (let n = 2; taken.some((a) => a.Id === id); n++) id = `${base}-${n}`;
  const area = { Id: id, Name: name, Hue: hue };
  store().change((f) => ({ ...f, Areas: [...f.Areas, area] }));
  return area;
}

export function patchArea(id: string, fields: Partial<Area>) {
  store().change((f) => ({ ...f, Areas: f.Areas.map((a) => (a.Id === id ? { ...a, ...fields } : a)) }));
}

// An area's goals move to another one when it goes.
export function deleteArea(id: string, moveTo: string) {
  store().change((f) => ({ ...f, Areas: f.Areas.filter((a) => a.Id !== id), Goals: f.Goals.map((g) => (g.Area === id ? { ...g, Area: moveTo } : g)) }));
}
