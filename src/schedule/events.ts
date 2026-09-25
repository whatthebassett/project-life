// Events as they live in Data\events.json (EventNew.dc.html's fields), and
// the pure operations on them. PascalCase keys, and keys this version doesn't
// know are kept.
//
// Times are stored as local "YYYY-MM-DDTHH:MM" stamps (the PC's own time);
// an event booked in another time zone keeps that zone in TimeZone, so the
// editor can show its times the way they were typed.
//
// A repeating event is stored once and shows on every day it repeats. Its
// Skip list holds the days taken out; changing just one day makes a separate
// event (Of: the series, OnDate: the day it replaces) and skips that day.
import { addDays, fromYmd, isYmd, ymd } from "../tasks/dates";

export type EventKind = "event" | "focus" | "reminder";
export type EventRepeat = "daily" | "weekdays" | "weekly" | "monthly";
export type CallKind = "teams" | "meet" | "zoom";

export interface CalEvent {
  Id: string;
  Title: string;
  Kind: EventKind;
  // Local "YYYY-MM-DDTHH:MM"; all-day events run midnight to midnight.
  Start: string;
  End: string;
  AllDay?: boolean;
  // A list/calendar id (tasks/lists.ts).
  Calendar: string;
  Description?: string;
  Place?: string;
  Call?: CallKind | null;
  JoinUrl?: string | null;
  // IANA name ("America/Los_Angeles"); none means the PC's own.
  TimeZone?: string | null;
  // Minutes before the start.
  Reminders?: number[];
  // When the last reminder went off (ISO), so each goes off once.
  Reminded?: string | null;
  Repeat?: EventRepeat | null;
  Skip?: string[];
  // A one-day change to a repeating event.
  Of?: string | null;
  OnDate?: string | null;
  // The task it blocks time for, or the note it links to.
  Task?: string | null;
  Note?: string | null;
  Created: string;
  [key: string]: unknown;
}

export interface EventFile {
  Events: CalEvent[];
  [key: string]: unknown;
}

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const KINDS: EventKind[] = ["event", "focus", "reminder"];
const REPEATS: EventRepeat[] = ["daily", "weekdays", "weekly", "monthly"];
const CALLS: CallKind[] = ["teams", "meet", "zoom"];

export function parseEvents(text: string | null): EventFile {
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Events: [] };
  const data = JSON.parse(clean) as Partial<EventFile>;
  const events = Array.isArray(data.Events) ? data.Events : [];
  return {
    ...data,
    Events: events
      .filter(
        (e): e is CalEvent =>
          Boolean(e) && typeof e === "object" && typeof e.Id === "string" && typeof e.Title === "string" && LOCAL.test(String(e.Start)) && LOCAL.test(String(e.End)),
      )
      .map((e) => ({
        ...e,
        Kind: KINDS.includes(e.Kind) ? e.Kind : "event",
        End: e.End < e.Start ? e.Start : e.End,
        Calendar: typeof e.Calendar === "string" && e.Calendar ? e.Calendar : "personal",
        Call: CALLS.includes(e.Call as CallKind) ? e.Call : null,
        Repeat: REPEATS.includes(e.Repeat as EventRepeat) ? e.Repeat : null,
        Reminders: Array.isArray(e.Reminders) ? e.Reminders.filter((m) => typeof m === "number" && m >= 0) : [],
        Skip: Array.isArray(e.Skip) ? e.Skip.filter(isYmd) : [],
        Created: typeof e.Created === "string" ? e.Created : new Date(0).toISOString(),
      })),
  };
}

export const serializeEvents = (file: EventFile) => JSON.stringify(file, null, 2);

export function localStamp(d: Date): string {
  return `${ymd(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fromStamp(s: string): Date {
  const [day, time] = s.split("T");
  const [h, m] = time.split(":").map(Number);
  const d = fromYmd(day);
  d.setHours(h, m, 0, 0);
  return d;
}

// ----- occurrences -----

// One showing of an event: the event itself, or one day of a repeating one.
export interface Occurrence {
  event: CalEvent;
  // Unique per showing: "<id>@<day>".
  key: string;
  day: string;
  start: Date;
  end: Date;
}

// Whether a repeating event (starting on `first`) falls on `day`.
function repeatsOn(repeat: EventRepeat, first: Date, day: Date): boolean {
  if (day < first) return false;
  switch (repeat) {
    case "daily":
      return true;
    case "weekdays":
      return day.getDay() !== 0 && day.getDay() !== 6;
    case "weekly":
      return day.getDay() === first.getDay();
    case "monthly":
      return day.getDate() === first.getDate();
  }
}

// Every showing that touches [from, to), in start order.
export function occurrences(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    const start = fromStamp(e.Start);
    const end = fromStamp(e.End);
    if (!e.Repeat) {
      if (end > from && start < to) out.push({ event: e, key: `${e.Id}@${e.Start.slice(0, 10)}`, day: e.Start.slice(0, 10), start, end });
      continue;
    }
    const length = end.getTime() - start.getTime();
    const first = fromYmd(e.Start.slice(0, 10));
    const skip = new Set(e.Skip ?? []);
    // Start a day early so an overnight showing from the day before counts.
    for (let d = addDays(from, -1 - Math.ceil(length / 86_400_000)); d < to; d = addDays(d, 1)) {
      const day = ymd(d);
      if (skip.has(day) || !repeatsOn(e.Repeat, first, d)) continue;
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), start.getHours(), start.getMinutes());
      const en = new Date(s.getTime() + length);
      if (en > from && s < to) out.push({ event: e, key: `${e.Id}@${day}`, day, start: s, end: en });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
}

// The day's timed showings, for clashes and free time.
export function dayOccurrences(events: CalEvent[], day: string): Occurrence[] {
  const d = fromYmd(day);
  return occurrences(events, d, addDays(d, 1)).filter((o) => !o.event.AllDay);
}

// Somewhere to put `minutes` on `day`: at `time` if given, else the first
// free half hour from 9 AM (or from now, today) that doesn't clash with
// anything, before 11 PM. The next morning when the day is full.
export function freeSlot(events: CalEvent[], day: string, time: string | null, minutes: number, now: Date, ignore?: string): { start: Date; end: Date } {
  const base = fromYmd(isYmd(day) ? day : ymd(now));
  const at = (h: number, m: number) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const start = at(h, m);
    return { start, end: new Date(start.getTime() + minutes * 60_000) };
  }
  const taken = dayOccurrences(events, ymd(base))
    .filter((o) => o.event.Id !== ignore)
    .map((o) => [o.start.getTime(), o.end.getTime()] as const);
  let start = at(9, 0);
  if (ymd(base) === ymd(now) && now > start) {
    start = new Date(now);
    start.setMinutes(now.getMinutes() < 30 ? 30 : 60, 0, 0);
  }
  const last = at(23, 0).getTime();
  for (let t = start.getTime(); t + minutes * 60_000 <= last; t += 30 * 60_000) {
    const end = t + minutes * 60_000;
    if (!taken.some(([s, e]) => t < e && end > s)) return { start: new Date(t), end: new Date(end) };
  }
  const next = addDays(base, 1);
  const s = new Date(next.getFullYear(), next.getMonth(), next.getDate(), 9, 0);
  return { start: s, end: new Date(s.getTime() + minutes * 60_000) };
}

// The first showing that overlaps [start, end) that day, leaving out `self`.
export function clashWith(events: CalEvent[], start: Date, end: Date, self?: string): Occurrence | null {
  return dayOccurrences(events, ymd(start)).find((o) => o.event.Id !== self && o.event.Of !== self && start < o.end && end > o.start) ?? null;
}

// The next free start at or after `start` (half-hour steps, from now today)
// that fits the same length before 11 PM; null when there's none.
export function nextFree(events: CalEvent[], start: Date, end: Date, now: Date, self?: string): Date | null {
  const length = end.getTime() - start.getTime();
  const day = ymd(start);
  const taken = dayOccurrences(events, day)
    .filter((o) => o.event.Id !== self && o.event.Of !== self)
    .map((o) => [o.start.getTime(), o.end.getTime()] as const);
  let t = start.getTime();
  if (day === ymd(now) && t < now.getTime()) t = Math.ceil(now.getTime() / 1_800_000) * 1_800_000;
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 23, 0).getTime();
  for (; t + length <= last; t += 30 * 60_000) {
    if (!taken.some(([s, e]) => t < e && t + length > s)) return new Date(t);
  }
  return null;
}

// ----- editing one day of a repeating event -----

// Takes `day` out of the series.
export function skipDay(events: CalEvent[], seriesId: string, day: string): CalEvent[] {
  return events.map((e) => (e.Id === seriesId ? { ...e, Skip: [...new Set([...(e.Skip ?? []), day])] } : e));
}

// Moves a whole series by the change made to one of its days: the new start
// and length, kept on the series' own first day (or its new day, when the
// change moves it to another day).
export function reshapeSeries(series: CalEvent, occ: Occurrence, start: Date, end: Date): Pick<CalEvent, "Start" | "End"> {
  const dayShift = Math.round((fromYmd(ymd(start)).getTime() - fromYmd(occ.day).getTime()) / 86_400_000);
  const first = addDays(fromYmd(series.Start.slice(0, 10)), dayShift);
  const s = new Date(first.getFullYear(), first.getMonth(), first.getDate(), start.getHours(), start.getMinutes());
  return { Start: localStamp(s), End: localStamp(new Date(s.getTime() + (end.getTime() - start.getTime()))) };
}

// ----- time zones -----

export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Minutes the zone is ahead of UTC at that moment.
function zoneOffset(zone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// A wall time in `zone` ("2026-09-25T17:00") as a moment on this PC.
export function fromZone(stamp: string, zone: string | null | undefined): Date {
  if (!zone || zone === localZone()) return fromStamp(stamp);
  const [day, time] = stamp.split("T");
  const [y, m, d] = day.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - zoneOffset(zone, new Date(guess)) * 60_000;
  t = guess - zoneOffset(zone, new Date(t)) * 60_000;
  return new Date(t);
}

// A moment as the wall time in `zone`.
export function toZone(at: Date, zone: string | null | undefined): string {
  if (!zone || zone === localZone()) return localStamp(at);
  const w = new Date(at.getTime() + zoneOffset(zone, at) * 60_000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${w.getUTCFullYear()}-${two(w.getUTCMonth() + 1)}-${two(w.getUTCDate())}T${two(w.getUTCHours())}:${two(w.getUTCMinutes())}`;
}

export function zoneName(zone: string, at = new Date()): string {
  const long = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? zone;
  const short = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
  // "Eastern Daylight Time (EDT)" reads better as "Eastern Time (ET)".
  const generic = long.replace(/ (Standard|Daylight|Summer) Time$/, " Time");
  const abbr = short && !/^GMT/.test(short) ? short.replace(/^([A-Z]{1,3})[SD]T$/, "$1T") : null;
  return abbr ? `${generic} (${abbr})` : generic;
}

// "Los Angeles", "Kolkata": the city in a zone's name.
export function zoneCity(zone: string): string {
  return zone === "UTC" ? "Coordinated Universal Time" : (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

export const commonZones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

// ----- video calls -----

export const callNames: Record<CallKind, string> = { teams: "Teams", meet: "Meet", zoom: "Zoom" };

const joinPatterns: [CallKind, RegExp][] = [
  ["teams", /https?:\/\/teams\.(?:microsoft|live)\.com\/l\/meetup-join\/[^\s<>"')\]]+/i],
  ["meet", /https?:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}[^\s<>"')\]]*/i],
  ["zoom", /https?:\/\/(?:[\w-]+\.)?zoom\.us\/j\/[^\s<>"')\]]+/i],
];

// A Teams, Meet or Zoom link in some text (the place or description).
export function findJoinLink(...texts: (string | null | undefined)[]): { call: CallKind; url: string } | null {
  for (const text of texts) {
    if (!text) continue;
    for (const [call, re] of joinPatterns) {
      const m = re.exec(text);
      if (m) return { call, url: m[0] };
    }
  }
  return null;
}

// Where Join goes: the pasted link, or one found in the place or description.
export function joinUrlOf(e: CalEvent): string | null {
  if (e.JoinUrl && /^https?:\/\//i.test(e.JoinUrl)) return e.JoinUrl;
  return findJoinLink(e.Place, e.Description)?.url ?? null;
}

// ----- labels -----

export const repeatLabels: Record<EventRepeat, string> = {
  daily: "Every day",
  weekdays: "Every weekday",
  weekly: "Every week",
  monthly: "Every month",
};

export const reminderChoices: { minutes: number; label: string }[] = [
  { minutes: 0, label: "At start" },
  { minutes: 10, label: "10 min before" },
  { minutes: 30, label: "30 min before" },
  { minutes: 60, label: "1 hr before" },
  { minutes: 1440, label: "1 day before" },
];
