// Quick capture: "Pay rent fri 5pm !high #personal" → a task. The priority
// and list can go anywhere; the date and time are read from the end, the way
// Checkpoint does it (dates.ts parseQuick).
import { parseQuick, startOfDay, ymd } from "./dates";
import { defaultList, listByTag } from "./lists";
import type { NewTask } from "./model";

const priorities: Record<string, number> = { high: 3, med: 2, medium: 2, low: 1 };

export interface Captured extends NewTask {
  // The words read as the date and time, for screen reader feedback.
  phrase: string | null;
}

export function parseCapture(text: string, now: Date, list = defaultList): Captured {
  let rest = ` ${text.trim()} `;
  let priority = 0;
  const p = /\s!(high|medium|med|low)(?=\s)/i.exec(rest);
  if (p) {
    priority = priorities[p[1].toLowerCase()];
    rest = rest.slice(0, p.index) + rest.slice(p.index + p[0].length);
  }
  for (const m of rest.matchAll(/\s#([\w-]+)(?=\s)/g)) {
    const found = listByTag(m[1]);
    if (found) {
      list = found.id;
      rest = rest.replace(m[0], "");
      break;
    }
  }
  const q = parseQuick(rest.trim(), now);
  // Captured from Home with no date, it's for today (Main.dc.html).
  return {
    title: q.title || text.trim(),
    due: q.due ?? ymd(startOfDay(now)),
    time: q.time,
    priority,
    list,
    phrase: q.phrase,
  };
}
