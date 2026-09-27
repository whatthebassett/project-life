// Calendars in the iCalendar (.ics) format that Google, Outlook, iCloud and
// every other calendar app can export or share by link. ical.js reads them,
// time zones and repeat rules included; this turns what it finds into
// Project Life's events.
import ICAL from "ical.js";
import { addDays, ymd } from "../tasks/dates";
import { findJoinLink, localStamp, type CalEvent, type EventRepeat } from "./events";

// One event as the file has it, before it's put on a calendar.
export interface IcsEvent {
  uid: string;
  title: string;
  description: string;
  place: string;
  joinUrl: string | null;
  allDay: boolean;
  start: Date;
  end: Date;
  // A repeat Project Life can keep as a repeat (see simpleRepeat); otherwise
  // the file's own rule, spelled out as separate days.
  repeat: EventRepeat | null;
  // For a kept repeat: days taken out of it.
  skip: string[];
}

export interface IcsCalendar {
  // X-WR-CALNAME, which Google, Outlook and iCloud all set.
  name: string;
  events: IcsEvent[];
}

// How far a repeat without a simple shape is spelled out: a year back and two ahead.
const BACK_DAYS = 366;
const AHEAD_DAYS = 731;
const MAX_STEPS = 20_000;

// `keepRepeats`: an imported calendar keeps simple repeats as repeats (a
// birthday stays one yearly event). A subscription spells everything out.
export function readIcs(text: string, now: Date, keepRepeats: boolean): IcsCalendar {
  let root: InstanceType<typeof ICAL.Component>;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch {
    throw "That isn't a calendar file Project Life can read.";
  }
  // The time zones the file defines, so times inside it come out right.
  for (const tz of root.getAllSubcomponents("vtimezone")) {
    try {
      ICAL.TimezoneService.register(tz);
    } catch {
      // A zone it can't read: its times are taken as this PC's.
    }
  }
  const name = String(root.getFirstPropertyValue("x-wr-calname") ?? "").trim();
  const from = addDays(now, -BACK_DAYS);
  const to = addDays(now, AHEAD_DAYS);

  const all = root.getAllSubcomponents("vevent");
  // Changes to single days of a repeating event come as their own VEVENTs.
  const masters = all.filter((c) => !c.hasProperty("recurrence-id"));
  const changes = all.filter((c) => c.hasProperty("recurrence-id"));
  const events: IcsEvent[] = [];

  for (const comp of masters) {
    const event = new ICAL.Event(comp);
    for (const c of changes) {
      if (c.getFirstPropertyValue("uid") === event.uid) event.relateException(c);
    }
    if (String(comp.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
    const base = details(event);
    if (!event.startDate) continue;

    if (!event.isRecurring()) {
      const one = timing(event.startDate, event.endDate);
      if (one) events.push({ ...base, ...one, repeat: null, skip: [] });
      continue;
    }

    const kept = keepRepeats ? simpleRepeat(comp) : null;
    if (kept) {
      const one = timing(event.startDate, event.endDate);
      if (!one) continue;
      // Days taken out (EXDATE) and days changed (each becomes its own event).
      const skip = comp.getAllProperties("exdate").flatMap((p) => p.getValues().map((t) => ymd((t as InstanceType<typeof ICAL.Time>).toJSDate())));
      for (const c of changes) {
        if (c.getFirstPropertyValue("uid") !== event.uid) continue;
        const changed = new ICAL.Event(c);
        const was = c.getFirstPropertyValue("recurrence-id") as InstanceType<typeof ICAL.Time> | null;
        if (was) skip.push(ymd(was.toJSDate()));
        const t = timing(changed.startDate, changed.endDate);
        if (t && String(c.getFirstPropertyValue("status") ?? "").toUpperCase() !== "CANCELLED") events.push({ ...details(changed), ...t, repeat: null, skip: [] });
      }
      events.push({ ...base, ...one, repeat: kept, skip });
      continue;
    }

    // Anything else: each day it happens, from a year back to two ahead.
    const it = event.iterator();
    for (let steps = 0, next = it.next(); next && steps < MAX_STEPS; next = it.next(), steps++) {
      const occ = event.getOccurrenceDetails(next);
      const t = timing(occ.startDate, occ.endDate);
      if (!t) continue;
      if (t.start >= to) break;
      if (t.end <= from) continue;
      const item = occ.item === event ? base : details(occ.item);
      if (String(occ.item.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") continue;
      events.push({ ...item, ...t, repeat: null, skip: [] });
    }
  }
  return { name, events };
}

function details(event: InstanceType<typeof ICAL.Event>) {
  const description = (event.description ?? "").trim();
  const place = (event.location ?? "").trim();
  // Google puts the Meet link in a property of its own.
  const meet = String(event.component.getFirstPropertyValue("x-google-conference") ?? "");
  const joinUrl = /^https?:\/\//.test(meet) ? meet : (findJoinLink(place, description)?.url ?? null);
  return { uid: event.uid || crypto.randomUUID(), title: (event.summary ?? "").trim() || "(No title)", description, place, joinUrl };
}

// When it starts and ends here. An all-day event runs midnight to midnight.
function timing(start: InstanceType<typeof ICAL.Time> | null, end: InstanceType<typeof ICAL.Time> | null) {
  if (!start) return null;
  const allDay = start.isDate;
  const s = start.toJSDate();
  let e = end ? end.toJSDate() : allDay ? addDays(s, 1) : s;
  if (e < s) e = s;
  if (allDay && e.getTime() === s.getTime()) e = addDays(s, 1);
  return { allDay, start: s, end: e };
}

// The repeats Project Life has: every day, weekday, week, month or year,
// with no end date, count or gaps. Anything else is spelled out.
function simpleRepeat(comp: InstanceType<typeof ICAL.Component>): EventRepeat | null {
  const rules = comp.getAllProperties("rrule");
  if (rules.length !== 1 || comp.hasProperty("rdate")) return null;
  const rule = rules[0].getFirstValue() as InstanceType<typeof ICAL.Recur>;
  if (!rule || rule.until || rule.count || (rule.interval ?? 1) !== 1) return null;
  const parts = rule.parts ?? {};
  const byDay = (parts.BYDAY as string[] | undefined) ?? [];
  const others = Object.keys(parts).filter((k) => k !== "BYDAY" && k !== "BYMONTHDAY" && k !== "BYMONTH" && k !== "WKST");
  if (others.length) return null;
  const start = (comp.getFirstPropertyValue("dtstart") as InstanceType<typeof ICAL.Time>).toJSDate();
  const day = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][start.getDay()];
  switch (rule.freq) {
    case "DAILY":
      return byDay.length ? null : "daily";
    case "WEEKLY":
      if (!byDay.length || (byDay.length === 1 && byDay[0] === day)) return "weekly";
      return [...byDay].sort().join() === "FR,MO,TH,TU,WE" ? "weekdays" : null;
    case "MONTHLY":
      return byDay.length ? null : "monthly";
    case "YEARLY":
      return byDay.length ? null : "yearly";
    default:
      return null;
  }
}

// The file's events as Project Life events on `calendar`.
export function toCalEvents(events: IcsEvent[], calendar: string, idOf: (e: IcsEvent) => string, fields: Partial<CalEvent> = {}): CalEvent[] {
  const now = new Date().toISOString();
  return events.map((e) => ({
    Id: idOf(e),
    Title: e.title,
    Kind: "event",
    Start: e.allDay ? `${ymd(e.start)}T00:00` : localStamp(e.start),
    End: e.allDay ? `${ymd(e.end)}T00:00` : localStamp(e.end),
    AllDay: e.allDay,
    Calendar: calendar,
    Call: e.joinUrl ? (findJoinLink(e.joinUrl)?.call ?? null) : null,
    JoinUrl: e.joinUrl,
    Place: e.place,
    Description: e.description,
    TimeZone: null,
    Reminders: [],
    Reminded: now,
    Repeat: e.repeat,
    Skip: e.skip,
    Uid: e.uid,
    Created: now,
    ...fields,
  }));
}

// A short, steady id from text, so a subscribed event keeps its id from one
// refresh to the next (and stays selected).
export function stableId(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// Days in the file as yyyy-mm-dd, for the import summary.
export function spanOf(events: IcsEvent[]): { first: string; last: string } | null {
  if (!events.length) return null;
  const times = events.map((e) => e.start.getTime());
  return { first: ymd(new Date(Math.min(...times))), last: ymd(new Date(Math.max(...times))) };
}
