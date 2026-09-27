// Calendars subscribed to by link (Data\calendars.json): Google's "secret
// address in iCal format", Outlook's published calendars, iCloud, holidays,
// sports fixtures. Read-only here: each refresh replaces their events with
// what the link says now. They refresh when Project Life starts and every
// hour.
import { useEffect, useSyncExternalStore } from "react";
import { announceData, fetchCalendar, inTauri, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import { listColors, setSubscribedCalendars, type ListColor, type TaskList } from "../tasks/lists";
import { newId } from "../tasks/model";
import { toast } from "../ui/Toast";
import { cleanEvents, type CalEvent } from "./events";
import { readIcs, stableId, toCalEvents } from "./ics";

export interface Feed {
  Id: string;
  Name: string;
  Url: string;
  Color: ListColor;
  // ISO time of the last good refresh, and why the last one failed.
  LastSync?: string | null;
  Error?: string | null;
  [key: string]: unknown;
}

export interface FeedFile {
  Feeds: Feed[];
  Events: CalEvent[];
  [key: string]: unknown;
}

// A subscribed calendar's id wherever calendars are looked up.
export const feedKey = (id: string) => `feed:${id}`;

const isColor = (c: unknown): c is ListColor => listColors.some((x) => x.id === c);

function parseFeeds(text: string | null): FeedFile {
  if (!text) return { Feeds: [], Events: [] };
  const data = JSON.parse(text) as Partial<FeedFile>;
  const feeds = (Array.isArray(data.Feeds) ? data.Feeds : [])
    .filter((f): f is Feed => Boolean(f) && typeof f.Id === "string" && typeof f.Url === "string")
    .map((f) => ({ ...f, Name: typeof f.Name === "string" && f.Name ? f.Name : "Calendar", Color: isColor(f.Color) ? f.Color : "hue-4" }));
  const ids = new Set(feeds.map((f) => f.Id));
  return { ...data, Feeds: feeds, Events: cleanEvents(data.Events).filter((e) => ids.has(String(e.Feed))) };
}

export const feedCalendars = (feeds: Feed[]): TaskList[] =>
  feeds.map((f) => ({ id: feedKey(f.Id), name: f.Name, color: `var(--${f.Color})`, tone: f.Color, inTasks: false }));

let store: FileStore<FeedFile> | null = null;

export function feedStore(): FileStore<FeedFile> {
  store ??= new FileStore<FeedFile>(
    {
      read: () => readData("calendars.json"),
      write: (json) => writeData("calendars.json", json),
      announce: () => announceData("calendars.json"),
    },
    {
      what: "subscribed calendars",
      empty: { Feeds: [], Events: [] },
      parse: parseFeeds,
      serialize: (f) => JSON.stringify(f, null, 2),
      onChange: (f) => setSubscribedCalendars(feedCalendars(f.Feeds)),
    },
  );
  return store;
}

let watching = false;

export function useFeeds() {
  const s = feedStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("calendars.json", () => void s.load());
    }
  }, [s]);
  return { feeds: state.file.Feeds, events: state.file.Events, store: s };
}

// The calendar at `url`, read into events for the feed `id`.
async function download(id: string, url: string) {
  const text = await fetchCalendar(url);
  const cal = readIcs(text, new Date(), false);
  const events = toCalEvents(cal.events, feedKey(id), (e) => `f${id.slice(0, 8)}-${stableId(`${e.uid}|${e.start.getTime()}`)}`, { Feed: id });
  return { name: cal.name, events };
}

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong.");

// Adds a calendar by its link. Reads it first, so a wrong link says so
// straight away instead of leaving an empty calendar.
export async function subscribe(url: string, name: string, color: ListColor): Promise<Feed> {
  const id = newId();
  const got = await download(id, url);
  const feed: Feed = { Id: id, Name: name.trim() || got.name || hostOf(url), Url: url.trim(), Color: color, LastSync: new Date().toISOString(), Error: null };
  const s = feedStore();
  if (s.unread()) await s.load();
  s.change((f) => ({ ...f, Feeds: [...f.Feeds, feed], Events: [...f.Events, ...got.events] }));
  toast(`Subscribed to “${feed.Name}”: ${got.events.length} ${got.events.length === 1 ? "event" : "events"}`);
  return feed;
}

// The calendar's name in the file, for the dialog to suggest before subscribing.
export async function peekName(url: string): Promise<string> {
  return readIcs(await fetchCalendar(url), new Date(), false).name;
}

export async function refreshFeed(id: string): Promise<void> {
  const s = feedStore();
  const feed = s.getState().file.Feeds.find((f) => f.Id === id);
  if (!feed) return;
  try {
    const got = await download(id, feed.Url);
    s.change((f) => {
      // Notes and tasks linked to an event here stay linked.
      const links = new Map(f.Events.filter((e) => e.Feed === id && (e.Note || e.Task)).map((e) => [e.Id, { Note: e.Note, Task: e.Task }]));
      return {
        ...f,
        Feeds: f.Feeds.map((x) => (x.Id === id ? { ...x, LastSync: new Date().toISOString(), Error: null } : x)),
        Events: [...f.Events.filter((e) => e.Feed !== id), ...got.events.map((e) => ({ ...e, ...links.get(e.Id) }))],
      };
    });
  } catch (e) {
    s.change((f) => ({ ...f, Feeds: f.Feeds.map((x) => (x.Id === id ? { ...x, Error: errorText(e) } : x)) }));
  }
}

export async function refreshAll(): Promise<void> {
  const s = feedStore();
  if (s.unread()) await s.load();
  await Promise.all(s.getState().file.Feeds.map((f) => refreshFeed(f.Id)));
}

// A note or task linked to a subscribed event: the only change it takes.
export function patchFeedEvent(id: string, fields: Pick<CalEvent, "Note" | "Task">) {
  feedStore().change((f) => ({ ...f, Events: f.Events.map((e) => (e.Id === id ? { ...e, ...fields } : e)) }));
}

export function renameFeed(id: string, name: string) {
  const text = name.trim();
  if (text) feedStore().change((f) => ({ ...f, Feeds: f.Feeds.map((x) => (x.Id === id ? { ...x, Name: text } : x)) }));
}

export function recolorFeed(id: string, color: ListColor) {
  feedStore().change((f) => ({ ...f, Feeds: f.Feeds.map((x) => (x.Id === id ? { ...x, Color: color } : x)) }));
}

export function unsubscribe(id: string) {
  const s = feedStore();
  const before = s.getState().file;
  const feed = before.Feeds.find((f) => f.Id === id);
  if (!feed) return;
  s.change((f) => ({ ...f, Feeds: f.Feeds.filter((x) => x.Id !== id), Events: f.Events.filter((e) => e.Feed !== id) }));
  toast(`Unsubscribed from “${feed.Name}”`, () =>
    s.change((f) => ({ ...f, Feeds: [...f.Feeds, feed], Events: [...f.Events, ...before.Events.filter((e) => e.Feed === id)] })),
  );
}

// On start (after the rest has loaded), then every hour.
export function useFeedSync() {
  useEffect(() => {
    if (!inTauri) return;
    const first = window.setTimeout(() => void refreshAll(), 5000);
    const hourly = window.setInterval(() => void refreshAll(), 3_600_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(hourly);
    };
  }, []);
}

function hostOf(url: string) {
  try {
    return new URL(url.replace(/^webcals?:/i, "https:")).hostname.replace(/^www\./, "");
  } catch {
    return "Calendar";
  }
}
