// The task lists, which double as the calendars and Home's spaces (DESIGN.md
// §2). They live in tasks.json beside the tasks; people add, rename, recolor
// and delete them. Colors are theme colors, so every theme suits them.
import { currentSettings } from "../lib/settings";

export type ListColor = "accent" | "accent2" | "warn" | "danger" | "muted" | "hue-4" | "hue-5";

export const listColors: { id: ListColor; name: string }[] = [
  { id: "accent", name: "Accent" },
  { id: "accent2", name: "Second accent" },
  { id: "warn", name: "Amber" },
  { id: "danger", name: "Red" },
  { id: "muted", name: "Gray" },
  { id: "hue-4", name: "Blue" },
  { id: "hue-5", name: "Pink" },
];

// As saved in the file.
export interface ListRecord {
  Id: string;
  Name: string;
  Color: ListColor;
  // False for a calendar that isn't also a list in Tasks (made in Schedule).
  InTasks?: boolean;
  [key: string]: unknown;
}

// As the views use it.
export interface TaskList {
  id: string;
  name: string;
  // A CSS color: var(--accent) …
  color: string;
  tone: ListColor;
  inTasks: boolean;
}

export const defaultListRecords: ListRecord[] = [
  { Id: "personal", Name: "Personal", Color: "accent" },
  { Id: "stream", Name: "Stream & YouTube", Color: "accent2" },
  { Id: "checkpoint", Name: "Checkpoint", Color: "warn" },
  { Id: "errands", Name: "Errands", Color: "muted" },
];

const isColor = (c: unknown): c is ListColor => listColors.some((x) => x.id === c);

export function parseLists(raw: unknown): ListRecord[] {
  if (!Array.isArray(raw)) return defaultListRecords;
  const seen = new Set<string>();
  const lists = raw
    .filter((l): l is ListRecord => Boolean(l) && typeof l === "object" && typeof l.Id === "string" && typeof l.Name === "string" && l.Id !== "")
    .filter((l) => !seen.has(l.Id) && Boolean(seen.add(l.Id)))
    .map((l) => ({ ...l, Color: isColor(l.Color) ? l.Color : "muted" }));
  return lists.length ? lists : defaultListRecords;
}

const view = (l: ListRecord): TaskList => ({ id: l.Id, name: l.Name, color: `var(--${l.Color})`, tone: l.Color, inTasks: l.InTasks !== false });

// The lists as last read or changed; the task store keeps this up to date, so
// code outside React (quick add, Home) sees the same lists as the views.
let current: TaskList[] = defaultListRecords.map(view);

export function setCurrentLists(records: ListRecord[]) {
  current = records.map(view);
}

export function currentLists(): TaskList[] {
  return current;
}

// New tasks go to the list picked in Settings → Tasks, else Personal, or the
// first list once Personal is gone.
export function defaultListId(): string {
  const picked = currentSettings().DefaultList;
  const lists = taskLists();
  return lists.find((l) => l.id === picked)?.id ?? lists.find((l) => l.id === "personal")?.id ?? lists[0]?.id ?? current[0]?.id ?? "personal";
}

// The lists Tasks shows; the rest are calendars only.
export function taskLists(): TaskList[] {
  return current.filter((l) => l.inTasks);
}

export function listFor(id: string | undefined): TaskList {
  return (
    current.find((l) => l.id === id) ??
    synced.find((l) => l.id === id) ??
    subscribed.find((l) => l.id === id) ??
    builtin().find((l) => l.id === id) ??
    current.find((l) => l.id === defaultListId()) ??
    current[0]
  );
}

// Calendars from connected accounts (accounts/model.ts), so their events get
// a name and color everywhere lists are looked up. Not lists: tasks can't go
// on them.
let synced: TaskList[] = [];

export function setSyncedCalendars(calendars: TaskList[]) {
  synced = calendars;
}

// Calendars subscribed to by link (schedule/feeds.ts), the same way.
let subscribed: TaskList[] = [];

export function setSubscribedCalendars(calendars: TaskList[]) {
  subscribed = calendars;
}

// Calendars that come with Project Life (schedule/holidays.ts). Asked for
// each time, since their color is a setting.
let builtin: () => TaskList[] = () => [];

export function setBuiltinCalendars(calendars: () => TaskList[]) {
  builtin = calendars;
}

// "#personal", "#stream", "#youtube", "#errands": a list by its id, its whole
// name, or any word of its name.
export function listByTag(tag: string): TaskList | undefined {
  const t = tag.toLowerCase();
  const words = (name: string) => name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return (
    current.find((l) => l.id === t) ??
    current.find((l) => l.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") === t) ??
    current.find((l) => words(l.name).includes(t))
  );
}

export function newListId(name: string, taken: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "list";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
