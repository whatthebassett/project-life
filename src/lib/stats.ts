// How often each note is opened and edited, for the Home screen's "recent"
// and "popular" notes. Kept in Data\Notes\.noted-stats.json; the Markdown
// files are never touched. Only the main window writes it.
import { api } from "./api";

export interface NoteStats {
  // Times opened, and saves (each autosave counts once).
  Opens: number;
  Edits: number;
  // Milliseconds since 1970; 0 if never.
  LastOpened: number;
  LastEdited: number;
}

interface StatsFile {
  Notes: Record<string, NoteStats>;
}

let stats: Record<string, NoteStats> = {};
let loaded = false;
// Only write once the file has been read (or found missing): a file that
// couldn't be read is left alone rather than replaced with fresh numbers.
let writable = false;
let timer: number | undefined;
const listeners = new Set<() => void>();

const blank = (): NoteStats => ({ Opens: 0, Edits: 0, LastOpened: 0, LastEdited: 0 });
const key = (name: string) => Object.keys(stats).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;

function changed() {
  for (const l of listeners) l();
  if (!writable) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void api.writeMeta(".noted-stats.json", JSON.stringify({ Notes: stats } satisfies StatsFile)), 1500);
}

export async function loadStats(): Promise<Record<string, NoteStats>> {
  if (loaded) return stats;
  try {
    const text = (await api.readMeta(".noted-stats.json"))?.replace(/^﻿/, "").trim();
    const notes = text ? ((JSON.parse(text) as Partial<StatsFile>).Notes ?? {}) : {};
    // Numbers only, whatever a hand edit left behind.
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    stats = Object.fromEntries(
      Object.entries(notes).map(([name, s]) => [name, { Opens: num(s?.Opens), Edits: num(s?.Edits), LastOpened: num(s?.LastOpened), LastEdited: num(s?.LastEdited) }]),
    );
    writable = true;
  } catch {
    stats = {};
  }
  loaded = true;
  return stats;
}

// A copy of every note's numbers, keyed by file name ("Title.md").
export const statsSnapshot = (): Record<string, NoteStats> => ({ ...stats });

// Called whenever the numbers change (for a screen that shows them).
export function onStatsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recordOpen(name: string) {
  const k = key(name);
  const s = (stats[k] ??= blank());
  s.Opens += 1;
  s.LastOpened = Date.now();
  changed();
}

export function recordEdit(name: string) {
  const k = key(name);
  const s = (stats[k] ??= blank());
  s.Edits += 1;
  s.LastEdited = Date.now();
  changed();
}

export function renameStats(from: string, to: string) {
  const k = key(from);
  if (!stats[k]) return;
  stats[to] = stats[k];
  if (k !== to) delete stats[k];
  changed();
}

export function forgetStats(name: string) {
  const k = key(name);
  if (!stats[k]) return;
  delete stats[k];
  changed();
}

// Save now (the window is closing).
export async function flushStats() {
  if (!loaded || !writable || timer === undefined) return;
  window.clearTimeout(timer);
  timer = undefined;
  await api.writeMeta(".noted-stats.json", JSON.stringify({ Notes: stats } satisfies StatsFile));
}
