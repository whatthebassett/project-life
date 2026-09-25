// Noted's own organization: note order, tags, priorities and pages. These are
// the same dotfiles earlier versions of Noted wrote, with their PascalCase keys.
// Note names are compared case-insensitively, like the file system.
import { api, type NoteInfo } from "./api";

export interface Tag {
  Id: string;
  Name: string;
  Color: string;
}

export const Priority = { None: 0, Low: 1, Medium: 2, High: 3 } as const;
export type PriorityValue = (typeof Priority)[keyof typeof Priority];

export const priorityLabel: Record<PriorityValue, string> = {
  0: "No priority",
  1: "Low",
  2: "Medium",
  3: "High",
};
// Project Life's priority colors (DESIGN.md §2): High danger, Medium warn,
// Low accent2, so notes match tasks.
export const priorityColor: Record<PriorityValue, string> = {
  0: "",
  1: "var(--accent2)",
  2: "var(--warn)",
  3: "var(--danger)",
};

export interface TagState {
  Tags: Tag[];
  Notes: Record<string, string[]>;
  Priorities: Record<string, number>;
}

export interface PageState {
  Parents: Record<string, string>;
  Collapsed: string[];
}

export interface Notebook {
  order: string[];
  tags: TagState;
  pages: PageState;
  // Notes pinned to the top of the sidebar, in the order they're shown.
  pins: string[];
}

const same = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;

export function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  for (const k of Object.keys(map)) if (same(k, key)) return map[k];
  return undefined;
}

function rekey<T>(map: Record<string, T>, from: string, to: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) out[same(k, from) ? to : k] = v;
  return out;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(map)) if (!same(k, key)) out[k] = v;
  return out;
}

async function readJson<T>(file: Parameters<typeof api.readMeta>[0]): Promise<T | null> {
  const text = await api.readMeta(file);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Folders from before 2.28 become tags with the same names and colors; the old
// file is left alone for older versions of Noted.
async function loadTags(): Promise<TagState> {
  const tags = await readJson<Partial<TagState>>(".noted-tags.json");
  if (tags) return { Tags: tags.Tags ?? [], Notes: tags.Notes ?? {}, Priorities: tags.Priorities ?? {} };
  const legacy = await readJson<{ Folders?: Tag[]; Notes?: Record<string, string> }>(".noted-folders.json");
  const state: TagState = { Tags: legacy?.Folders ?? [], Notes: {}, Priorities: {} };
  const known = new Set(state.Tags.map((t) => t.Id));
  for (const [note, folder] of Object.entries(legacy?.Notes ?? {}))
    if (known.has(folder)) state.Notes[note] = [folder];
  if (legacy) await api.writeMeta(".noted-tags.json", JSON.stringify(state));
  return state;
}

export async function loadNotebook(): Promise<Notebook> {
  const [order, tags, pages, pins] = await Promise.all([
    readJson<string[]>(".noted-order.json"),
    loadTags(),
    readJson<Partial<PageState>>(".noted-pages.json"),
    readJson<string[]>(".noted-pins.json"),
  ]);
  return {
    order: order ?? [],
    tags,
    pages: { Parents: pages?.Parents ?? {}, Collapsed: pages?.Collapsed ?? [] },
    pins: Array.isArray(pins) ? pins.filter((n) => typeof n === "string") : [],
  };
}

export async function saveOrder(order: string[]) {
  await api.writeMeta(".noted-order.json", JSON.stringify(order));
}
export async function saveTags(tags: TagState) {
  await api.writeMeta(".noted-tags.json", JSON.stringify(tags));
}
export async function savePages(pages: PageState) {
  await api.writeMeta(".noted-pages.json", JSON.stringify(pages));
}
export async function savePins(pins: string[]) {
  await api.writeMeta(".noted-pins.json", JSON.stringify(pins));
}

// A note was renamed on disk: carry its order, tags, priority and page over.
export function renamed(nb: Notebook, from: string, to: string): Notebook {
  return {
    order: nb.order.map((n) => (same(n, from) ? to : n)),
    tags: {
      Tags: nb.tags.Tags,
      Notes: rekey(nb.tags.Notes, from, to),
      Priorities: rekey(nb.tags.Priorities, from, to),
    },
    pages: {
      Parents: Object.fromEntries(
        Object.entries(rekey(nb.pages.Parents, from, to)).map(([k, v]) => [k, same(v, from) ? to : v]),
      ),
      Collapsed: nb.pages.Collapsed.map((n) => (same(n, from) ? to : n)),
    },
    pins: nb.pins.map((n) => (same(n, from) ? to : n)),
  };
}

// A note left the notebook: its pages move up one level.
export function removed(nb: Notebook, name: string): Notebook {
  const parent = lookup(nb.pages.Parents, name);
  const parents: Record<string, string> = {};
  for (const [k, v] of Object.entries(without(nb.pages.Parents, name))) {
    if (same(v, name)) {
      if (parent) parents[k] = parent;
    } else parents[k] = v;
  }
  return {
    order: nb.order.filter((n) => !same(n, name)),
    tags: {
      Tags: nb.tags.Tags,
      Notes: without(nb.tags.Notes, name),
      Priorities: without(nb.tags.Priorities, name),
    },
    pages: { Parents: parents, Collapsed: nb.pages.Collapsed.filter((n) => !same(n, name)) },
    pins: nb.pins.filter((n) => !same(n, name)),
  };
}

export function parentOf(nb: Notebook, name: string): string | undefined {
  return lookup(nb.pages.Parents, name);
}

// Is `candidate` the note itself or one of its pages, at any depth?
export function isWithin(nb: Notebook, candidate: string, ancestor: string): boolean {
  let walk: string | undefined = candidate;
  for (let i = 0; walk && i < 16; i++) {
    if (same(walk, ancestor)) return true;
    walk = lookup(nb.pages.Parents, walk);
  }
  return false;
}

export function withTags(nb: Notebook, name: string, ids: string[]): Notebook {
  const Notes = without(nb.tags.Notes, name);
  if (ids.length) Notes[name] = ids;
  return { ...nb, tags: { ...nb.tags, Notes } };
}

export function withPriority(nb: Notebook, name: string, priority: PriorityValue): Notebook {
  const Priorities = without(nb.tags.Priorities, name);
  if (priority) Priorities[name] = priority;
  return { ...nb, tags: { ...nb.tags, Priorities } };
}

// Put a note under another note, or at the top level with `null`.
export function withParent(nb: Notebook, name: string, parent: string | null): Notebook {
  if (parent && isWithin(nb, parent, name)) throw new Error("A page can't go inside itself or one of its own pages.");
  const Parents = without(nb.pages.Parents, name);
  if (parent) Parents[name] = parent;
  return { ...nb, pages: { ...nb.pages, Parents } };
}

export type DropWhere = "before" | "after" | "inside";

// Drag and drop: next to a note means the same level as that note; onto a note
// means inside it, at the end.
export function moved(nb: Notebook, name: string, target: string, where: DropWhere): Notebook {
  if (same(name, target) || isWithin(nb, target, name)) return nb;
  const parent = where === "inside" ? target : (parentOf(nb, target) ?? null);
  const next = withParent(nb, name, parent);
  const order = next.order.filter((n) => !same(n, name));
  if (where === "inside") order.push(name);
  else {
    const at = order.findIndex((n) => same(n, target));
    order.splice(at < 0 ? order.length : where === "before" ? at : at + 1, 0, name);
  }
  return { ...next, order };
}

// The notes beside this one, at the same level and in the notebook's own order.
export function siblingsOf(notes: NoteInfo[], nb: Notebook, name: string): string[] {
  const parent = parentOf(nb, name) ?? null;
  const names = new Set(notes.map((n) => n.name.toLowerCase()));
  const rank = new Map(nb.order.map((n, i) => [n.toLowerCase(), i]));
  const levelOf = (n: string) => {
    const p = parentOf(nb, n);
    return p && names.has(p.toLowerCase()) ? p : null;
  };
  return notes
    .map((n) => n.name)
    .filter((n) => {
      const p = levelOf(n);
      return parent === null ? p === null : p !== null && same(p, parent);
    })
    .sort((a, b) => {
      const ra = rank.get(a.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.localeCompare(b, undefined, { sensitivity: "base" });
    });
}

// Where a note can go from here, for the menu: the notes around it and the
// notebook it's in.
export function neighbours(notes: NoteInfo[], nb: Notebook, name: string) {
  const siblings = siblingsOf(notes, nb, name);
  const at = siblings.findIndex((n) => same(n, name));
  return {
    before: at > 0 ? siblings[at - 1] : null,
    after: at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null,
    parent: parentOf(nb, name) ?? null,
  };
}

// One place up or down among the notes beside it.
export function movedBy(notes: NoteInfo[], nb: Notebook, name: string, step: -1 | 1): Notebook {
  const { before, after } = neighbours(notes, nb, name);
  const target = step < 0 ? before : after;
  return target ? moved(withOrder(notes, nb), name, target, step < 0 ? "before" : "after") : nb;
}

// Into the note just above it, at the end, which makes that note a notebook.
// It opens, so the note stays in sight.
export function nestedUnderAbove(notes: NoteInfo[], nb: Notebook, name: string): Notebook {
  const { before } = neighbours(notes, nb, name);
  if (!before) return nb;
  const next = moved(withOrder(notes, nb), name, before, "inside");
  return { ...next, pages: { ...next.pages, Collapsed: next.pages.Collapsed.filter((n) => !same(n, before)) } };
}

// Out of its notebook, to just after it.
export function unnested(notes: NoteInfo[], nb: Notebook, name: string): Notebook {
  const parent = parentOf(nb, name);
  return parent ? moved(withOrder(notes, nb), name, parent, "after") : nb;
}

// The order as the sidebar shows it, written out in full. Notes that were
// never dragged sit after the rest alphabetically; giving them all a place
// first means moving one lands exactly where the reader sees it.
function withOrder(notes: NoteInfo[], nb: Notebook): Notebook {
  const known = new Set(nb.order.map((n) => n.toLowerCase()));
  const missing = notes
    .map((n) => n.name)
    .filter((n) => !known.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return missing.length ? { ...nb, order: [...nb.order, ...missing] } : nb;
}

export function withTag(nb: Notebook, tag: Tag): Notebook {
  const Tags = nb.tags.Tags.some((t) => t.Id === tag.Id)
    ? nb.tags.Tags.map((t) => (t.Id === tag.Id ? tag : t))
    : [...nb.tags.Tags, tag];
  return { ...nb, tags: { ...nb.tags, Tags } };
}

// Deleting a tag never deletes notes; they just lose that tag.
export function withoutTag(nb: Notebook, id: string): Notebook {
  const Notes: Record<string, string[]> = {};
  for (const [k, ids] of Object.entries(nb.tags.Notes)) {
    const kept = ids.filter((i) => i !== id);
    if (kept.length) Notes[k] = kept;
  }
  return { ...nb, tags: { ...nb.tags, Tags: nb.tags.Tags.filter((t) => t.Id !== id), Notes } };
}

export function newTagId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export const tagPresets = [
  "#5B8DEF", "#2E9E6B", "#D13438", "#CA5010", "#BA60D9", "#0F7B9E",
  "#C239B3", "#8E8CD8", "#00B294", "#E3008C", "#767676", "#DA9C2A",
];

export async function saveNotebook(nb: Notebook) {
  await Promise.all([saveOrder(nb.order), saveTags(nb.tags), savePages(nb.pages), savePins(nb.pins)]);
}

export function isPinned(nb: Notebook, name: string): boolean {
  return nb.pins.some((n) => same(n, name));
}

// Pinning adds the note to the end of the pinned list; unpinning takes it out.
export function withPin(nb: Notebook, name: string, pinned: boolean): Notebook {
  const pins = nb.pins.filter((n) => !same(n, name));
  if (pinned) pins.push(name);
  return { ...nb, pins };
}

// Reorder the pinned list by dragging: put `name` before or after `target`.
export function movedPin(nb: Notebook, name: string, target: string, where: "before" | "after"): Notebook {
  if (same(name, target)) return nb;
  const pins = nb.pins.filter((n) => !same(n, name));
  const at = pins.findIndex((n) => same(n, target));
  pins.splice(at < 0 ? pins.length : where === "before" ? at : at + 1, 0, name);
  return { ...nb, pins };
}

export interface Row {
  note: NoteInfo;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

// The sidebar tree: custom order at every level, pages indented under their note.
export function buildRows(
  notes: NoteInfo[],
  nb: Notebook,
  filter: (note: NoteInfo) => boolean,
  sortByPriority: boolean,
): Row[] {
  const rank = new Map(nb.order.map((n, i) => [n.toLowerCase(), i]));
  const byParent = new Map<string, NoteInfo[]>();
  const names = new Set(notes.map((n) => n.name.toLowerCase()));
  for (const note of notes) {
    const parent = lookup(nb.pages.Parents, note.name);
    const key = parent && names.has(parent.toLowerCase()) ? parent.toLowerCase() : "";
    byParent.set(key, [...(byParent.get(key) ?? []), note]);
  }
  const sorter = (a: NoteInfo, b: NoteInfo) => {
    if (sortByPriority) {
      const pa = lookup(nb.tags.Priorities, a.name) ?? 0;
      const pb = lookup(nb.tags.Priorities, b.name) ?? 0;
      if (pa !== pb) return pb - pa;
    }
    const ra = rank.get(a.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  };
  const collapsed = new Set(nb.pages.Collapsed.map((n) => n.toLowerCase()));
  const rows: Row[] = [];
  // With a filter on, a matching note still shows when its notebook is hidden.
  const visit = (key: string, depth: number) => {
    for (const note of [...(byParent.get(key) ?? [])].sort(sorter)) {
      const children = byParent.get(note.name.toLowerCase()) ?? [];
      const matches = filter(note);
      const isCollapsed = collapsed.has(note.name.toLowerCase());
      if (matches) rows.push({ note, depth, hasChildren: children.length > 0, collapsed: isCollapsed });
      if (children.length && (!isCollapsed || !matches)) visit(note.name.toLowerCase(), matches ? depth + 1 : depth);
    }
  };
  visit("", 0);
  return rows;
}
