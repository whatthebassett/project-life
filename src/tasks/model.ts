// The task list as it lives in Data\tasks.json, and the pure operations on it.
// Ported from Checkpoint; PascalCase keys like the app's other files, and keys
// this version doesn't know are kept, so nothing another version wrote is lost.
import { daysBetween, isTime, isYmd, nowTime, startOfDay, ymd } from "./dates";
import { defaultList } from "./lists";

export interface Task {
  Id: string;
  Title: string;
  // An optional second line.
  Notes?: string;
  // "YYYY-MM-DD", the local day.
  Due?: string | null;
  // "HH:MM", only with a Due date.
  DueTime?: string | null;
  // 0 none, 1 low, 2 medium, 3 high.
  Priority?: number;
  // The list's id (tasks/lists.ts).
  List?: string;
  // ISO timestamps.
  Created: string;
  Completed?: string | null;
  [key: string]: unknown;
}

export interface TaskFile {
  Tasks: Task[];
  [key: string]: unknown;
}

// Reads the file. Throws when it isn't valid JSON: the store then refuses to
// save, rather than writing an empty list over tasks it couldn't read.
export function parseFile(text: string | null): TaskFile {
  // Notepad and some sync tools start files with a byte-order mark.
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Tasks: [] };
  const data = JSON.parse(clean) as Partial<TaskFile>;
  const tasks = Array.isArray(data.Tasks) ? data.Tasks : [];
  return {
    ...data,
    // Drop anything that isn't a task; bring every field to the shape the
    // rest of the code relies on (a hand edit or another version may differ).
    Tasks: tasks
      .filter((t): t is Task => Boolean(t) && typeof t === "object" && typeof t.Id === "string" && typeof t.Title === "string")
      .map((t) => {
        const created = typeof t.Created === "string" && !Number.isNaN(Date.parse(t.Created)) ? t.Created : new Date(0).toISOString();
        // The file may say anything; `true` (done, date unknown) counts as done.
        const raw = (t as Record<string, unknown>).Completed;
        const completed = typeof raw === "string" && !Number.isNaN(Date.parse(raw)) ? raw : raw === true ? created : null;
        const priority = typeof t.Priority === "number" && Number.isFinite(t.Priority) ? Math.min(3, Math.max(0, Math.round(t.Priority))) : 0;
        return {
          ...t,
          Notes: typeof t.Notes === "string" ? t.Notes : undefined,
          Due: isYmd(t.Due) ? t.Due : null,
          DueTime: isYmd(t.Due) && isTime(t.DueTime) ? t.DueTime : null,
          Priority: priority,
          List: typeof t.List === "string" && t.List ? t.List : defaultList,
          Created: created,
          Completed: completed,
        };
      }),
  };
}

export function serialize(file: TaskFile): string {
  return JSON.stringify(file, null, 2);
}

export interface NewTask {
  title: string;
  due: string | null;
  time: string | null;
  priority?: number;
  list?: string;
}

export function newTask({ title, due, time, priority = 0, list = defaultList }: NewTask, now: Date): Task {
  return {
    Id: crypto.randomUUID().replace(/-/g, ""),
    Title: title,
    Due: due,
    DueTime: due ? time : null,
    Priority: priority,
    List: list,
    Created: now.toISOString(),
    Completed: null,
  };
}

export function patchTask(tasks: Task[], id: string, fields: Partial<Task>): Task[] {
  return tasks.map((t) => (t.Id === id ? { ...t, ...fields } : t));
}

export function setCompleted(tasks: Task[], id: string, done: boolean, now: Date): Task[] {
  return patchTask(tasks, id, { Completed: done ? now.toISOString() : null });
}

// Overdue once the day has gone by, or today's time has.
export function isOverdue(task: Task, now: Date): boolean {
  if (!task.Due || task.Completed) return false;
  const diff = daysBetween(ymd(startOfDay(now)), task.Due);
  return diff < 0 || (diff === 0 && Boolean(task.DueTime) && task.DueTime! < nowTime(now));
}

// Soonest first; on the same day, timed tasks in time order before untimed
// ones; then higher priority; then the order they were added.
export function byDue(a: Task, b: Task): number {
  return (
    (a.Due ?? "9999").localeCompare(b.Due ?? "9999") ||
    (a.DueTime ? 0 : 1) - (b.DueTime ? 0 : 1) ||
    (a.DueTime ?? "").localeCompare(b.DueTime ?? "") ||
    (b.Priority ?? 0) - (a.Priority ?? 0) ||
    a.Created.localeCompare(b.Created)
  );
}

// Today's tasks: due today or overdue and still open, plus everything checked
// off today (whatever it was due), so the day's progress adds up. This is what
// Home's Today ring counts.
export function todaysTasks(tasks: Task[], now: Date): Task[] {
  const today = ymd(startOfDay(now));
  return tasks.filter((t) => (t.Completed ? ymd(new Date(t.Completed)) === today : Boolean(t.Due) && t.Due! <= today)).sort(byDue);
}

export function openCount(tasks: Task[]): number {
  return tasks.reduce((n, t) => n + (t.Completed ? 0 : 1), 0);
}
