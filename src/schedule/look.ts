// How calendars and events look, and what the Join button says.
import { clockShort } from "../lib/format";
import type { ListColor } from "../tasks/lists";
import { callNames, joinUrlOf, type Occurrence } from "./events";

// Events use the soft fill of their calendar's color (DESIGN.md §2).
export function softOf(tone: ListColor): string {
  if (tone === "accent") return "var(--accent-soft)";
  if (tone === "accent2") return "var(--accent2-soft)";
  if (tone === "warn") return "var(--warn-soft)";
  return `color-mix(in srgb, var(--${tone}) 16%, transparent)`;
}

// "5 PM", "5:45 PM".
export function shortTime(d: Date): string {
  return clockShort(d);
}

export function rangeLabel(o: { start: Date; end: Date }, allDay?: boolean): string {
  if (allDay) return "All day";
  return `${shortTime(o.start)} – ${shortTime(o.end)}`;
}

export interface JoinState {
  // Teams, Meet or Zoom is set.
  call: boolean;
  label: string;
  url: string | null;
  // Solid from 10 minutes before the start until the end.
  live: boolean;
  ended: boolean;
  hint: string;
}

// The Join button (DESIGN.md: video calls): an outline until 10 minutes
// before the start, then solid; after the end, "This call has ended".
export function joinState(o: Occurrence, now: Date): JoinState {
  const e = o.event;
  if (!e.Call) return { call: false, label: "", url: null, live: false, ended: false, hint: "" };
  const url = joinUrlOf(e);
  const name = callNames[e.Call];
  const minutes = (o.start.getTime() - now.getTime()) / 60_000;
  const ended = o.end <= now;
  const live = !ended && minutes <= 10;
  let hint = "";
  if (!url) hint = `Paste the ${name} link in Edit to join from here`;
  else if (ended) hint = "This call has ended";
  else if (live) hint = minutes > 0 ? "Starting soon" : "Happening now";
  else hint = `Lights up 10 minutes before it starts${o.start.toDateString() === now.toDateString() ? ` (in ${formatMinutes(minutes - 10)})` : ""}`;
  return { call: true, label: url ? `Join ${name}` : `Add the ${name} link`, url, live, ended, hint };
}

function formatMinutes(m: number): string {
  const n = Math.max(1, Math.round(m));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const r = n % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}
