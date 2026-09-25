// The task lists, which double as the calendars and Home's spaces (DESIGN.md
// §2). They live in tasks.json beside the tasks; people add, rename, recolor
// and delete them. Colors are theme colors, so every theme suits them.
export type ListColor = "accent" | "accent2" | "warn" | "danger" | "muted";

export const listColors: { id: ListColor; name: string }[] = [
  { id: "accent", name: "Accent" },
  { id: "accent2", name: "Second accent" },
  { id: "warn", name: "Amber" },
  { id: "danger", name: "Red" },
  { id: "muted", name: "Gray" },
];

// As saved in the file.
export interface ListRecord {
  Id: string;
  Name: string;
  Color: ListColor;
  [key: string]: unknown;
}

// As the views use it.
export interface TaskList {
  id: string;
  name: string;
  // A CSS color: var(--accent) …
  color: string;
  tone: ListColor;
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

const view = (l: ListRecord): TaskList => ({ id: l.Id, name: l.Name, color: `var(--${l.Color})`, tone: l.Color });

// The lists as last read or changed; the task store keeps this up to date, so
// code outside React (quick add, Home) sees the same lists as the views.
let current: TaskList[] = defaultListRecords.map(view);

export function setCurrentLists(records: ListRecord[]) {
  current = records.map(view);
}

export function currentLists(): TaskList[] {
  return current;
}

// New tasks go to Personal, or the first list once Personal is gone
// (Settings → Tasks picks another, Phase 7).
export function defaultListId(): string {
  return current.find((l) => l.id === "personal")?.id ?? current[0]?.id ?? "personal";
}

export function listFor(id: string | undefined): TaskList {
  return current.find((l) => l.id === id) ?? current.find((l) => l.id === defaultListId()) ?? current[0];
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
