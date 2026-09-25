// The Tasks screen's views and groups (Tasks.dc.html), as pure functions.
import { daysBetween, formatDue, formatTime, fromYmd, startOfDay, ymd } from "./dates";
import { listFor, type TaskList } from "./lists";
import { byCompleted, byDue, isOverdue, type Task } from "./model";

export type BaseView = "today" | "upcoming" | "all" | "someday" | "completed";
export type ViewId = BaseView | `list:${string}`;

export const baseViews: { id: BaseView; label: string; glyph: string }[] = [
  { id: "today", label: "Today", glyph: "" },
  { id: "upcoming", label: "Upcoming", glyph: "→" },
  { id: "all", label: "All tasks", glyph: "∗" },
  { id: "someday", label: "Someday", glyph: "~" },
  { id: "completed", label: "Completed", glyph: "✓" },
];

export function parseView(v: unknown): ViewId {
  if (typeof v === "string" && (baseViews.some((b) => b.id === v) || v.startsWith("list:"))) return v as ViewId;
  return "today";
}

export const listOfView = (v: ViewId): string | null => (v.startsWith("list:") ? v.slice(5) : null);

export function viewHeading(v: ViewId): string {
  const list = listOfView(v);
  if (list) return listFor(list).name;
  return baseViews.find((b) => b.id === v)!.label;
}

// Whether a task shows in a view (done ones included; they sit in Completed).
export function inView(t: Task, v: ViewId, now: Date): boolean {
  const today = ymd(startOfDay(now));
  const list = listOfView(v);
  if (list) return t.List === list;
  switch (v) {
    case "today":
      // Due today or before, plus whatever was checked off today.
      return (Boolean(t.Due) && t.Due! <= today) || (Boolean(t.Completed) && ymd(new Date(t.Completed!)) === today);
    case "upcoming":
      return Boolean(t.Due) && t.Due! > today;
    case "someday":
      return !t.Due;
    case "completed":
      return Boolean(t.Completed);
    default:
      return true;
  }
}

// The open tasks each view holds, for the counts beside them.
export function viewCount(tasks: Task[], v: ViewId, now: Date): number {
  if (v === "completed") return tasks.filter((t) => t.Completed).length;
  return tasks.filter((t) => !t.Completed && inView(t, v, now)).length;
}

export type DateGroup = "overdue" | "today" | "tomorrow" | "upcoming" | "someday" | "completed";

export interface Group {
  id: string;
  label: string;
  // Overdue's heading is red.
  danger?: boolean;
  // The date group the rows are in, for how their due dates read.
  kind: DateGroup | "list";
  tasks: Task[];
}

export function dateGroupOf(t: Task, now: Date): DateGroup {
  if (t.Completed) return "completed";
  if (!t.Due) return "someday";
  if (isOverdue(t, now)) return "overdue";
  const diff = daysBetween(ymd(startOfDay(now)), t.Due);
  return diff <= 0 ? "today" : diff === 1 ? "tomorrow" : "upcoming";
}

const dateGroups: { id: DateGroup; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "upcoming", label: "Upcoming" },
  { id: "someday", label: "Someday" },
  { id: "completed", label: "Completed" },
];

// The non-empty groups in order. Tasks in `settling` were just checked off
// and stay where they were for a moment, so the tick can be seen.
export function groupTasks(tasks: Task[], by: "date" | "list", lists: TaskList[], now: Date, settling: ReadonlySet<string>): Group[] {
  const open = (t: Task) => !t.Completed || settling.has(t.Id);
  const sortOpen = (ts: Task[]) => ts.sort(byDue);
  if (by === "list") {
    const known = new Set(lists.map((l) => l.id));
    const groups: Group[] = lists.map((l) => ({
      id: `list:${l.id}`,
      label: l.name,
      kind: "list",
      tasks: sortOpen(tasks.filter((t) => open(t) && (t.List === l.id || (!known.has(t.List ?? "") && l === lists[0])))),
    }));
    groups.push({ id: "completed", label: "Completed", kind: "completed", tasks: tasks.filter((t) => !open(t)).sort(byCompleted) });
    return groups.filter((g) => g.tasks.length > 0);
  }
  const buckets = new Map<DateGroup, Task[]>(dateGroups.map((g) => [g.id, []]));
  for (const t of tasks) buckets.get(settling.has(t.Id) ? dateGroupOf({ ...t, Completed: null }, now) : dateGroupOf(t, now))!.push(t);
  return dateGroups
    .map((g) => ({
      id: g.id,
      label: g.label,
      danger: g.id === "overdue",
      kind: g.id,
      tasks: g.id === "completed" ? buckets.get(g.id)!.sort(byCompleted) : sortOpen(buckets.get(g.id)!),
    }))
    .filter((g) => g.tasks.length > 0);
}

// How the due date reads on a row: in Today and Tomorrow the group already
// says the day, so only a time shows.
export function rowDue(t: Task, kind: Group["kind"], now: Date): string {
  if (!t.Due || t.Completed) return "";
  if (kind === "today" || kind === "tomorrow") return t.DueTime ? formatTime(t.DueTime) : "";
  return formatDue(t.Due, t.DueTime, startOfDay(now));
}

// "Mon, Sep 28 · 5:00 PM", "Today", "Someday": the details panel's Due.
export function dueLabel(t: Task, now: Date): string {
  if (!t.Due) return "Someday";
  const today = startOfDay(now);
  const diff = daysBetween(ymd(today), t.Due);
  const day =
    diff === 0
      ? "Today"
      : diff === 1
        ? "Tomorrow"
        : diff === -1
          ? "Yesterday"
          : fromYmd(t.Due).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: fromYmd(t.Due).getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return t.DueTime ? `${day} · ${formatTime(t.DueTime)}` : day;
}

export function dueTone(t: Task, now: Date): "danger" | "accent" | "muted" {
  if (t.Completed || !t.Due) return "muted";
  if (isOverdue(t, now)) return "danger";
  return daysBetween(ymd(startOfDay(now)), t.Due) === 0 ? "accent" : "muted";
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
