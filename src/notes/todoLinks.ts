// Note to-dos sent to Tasks. A sent to-do becomes a task that remembers the
// note and the to-do's text (Task.Note, Task.NoteTodo); nothing is added to
// the note. Ticking either one ticks the other, matched by that text.
import type { TodoLink } from "../editor/taskLinks";
import { toast } from "../ui/Toast";
import { addTask } from "../tasks/actions";
import { daysBetween, formatDue, fromYmd, startOfDay, ymd } from "../tasks/dates";
import { isOverdue, type Task } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { parseCapture } from "../tasks/quick";
import { taskStore } from "../tasks/useTasks";

const TODO = /^(\s*(?:[-*+]|\d+[.)])\s+\[)( |x|X)(\]\s+)(.*)$/;

// A to-do's Markdown as plain text, the way the editor shows it: formatting
// marks, links' addresses, tags and date chips taken out.
export function plainTodo(md: string): string {
  return md
    .replace(/<time[^>]*>.*?<\/time>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|\|\||\*|_|`)/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface TodoLine {
  line: number;
  text: string;
  checked: boolean;
}

export function todosOf(markdown: string): TodoLine[] {
  const out: TodoLine[] = [];
  markdown.split("\n").forEach((l, line) => {
    const m = TODO.exec(l.replace(/\r$/, ""));
    if (m) {
      const text = plainTodo(m[4]);
      if (text) out.push({ line, text, checked: m[2] !== " " });
    }
  });
  return out;
}

// The note with the to-do ticked (or not); unchanged when it isn't there or
// is already that way.
export function withTodoChecked(markdown: string, text: string, checked: boolean): string {
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const cr = lines[i].endsWith("\r") ? "\r" : "";
    const m = TODO.exec(cr ? lines[i].slice(0, -1) : lines[i]);
    if (!m || plainTodo(m[4]) !== text) continue;
    if ((m[2] !== " ") === checked) return markdown;
    lines[i] = `${m[1]}${checked ? "x" : " "}${m[3]}${m[4]}${cr}`;
    return lines.join("\n");
  }
  return markdown;
}

export function linkedTasks(tasks: Task[], note: string | null): Task[] {
  return note ? tasks.filter((t) => t.Note === note && t.NoteTodo) : [];
}

// "Today", "Sat", "Oct 3" and its color, for each linked to-do's chip.
export function todoLinksFor(tasks: Task[], note: string | null, now: Date): Map<string, TodoLink> {
  const map = new Map<string, TodoLink>();
  const today = startOfDay(now);
  for (const t of linkedTasks(tasks, note)) {
    if (t.Completed) continue;
    let label = "";
    let tone: TodoLink["tone"] = "muted";
    if (t.Due) {
      const diff = daysBetween(ymd(today), t.Due);
      label = diff >= 1 && diff < 7 ? fromYmd(t.Due).toLocaleDateString(undefined, { weekday: "short" }) : formatDue(t.Due, null, today);
      tone = isOverdue(t, now) && diff < 0 ? "danger" : diff === 0 ? "warn" : "muted";
    }
    map.set(t.NoteTodo!, { taskId: t.Id, label, tone });
  }
  return map;
}

// Sends one to-do. Its text is read like quick add ("Contrast check today
// !high #checkpoint"); with no date it waits in Someday. A to-do already sent
// isn't sent twice.
export function sendTodo(note: string, text: string, checked: boolean, quiet = false): Task | null {
  const existing = taskStore()
    .getState()
    .file.Tasks.find((t) => t.Note === note && t.NoteTodo === text);
  if (existing) {
    if (!quiet) toast("That to-do is already in Tasks", () => requestTasks({ kind: "open", id: existing.Id }), "Show");
    return null;
  }
  const parsed = parseCapture(text, new Date(), { undated: "none" });
  const task = addTask({ ...parsed, note, noteTodo: text, how: `Sent from the note “${note.replace(/\.md$/i, "")}”` });
  if (checked) taskStore().update((ts) => ts.map((t) => (t.Id === task.Id ? { ...t, Completed: new Date().toISOString() } : t)));
  if (!quiet) toast(`Sent “${task.Title}” to Tasks`, () => requestTasks({ kind: "open", id: task.Id }), "Show");
  return task;
}

// Every to-do still open in the note that isn't in Tasks yet.
export function sendAllTodos(note: string, markdown: string): number {
  const sent = todosOf(markdown)
    .filter((t) => !t.checked)
    .map((t) => sendTodo(note, t.text, false, true))
    .filter(Boolean);
  if (sent.length) toast(`Sent ${sent.length} ${sent.length === 1 ? "to-do" : "to-dos"} to Tasks`, () => requestTasks({ kind: "open", id: sent[0]!.Id }), "Show");
  else toast("Every open to-do here is already in Tasks");
  return sent.length;
}
