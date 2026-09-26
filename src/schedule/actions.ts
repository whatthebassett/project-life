import { locale } from "../lib/format";
// What people do to events: add, save, move, delete. Changes to a repeating
// event apply to just one day or to all of them (the screen asks which).
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { currentSettings } from "../lib/settings";
import { currentLists, defaultListId } from "../tasks/lists";
import { newId } from "../tasks/model";
import { parseCapture } from "../tasks/quick";
import { toast } from "../ui/Toast";
import { fromStamp, localStamp, reshapeSeries, skipDay, type CalEvent, type EventFile, type Occurrence } from "./events";
import { eventStore } from "./useEvents";
import { addMeetingLink, deleteRemote, moveRemote, moveRemoteToLocal, patchSynced, saveRemote } from "../accounts/actions";
import { splitKey } from "../accounts/model";

export type Scope = "one" | "all";

const store = () => eventStore();

// Changes the file with Undo: the whole list goes back as it was.
function changeWithUndo(message: string, edit: (events: CalEvent[]) => CalEvent[]) {
  const before = store().getState().file.Events;
  store().change((f: EventFile) => ({ ...f, Events: edit(f.Events) }));
  toast(message, () => store().change((f) => ({ ...f, Events: before })));
}

// How long a new event runs (Settings → Schedule), in minutes.
export const eventLength = () => currentSettings().EventLength ?? 60;

export function blankEvent(start: Date, end: Date, fields: Partial<CalEvent> = {}): CalEvent {
  // Settings → Schedule: the calendar, reminder, call and time zone.
  const s = currentSettings();
  const calendar = s.EventCalendar && currentLists().some((l) => l.id === s.EventCalendar) ? s.EventCalendar : defaultListId();
  const reminder = s.EventReminder === null ? [] : [s.EventReminder ?? 10];
  return {
    Id: newId(),
    Title: "",
    Kind: "event",
    Start: localStamp(start),
    End: localStamp(end),
    AllDay: false,
    Calendar: calendar,
    Call: s.EventVideo && s.EventVideo !== "none" ? s.EventVideo : null,
    JoinUrl: null,
    Place: "",
    Description: "",
    TimeZone: s.ScheduleZone ?? null,
    Reminders: reminder,
    // Reminders only go off for times after this.
    Reminded: new Date().toISOString(),
    Repeat: null,
    Skip: [],
    Created: new Date().toISOString(),
    ...fields,
  };
}

export function allDayRange(day: string, days = 1): Pick<CalEvent, "Start" | "End" | "AllDay"> {
  return { Start: `${day}T00:00`, End: `${ymd(addDays(fromYmd(day), days))}T00:00`, AllDay: true };
}

// "Haircut sat 3pm" → an hour on Saturday at 3; "Mom's birthday sat" → all
// day Saturday; "#stream" picks the calendar. No day means today (tomorrow
// once the time has gone by).
export function parseQuickEvent(text: string, now: Date): CalEvent | null {
  if (!text.trim()) return null;
  const p = parseCapture(text, now, { undated: "today", readDates: true });
  const day = p.due ?? ymd(now);
  // A #list picks the calendar; otherwise the one from Settings → Schedule.
  const base = /\s#[\w-]+/.test(` ${text}`) && p.list ? { Title: p.title, Calendar: p.list } : { Title: p.title };
  if (p.time) {
    const [h, m] = p.time.split(":").map(Number);
    const d = fromYmd(day);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    return blankEvent(start, new Date(start.getTime() + eventLength() * 60_000), base);
  }
  return { ...blankEvent(fromYmd(day), fromYmd(day), base), ...allDayRange(day), Reminders: [] };
}

export function addEvent(event: CalEvent, quiet = false) {
  store().change((f) => ({ ...f, Events: [...f.Events, event] }));
  void addMeetingLink(event);
  if (!quiet) toast(`Added “${event.Title || "New event"}”`, () => removeEvents((e) => e.Id === event.Id));
}

function removeEvents(match: (e: CalEvent) => boolean) {
  store().change((f) => ({ ...f, Events: f.Events.filter((e) => !match(e)) }));
}

// Saves an event, new or edited. `occ` is the day it was opened from; for a
// repeating event, `scope` says whether the change is for that day only.
export function saveEvent(draft: CalEvent, occ: Occurrence | null, scope: Scope) {
  // Connected calendars: Outlook or Google Calendar has the event.
  const before = draft.Remote ? draft : (store().getState().file.Events.find((e) => e.Id === draft.Id) ?? null);
  if (splitKey(draft.Calendar)) {
    void saveRemote(draft, before);
    return;
  }
  if (draft.Remote) {
    void moveRemoteToLocal(draft, draft);
    return;
  }
  const series = occ?.event;
  const seriesEdit = Boolean(occ && series?.Repeat && draft.Id === series.Id);
  if (seriesEdit && scope === "one") {
    // That day comes out of the series, and a copy with the changes takes its place.
    const one: CalEvent = { ...draft, Id: newId(), Repeat: null, Skip: [], Of: series!.Id, OnDate: occ!.day };
    store().change((f) => ({ ...f, Events: [...skipDay(f.Events, series!.Id, occ!.day), one] }));
    void addMeetingLink(one);
    return;
  }
  // All of them: the editor showed the day it was opened from, so the new
  // time goes back onto the series' own first day.
  const saved = seriesEdit && draft.Repeat && !draft.AllDay ? { ...draft, ...reshapeSeries(series!, occ!, fromStamp(draft.Start), fromStamp(draft.End)) } : draft;
  store().change((f) => ({
    ...f,
    Events: f.Events.some((e) => e.Id === saved.Id) ? f.Events.map((e) => (e.Id === saved.Id ? saved : e)) : [...f.Events, saved],
  }));
  // Teams or Meet asked for with no link yet: a connected account makes one.
  void addMeetingLink(saved);
}

// Dragged to a new time (and maybe day).
export function moveOccurrence(occ: Occurrence, start: Date, end: Date, scope: Scope) {
  const e = occ.event;
  if (e.Remote) {
    void moveRemote(e, localStamp(start), localStamp(end));
    return;
  }
  if (e.Repeat && scope === "all") {
    const shape = reshapeSeries(e, occ, start, end);
    store().change((f) => ({ ...f, Events: f.Events.map((x) => (x.Id === e.Id ? { ...x, ...shape, Reminded: new Date().toISOString() } : x)) }));
    return;
  }
  if (e.Repeat) {
    const one: CalEvent = { ...e, Id: newId(), Start: localStamp(start), End: localStamp(end), Repeat: null, Skip: [], Of: e.Id, OnDate: occ.day, Reminded: new Date().toISOString() };
    store().change((f) => ({ ...f, Events: [...skipDay(f.Events, e.Id, occ.day), one] }));
    return;
  }
  store().change((f) => ({ ...f, Events: f.Events.map((x) => (x.Id === e.Id ? { ...x, Start: localStamp(start), End: localStamp(end), Reminded: new Date().toISOString() } : x)) }));
}

export function deleteOccurrence(occ: Occurrence, scope: Scope) {
  const e = occ.event;
  if (e.Remote) {
    void deleteRemote(e);
    return;
  }
  const name = `“${e.Title || "Untitled"}”`;
  if (e.Repeat && scope === "one") {
    changeWithUndo(`Removed ${name} on ${fromYmd(occ.day).toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" })}`, (events) => skipDay(events, e.Id, occ.day));
    return;
  }
  // The whole event, and any one-day changes made to it.
  changeWithUndo(`Deleted ${name}`, (events) => events.filter((x) => x.Id !== e.Id && x.Of !== e.Id));
}

export function patchEvent(id: string, fields: Partial<CalEvent>) {
  if (patchSynced(id, fields)) return;
  store().change((f) => ({ ...f, Events: f.Events.map((e) => (e.Id === id ? { ...e, ...fields } : e)) }));
}
