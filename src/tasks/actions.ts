// What people do to tasks, shared by the Tasks screen, the task pop-up, the
// popped-out window and Home. Each change goes through the task store and,
// where it's worth remembering, into the task's activity.
import { priorityLabel, type PriorityValue } from "../lib/notebook";
import { freeSlot, localStamp, type CalEvent } from "../schedule/events";
import { eventStore } from "../schedule/useEvents";
import { toast } from "../ui/Toast";
import { addDays, formatTime, fromYmd, nextMonday, parseQuick, startOfDay, weekend, ymd } from "./dates";
import { listFor } from "./lists";
import { newId, newTask, patchTask, recycle, restore, setCompleted, setDue, type NewTask, type RepeatId, type ReminderId, type Status, type Subtask, type Task } from "./model";
import { taskStore } from "./useTasks";

const store = () => taskStore();

export const statusLabel: Record<Status | "done", string> = { todo: "To do", doing: "In progress", done: "Done" };

export const repeatLabel: Record<RepeatId, string> = {
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  "2weeks": "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};

export const reminderLabel: Record<ReminderId, string> = {
  at: "At the due time",
  "10m": "10 min before",
  "30m": "30 min before",
  "1h": "1 hr before",
  morning: "Morning of, 9 AM",
  daybefore: "Day before, 9 AM",
};

export const estimates = [15, 30, 45, 60, 90, 120, 180, 240];

export function estimateLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr`;
}

export function addTask(fields: NewTask): Task {
  const task = newTask(fields, new Date());
  store().update((ts) => [...ts, task]);
  return task;
}

export function toggleTask(task: Task) {
  store().update((ts) => setCompleted(ts, task.Id, !task.Completed, new Date()));
}

export function setStatus(task: Task, status: Status | "done") {
  if (status === "done") {
    if (!task.Completed) toggleTask(task);
    return;
  }
  store().update((ts) => {
    let out = ts;
    if (task.Completed) out = setCompleted(out, task.Id, false, new Date());
    if ((task.Status ?? "todo") === status && !task.Completed) return out;
    return patchTask(out, task.Id, { Status: status }, { text: `Status changed to ${statusLabel[status]}`, kind: "status" });
  });
}

export function setPriority(task: Task, priority: PriorityValue) {
  if ((task.Priority ?? 0) === priority) return;
  store().update((ts) =>
    patchTask(ts, task.Id, { Priority: priority }, { text: priority ? `Priority set to ${priorityLabel[priority]}` : "Priority removed", kind: "priority" }),
  );
}

export function setList(task: Task, list: string) {
  if (task.List === list) return;
  store().update((ts) => patchTask(ts, task.Id, { List: list }, { text: `Moved to ${listFor(list).name}`, kind: "edit" }));
}

export function renameTask(task: Task, title: string) {
  const text = title.replace(/\s+/g, " ").trim();
  if (!text || text === task.Title) return;
  store().update((ts) => patchTask(ts, task.Id, { Title: text }));
}

export function setDescription(task: Task, notes: string) {
  if (notes === (task.Notes ?? "")) return;
  store().update((ts) => patchTask(ts, task.Id, { Notes: notes || undefined }));
}

export function setTaskDue(task: Task, due: string | null, time: string | null) {
  store().update((ts) => setDue(ts, task.Id, due, time));
}

export function patch(task: Task, fields: Partial<Task>, log?: string) {
  store().update((ts) => patchTask(ts, task.Id, fields, log ? { text: log, kind: "edit" } : undefined));
}

export function setTags(task: Task, tags: string[]) {
  store().update((ts) => patchTask(ts, task.Id, { Tags: tags }));
}

// ----- Later -----

export interface LaterChoice {
  id: "today" | "tomorrow" | "weekend" | "nextweek" | "someday";
  label: string;
  hint: string;
  due: string | null;
  time: string | null;
}

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

// The Later menu (Tasks.dc.html): Later today at 7 PM while that's still to
// come, Tomorrow, This weekend, Next week, and Someday (no date). A task keeps
// its time of day, except for Later today.
export function laterChoices(task: Task, now: Date): LaterChoice[] {
  const today = startOfDay(now);
  const keep = task.DueTime ?? null;
  const out: LaterChoice[] = [];
  if (now.getHours() < 19) out.push({ id: "today", label: "Later today", hint: formatTime("19:00").replace(":00", ""), due: ymd(today), time: "19:00" });
  const tomorrow = addDays(today, 1);
  // On a Friday, Saturday is already Tomorrow: the weekend means Sunday.
  let sat = weekend(today, true);
  if (today.getDay() === 5) sat = addDays(sat, 1);
  const mon = nextMonday(today);
  out.push({ id: "tomorrow", label: "Tomorrow", hint: shortDay(tomorrow), due: ymd(tomorrow), time: keep });
  out.push({ id: "weekend", label: today.getDay() === 0 ? "Next weekend" : "This weekend", hint: shortDay(sat), due: ymd(sat), time: keep });
  out.push({ id: "nextweek", label: "Next week", hint: shortDay(mon), due: ymd(mon), time: keep });
  out.push({ id: "someday", label: "Someday", hint: "No date", due: null, time: null });
  return out;
}

export function applyLater(task: Task, choice: LaterChoice) {
  store().update((ts) =>
    patchTask(setDue(ts, task.Id, choice.due, choice.time), task.Id, {}, { text: choice.due ? `Moved to ${choice.label.toLowerCase()}` : "Moved to Someday", kind: "edit" }),
  );
}

// ----- deleting -----

export function deleteTasks(tasks: Task[]) {
  if (!tasks.length) return;
  const ids = new Set(tasks.map((t) => t.Id));
  store().change((file) => recycle(file, ids, new Date()));
  const what = tasks.length === 1 ? `“${tasks[0].Title}”` : `${tasks.length} tasks`;
  toast(`Moved ${what} to the Recycle Bin`, () => store().change((file) => restore(file, ids)));
}

export function duplicateTask(task: Task): Task {
  const at = new Date().toISOString();
  const copy: Task = {
    ...task,
    Id: newId(),
    Title: `${task.Title} (copy)`,
    Completed: null,
    Subtasks: (task.Subtasks ?? []).map((s) => ({ ...s, Id: newId() })),
    Attachments: [],
    Activity: [{ At: at, Text: `Duplicated from “${task.Title}”`, Kind: "create" }],
    Created: at,
    Edited: at,
    NextId: null,
    Reminded: null,
  };
  store().update((ts) => [...ts, copy]);
  return copy;
}

// ----- subtasks -----

const editSubs = (task: Task, change: (subs: Subtask[]) => Subtask[], log?: string) =>
  store().update((ts) => {
    const t = ts.find((x) => x.Id === task.Id);
    return t ? patchTask(ts, task.Id, { Subtasks: change(t.Subtasks ?? []) }, log ? { text: log, kind: "subtask" } : undefined) : ts;
  });

// "Theme picker sat": the date is read off the end, like quick add.
export function addSubtask(task: Task, text: string) {
  const q = parseQuick(text, new Date());
  const title = (q.due ? q.title : text).trim();
  if (!title) return;
  editSubs(task, (subs) => [...subs, { Id: newId(), Text: title, Done: false, Due: q.due }]);
}

export function toggleSubtask(task: Task, sub: Subtask) {
  editSubs(task, (subs) => subs.map((s) => (s.Id === sub.Id ? { ...s, Done: !s.Done } : s)), sub.Done ? undefined : `Completed subtask “${sub.Text}”`);
}

export function renameSubtask(task: Task, sub: Subtask, text: string) {
  const t = text.trim();
  if (!t) return removeSubtask(task, sub);
  if (t !== sub.Text) editSubs(task, (subs) => subs.map((s) => (s.Id === sub.Id ? { ...s, Text: t } : s)));
}

export function removeSubtask(task: Task, sub: Subtask) {
  editSubs(task, (subs) => subs.filter((s) => s.Id !== sub.Id));
}

export function moveSubtask(task: Task, id: string, before: string | null) {
  editSubs(task, (subs) => {
    const moving = subs.find((s) => s.Id === id);
    if (!moving) return subs;
    const rest = subs.filter((s) => s.Id !== id);
    const at = before === null ? rest.length : rest.findIndex((s) => s.Id === before);
    rest.splice(at < 0 ? rest.length : at, 0, moving);
    return rest;
  });
}

// ----- time on the schedule -----

export function blockedEvents(task: Task, events: CalEvent[]): CalEvent[] {
  return events.filter((e) => e.Task === task.Id);
}

// Focus time for the task on the Schedule: at its due time if it has one,
// else the first free slot that day (today when undated), as long as its
// estimate (an hour without one).
export function blockTime(task: Task) {
  const events = eventStore();
  const now = new Date();
  const minutes = task.Estimate ?? 60;
  const day = task.Due && task.Due >= ymd(startOfDay(now)) ? task.Due : ymd(startOfDay(now));
  const { start, end } = freeSlot(events.getState().file.Events, day, task.Due === day ? (task.DueTime ?? null) : null, minutes, now);
  const event: CalEvent = {
    Id: newId(),
    Title: task.Title,
    Kind: "focus",
    Start: localStamp(start),
    End: localStamp(end),
    Calendar: task.List ?? "personal",
    Task: task.Id,
    Note: task.Note ?? null,
    Reminders: [],
    Created: now.toISOString(),
  };
  events.change((f) => ({ ...f, Events: [...f.Events, event] }));
  const span = `${shortDay(start)}, ${formatTime(event.Start.slice(11))}–${formatTime(event.End.slice(11))}`;
  store().update((ts) => patchTask(ts, task.Id, {}, { text: `Blocked ${span} on the schedule`, kind: "edit" }));
  toast(`Blocked ${span} on your schedule`, () => unblock(event.Id));
}

export function unblock(eventId: string) {
  eventStore().change((f) => ({ ...f, Events: f.Events.filter((e) => e.Id !== eventId) }));
}

export function eventLabel(e: CalEvent, now: Date): string {
  const day = e.Start.slice(0, 10);
  const diff = Math.round((fromYmd(day).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const name = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : shortDay(fromYmd(day));
  return `${name}, ${formatTime(e.Start.slice(11))}`;
}
