// The task lists, which double as the default calendars and Home's spaces
// (DESIGN.md §2). Phase 4 lets people add their own.
export interface TaskList {
  id: string;
  name: string;
  color: string;
}

export const lists: TaskList[] = [
  { id: "personal", name: "Personal", color: "var(--accent)" },
  { id: "stream", name: "Stream & YouTube", color: "var(--accent2)" },
  { id: "checkpoint", name: "Checkpoint", color: "var(--warn)" },
  { id: "errands", name: "Errands", color: "var(--muted)" },
];

// New tasks go here unless they say otherwise (Settings → Tasks, Phase 7).
export const defaultList = "personal";

export function listFor(id: string | undefined): TaskList {
  return lists.find((l) => l.id === id) ?? lists[0];
}

// "#personal", "#stream", "#youtube", "#errands": a list by its id or by any
// word of its name.
export function listByTag(tag: string): TaskList | undefined {
  const t = tag.toLowerCase();
  return lists.find((l) => l.id === t || l.name.toLowerCase().split(/[^a-z]+/).includes(t));
}
