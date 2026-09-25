// Quick add: "Pay rent fri 5pm !high #personal" → a task. The priority, list
// and tags can go anywhere; the date and time are read from the end, the way
// Checkpoint does it (dates.ts parseQuick). A #word that names a list puts the
// task on it; any other #word becomes a tag.
import { currentSettings } from "../lib/settings";
import { parseQuick, startOfDay, ymd } from "./dates";
import { defaultListId, listByTag, type TaskList } from "./lists";
import type { NewTask } from "./model";

const priorities: Record<string, number> = { high: 3, med: 2, medium: 2, low: 1 };

export interface Captured extends NewTask {
  // The words read as the date and time, for screen reader feedback.
  phrase: string | null;
}

export interface CaptureOptions {
  list?: string;
  // With no date typed: today (Home, the Today view) or none (Someday).
  undated?: "today" | "none" | "tomorrow";
  // Settings → Tasks → Read dates from what I type, unless said here (the
  // Schedule's quick add always reads them).
  readDates?: boolean;
}

export function parseCapture(text: string, now: Date, { list, undated = "today", readDates = currentSettings().ReadDates !== false }: CaptureOptions = {}): Captured {
  let rest = ` ${text.trim()} `;
  let priority = 0;
  let chosen: string | null = null;
  const tags: string[] = [];
  const p = /\s!(high|medium|med|low)(?=\s)/i.exec(rest);
  if (p) {
    priority = priorities[p[1].toLowerCase()];
    rest = rest.slice(0, p.index) + rest.slice(p.index + p[0].length);
  }
  for (const m of [...rest.matchAll(/\s#([\w-]+)(?=\s)/g)]) {
    const found: TaskList | undefined = chosen ? undefined : listByTag(m[1]);
    if (found) chosen = found.id;
    else if (!tags.includes(m[1].toLowerCase())) tags.push(m[1].toLowerCase());
    rest = rest.replace(m[0], "");
  }
  // With reading dates off, the words stay in the title.
  const q = readDates ? parseQuick(rest.trim(), now) : { title: rest.trim(), due: null, time: null, phrase: null };
  const today = startOfDay(now);
  const fallback = undated === "today" ? ymd(today) : undated === "tomorrow" ? ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)) : null;
  return {
    title: q.title || rest.trim() || text.trim(),
    due: q.due ?? fallback,
    time: q.time,
    priority,
    list: chosen ?? list ?? defaultListId(),
    tags,
    phrase: q.phrase,
  };
}
