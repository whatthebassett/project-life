// The task list as it lives in Data\tasks.json, and the pure operations on it.
// Ported from Checkpoint; PascalCase keys like the app's other files, and keys
// this version doesn't know are kept, so nothing another version wrote is lost.
import { addDays, addMonths, daysBetween, fromYmd, isTime, isYmd, nowTime, startOfDay, ymd } from "./dates";
import { defaultListId, parseLists, type ListRecord } from "./lists";

// Done is Completed; these are the two states before it.
export type Status = "todo" | "doing";

export interface Subtask {
  Id: string;
  Text: string;
  Done: boolean;
  // "YYYY-MM-DD", read from the text when it was added ("Theme picker sat").
  Due?: string | null;
  [key: string]: unknown;
}

export type RepeatId = "daily" | "weekdays" | "weekly" | "2weeks" | "monthly" | "yearly";
export type ReminderId = "at" | "10m" | "30m" | "1h" | "morning" | "daybefore";

export interface Attachment {
  Id: string;
  // A copied file (its path under Data\Attachments) or a note (its file name).
  Kind: "file" | "note";
  Name: string;
  Path: string;
  // Bytes, for files.
  Size?: number;
  [key: string]: unknown;
}

// What happened to the task, newest last. Kind picks the dot's color.
export type ActivityKind = "create" | "priority" | "subtask" | "status" | "done" | "edit";
export interface Activity {
  At: string;
  Text: string;
  Kind: ActivityKind;
}

export interface Task {
  Id: string;
  Title: string;
  // The description, in Markdown; its first line shows under the title.
  Notes?: string;
  // "YYYY-MM-DD", the local day.
  Due?: string | null;
  // "HH:MM", only with a Due date.
  DueTime?: string | null;
  // 0 none, 1 low, 2 medium, 3 high.
  Priority?: number;
  // The list's id (tasks/lists.ts).
  List?: string;
  Status?: Status;
  Tags?: string[];
  Subtasks?: Subtask[];
  Repeat?: RepeatId | null;
  Reminder?: ReminderId | null;
  // When the reminder last went off (ISO), so it goes off once.
  Reminded?: string | null;
  // Minutes.
  Estimate?: number | null;
  // Sent from a note's to-do: the note's file name, and the to-do as written.
  Note?: string | null;
  NoteTodo?: string | null;
  Attachments?: Attachment[];
  Activity?: Activity[];
  // The copy a repeating task made when it was completed.
  NextId?: string | null;
  // ISO timestamps.
  Created: string;
  Edited?: string;
  Completed?: string | null;
  // Set on tasks in the Recycle Bin.
  Deleted?: string | null;
  [key: string]: unknown;
}

export interface TaskFile {
  Tasks: Task[];
  Lists: ListRecord[];
  // Deleted tasks, kept for 30 days.
  Recycled: Task[];
  [key: string]: unknown;
}

export const KEEP_DELETED_DAYS = 30;
const MAX_ACTIVITY = 100;

const isObject = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && s !== "") : []);
const oneOf = <T extends string>(x: unknown, options: readonly T[]): T | null => (options.includes(x as T) ? (x as T) : null);

const REPEATS = ["daily", "weekdays", "weekly", "2weeks", "monthly", "yearly"] as const;
const REMINDERS = ["at", "10m", "30m", "1h", "morning", "daybefore"] as const;
const ACTIVITY_KINDS = ["create", "priority", "subtask", "status", "done", "edit"] as const;

// Brings a task to the shape the rest of the code relies on (a hand edit or
// another version may differ). Null when it isn't a task at all.
function cleanTask(raw: unknown): Task | null {
  if (!isObject(raw) || typeof raw.Id !== "string" || typeof raw.Title !== "string") return null;
  const t = raw as Task;
  const created = typeof t.Created === "string" && !Number.isNaN(Date.parse(t.Created)) ? t.Created : new Date(0).toISOString();
  // The file may say anything; `true` (done, date unknown) counts as done.
  const done = (raw as Record<string, unknown>).Completed;
  const completed = typeof done === "string" && !Number.isNaN(Date.parse(done)) ? done : done === true ? created : null;
  const priority = typeof t.Priority === "number" && Number.isFinite(t.Priority) ? Math.min(3, Math.max(0, Math.round(t.Priority))) : 0;
  const subtasks = Array.isArray(t.Subtasks)
    ? t.Subtasks.filter((s): s is Subtask => isObject(s) && typeof s.Text === "string").map((s) => ({
        ...s,
        Id: typeof s.Id === "string" && s.Id ? s.Id : newId(),
        Done: s.Done === true,
        Due: isYmd(s.Due) ? s.Due : null,
      }))
    : [];
  const attachments = Array.isArray(t.Attachments)
    ? t.Attachments.filter((a): a is Attachment => isObject(a) && (a.Kind === "file" || a.Kind === "note") && typeof a.Path === "string").map((a) => ({
        ...a,
        Id: typeof a.Id === "string" && a.Id ? a.Id : newId(),
        Name: typeof a.Name === "string" ? a.Name : a.Path,
      }))
    : [];
  const activity = Array.isArray(t.Activity)
    ? t.Activity.filter((a): a is Activity => isObject(a) && typeof a.Text === "string" && typeof a.At === "string").map((a) => ({
        At: a.At,
        Text: a.Text,
        Kind: oneOf(a.Kind, ACTIVITY_KINDS) ?? "edit",
      }))
    : [];
  return {
    ...t,
    Notes: typeof t.Notes === "string" ? t.Notes : undefined,
    Due: isYmd(t.Due) ? t.Due : null,
    DueTime: isYmd(t.Due) && isTime(t.DueTime) ? t.DueTime : null,
    Priority: priority,
    List: typeof t.List === "string" && t.List ? t.List : defaultListId(),
    Status: oneOf(t.Status, ["todo", "doing"] as const) ?? "todo",
    Tags: strings(t.Tags),
    Subtasks: subtasks,
    Repeat: oneOf(t.Repeat, REPEATS),
    Reminder: oneOf(t.Reminder, REMINDERS),
    Estimate: typeof t.Estimate === "number" && t.Estimate > 0 ? Math.round(t.Estimate) : null,
    Note: typeof t.Note === "string" && t.Note ? t.Note : null,
    NoteTodo: typeof t.NoteTodo === "string" && t.NoteTodo ? t.NoteTodo : null,
    Attachments: attachments,
    Activity: activity,
    Created: created,
    Completed: completed,
  };
}

// Reads the file. Throws when it isn't valid JSON: the store then refuses to
// save, rather than writing an empty list over tasks it couldn't read.
export function parseFile(text: string | null): TaskFile {
  // Notepad and some sync tools start files with a byte-order mark.
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Tasks: [], Lists: parseLists(null), Recycled: [] };
  const data = JSON.parse(clean) as Partial<TaskFile>;
  const tasks = Array.isArray(data.Tasks) ? data.Tasks : [];
  const recycled = Array.isArray(data.Recycled) ? data.Recycled : [];
  // Deleted tasks go for good after 30 days.
  const cutoff = Date.now() - KEEP_DELETED_DAYS * 86_400_000;
  return {
    ...data,
    Lists: parseLists(data.Lists),
    Tasks: tasks.map(cleanTask).filter((t): t is Task => t !== null),
    Recycled: recycled
      .map(cleanTask)
      .filter((t): t is Task => t !== null)
      .filter((t) => !t.Deleted || Date.parse(t.Deleted) > cutoff),
  };
}

export function serialize(file: TaskFile): string {
  return JSON.stringify(file, null, 2);
}

export const newId = () => crypto.randomUUID().replace(/-/g, "");

export interface NewTask {
  title: string;
  due: string | null;
  time: string | null;
  priority?: number;
  list?: string;
  tags?: string[];
  // How it was made, for its activity: "Created with quick add".
  how?: string;
  note?: string | null;
  noteTodo?: string | null;
}

export function newTask({ title, due, time, priority = 0, list, tags = [], how = "Created", note = null, noteTodo = null }: NewTask, now: Date): Task {
  const at = now.toISOString();
  return {
    Id: newId(),
    Title: title,
    Due: due,
    DueTime: due ? time : null,
    Priority: priority,
    List: list ?? defaultListId(),
    Status: "todo",
    Tags: tags,
    Subtasks: [],
    Note: note,
    NoteTodo: noteTodo,
    Attachments: [],
    Activity: [{ At: at, Text: how, Kind: "create" }],
    Created: at,
    Edited: at,
    Completed: null,
  };
}

// A change to one task, stamped as edited; with `log`, also noted in its activity.
export function patchTask(tasks: Task[], id: string, fields: Partial<Task>, log?: { text: string; kind: ActivityKind }): Task[] {
  const at = new Date().toISOString();
  return tasks.map((t) => {
    if (t.Id !== id) return t;
    const next: Task = { ...t, ...fields, Edited: at };
    if (log) next.Activity = [...(t.Activity ?? []), { At: at, Text: log.text, Kind: log.kind }].slice(-MAX_ACTIVITY);
    return next;
  });
}

export function setDue(tasks: Task[], id: string, due: string | null, time: string | null): Task[] {
  return patchTask(tasks, id, { Due: due, DueTime: due ? time : null, Reminded: null });
}

// The next day a repeating task is due, from the day it was due (or today).
export function nextDue(repeat: RepeatId, from: string): string {
  const d = fromYmd(from);
  switch (repeat) {
    case "daily":
      return ymd(addDays(d, 1));
    case "weekdays": {
      let next = addDays(d, 1);
      while (next.getDay() === 0 || next.getDay() === 6) next = addDays(next, 1);
      return ymd(next);
    }
    case "weekly":
      return ymd(addDays(d, 7));
    case "2weeks":
      return ymd(addDays(d, 14));
    case "monthly":
      return ymd(addMonths(d, 1));
    case "yearly":
      return ymd(addMonths(d, 12));
  }
}

// Checking a task off (or back on). A repeating task, checked off, makes its
// next one: the same task, due on the next day it repeats, subtasks unticked.
export function setCompleted(tasks: Task[], id: string, done: boolean, now: Date): Task[] {
  const task = tasks.find((t) => t.Id === id);
  if (!task || Boolean(task.Completed) === done) return tasks;
  let out = patchTask(tasks, id, { Completed: done ? now.toISOString() : null }, { text: done ? "Marked complete" : "Marked not done", kind: "done" });
  if (done && task.Repeat && !(task.NextId && tasks.some((t) => t.Id === task.NextId))) {
    const today = ymd(startOfDay(now));
    let due = nextDue(task.Repeat, task.Due ?? today);
    // An overdue repeat skips ahead to its next day still to come.
    while (due < today) due = nextDue(task.Repeat, due);
    const at = now.toISOString();
    const next: Task = {
      ...task,
      Id: newId(),
      Due: due,
      Status: "todo",
      Subtasks: (task.Subtasks ?? []).map((s) => ({ ...s, Done: false })),
      Activity: [{ At: at, Text: "Repeats from the last one", Kind: "create" }],
      Created: at,
      Edited: at,
      Completed: null,
      Reminded: null,
      NextId: null,
    };
    out = patchTask(out, id, { NextId: next.Id });
    out = [...out, next];
  }
  return out;
}

// ----- the Recycle Bin -----

export function recycle(file: TaskFile, ids: Set<string>, now: Date): TaskFile {
  const at = now.toISOString();
  const gone = file.Tasks.filter((t) => ids.has(t.Id)).map((t) => ({ ...t, Deleted: at }));
  return { ...file, Tasks: file.Tasks.filter((t) => !ids.has(t.Id)), Recycled: [...gone, ...file.Recycled] };
}

export function restore(file: TaskFile, ids: Set<string>): TaskFile {
  const back = file.Recycled.filter((t) => ids.has(t.Id)).map((t) => ({ ...t, Deleted: null }));
  const have = new Set(file.Tasks.map((t) => t.Id));
  return { ...file, Tasks: [...file.Tasks, ...back.filter((t) => !have.has(t.Id))], Recycled: file.Recycled.filter((t) => !ids.has(t.Id)) };
}

export function purge(file: TaskFile, ids: Set<string>): TaskFile {
  return { ...file, Recycled: file.Recycled.filter((t) => !ids.has(t.Id)) };
}

// ----- reading tasks -----

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

// Most recently completed first.
export const byCompleted = (a: Task, b: Task) => (b.Completed ?? "").localeCompare(a.Completed ?? "");

// Today's tasks: due today or overdue and still open, plus everything checked
// off today (whatever it was due), so the day's progress adds up. This is what
// the Today rings count.
export function todaysTasks(tasks: Task[], now: Date): Task[] {
  const today = ymd(startOfDay(now));
  return tasks.filter((t) => (t.Completed ? ymd(new Date(t.Completed)) === today : Boolean(t.Due) && t.Due! <= today)).sort(byDue);
}

export function openCount(tasks: Task[]): number {
  return tasks.reduce((n, t) => n + (t.Completed ? 0 : 1), 0);
}

export function subtaskProgress(task: Task): { done: number; total: number } {
  const subs = task.Subtasks ?? [];
  return { done: subs.filter((s) => s.Done).length, total: subs.length };
}
