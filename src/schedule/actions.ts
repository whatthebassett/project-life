// What people do to events: add, save, move, delete. Changes to a repeating
// event apply to just one day or to all of them (the screen asks which).
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { defaultListId } from "../tasks/lists";
import { newId } from "../tasks/model";
import { parseCapture } from "../tasks/quick";
import { toast } from "../ui/Toast";
import { fromStamp, localStamp, reshapeSeries, skipDay, type CalEvent, type EventFile, type Occurrence } from "./events";
import { eventStore } from "./useEvents";

export type Scope = "one" | "all";

const store = () => eventStore();

// Changes the file with Undo: the whole list goes back as it was.
function changeWithUndo(message: string, edit: (events: CalEvent[]) => CalEvent[]) {
  const before = store().getState().file.Events;
  store().change((f: EventFile) => ({ ...f, Events: edit(f.Events) }));
  toast(message, () => store().change((f) => ({ ...f, Events: before })));
}

export function blankEvent(start: Date, end: Date, fields: Partial<CalEvent> = {}): CalEvent {
  return {
    Id: newId(),
    Title: "",
    Kind: "event",
    Start: localStamp(start),
    End: localStamp(end),
    AllDay: false,
    Calendar: defaultListId(),
    Call: null,
    JoinUrl: null,
    Place: "",
    Description: "",
    TimeZone: null,
    Reminders: [10],
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
  const p = parseCapture(text, now, { undated: "today" });
  const day = p.due ?? ymd(now);
  const base = { Title: p.title, Calendar: p.list ?? defaultListId() };
  if (p.time) {
    const [h, m] = p.time.split(":").map(Number);
    const d = fromYmd(day);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    return blankEvent(start, new Date(start.getTime() + 60 * 60_000), base);
  }
  return { ...blankEvent(fromYmd(day), fromYmd(day), base), ...allDayRange(day), Reminders: [] };
}

export function addEvent(event: CalEvent, quiet = false) {
  store().change((f) => ({ ...f, Events: [...f.Events, event] }));
  if (!quiet) toast(`Added “${event.Title || "New event"}”`, () => removeEvents((e) => e.Id === event.Id));
}

function removeEvents(match: (e: CalEvent) => boolean) {
  store().change((f) => ({ ...f, Events: f.Events.filter((e) => !match(e)) }));
}

// Saves an event, new or edited. `occ` is the day it was opened from; for a
// repeating event, `scope` says whether the change is for that day only.
export function saveEvent(draft: CalEvent, occ: Occurrence | null, scope: Scope) {
  const series = occ?.event;
  const seriesEdit = Boolean(occ && series?.Repeat && draft.Id === series.Id);
  if (seriesEdit && scope === "one") {
    // That day comes out of the series, and a copy with the changes takes its place.
    const one: CalEvent = { ...draft, Id: newId(), Repeat: null, Skip: [], Of: series!.Id, OnDate: occ!.day };
    store().change((f) => ({ ...f, Events: [...skipDay(f.Events, series!.Id, occ!.day), one] }));
    return;
  }
  // All of them: the editor showed the day it was opened from, so the new
  // time goes back onto the series' own first day.
  const saved = seriesEdit && draft.Repeat && !draft.AllDay ? { ...draft, ...reshapeSeries(series!, occ!, fromStamp(draft.Start), fromStamp(draft.End)) } : draft;
  store().change((f) => ({
    ...f,
    Events: f.Events.some((e) => e.Id === saved.Id) ? f.Events.map((e) => (e.Id === saved.Id ? saved : e)) : [...f.Events, saved],
  }));
}

// Dragged to a new time (and maybe day).
export function moveOccurrence(occ: Occurrence, start: Date, end: Date, scope: Scope) {
  const e = occ.event;
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
  const name = `“${e.Title || "Untitled"}”`;
  if (e.Repeat && scope === "one") {
    changeWithUndo(`Removed ${name} on ${fromYmd(occ.day).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`, (events) => skipDay(events, e.Id, occ.day));
    return;
  }
  // The whole event, and any one-day changes made to it.
  changeWithUndo(`Deleted ${name}`, (events) => events.filter((x) => x.Id !== e.Id && x.Of !== e.Id));
}

export function patchEvent(id: string, fields: Partial<CalEvent>) {
  store().change((f) => ({ ...f, Events: f.Events.map((e) => (e.Id === id ? { ...e, ...fields } : e)) }));
}
