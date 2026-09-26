// Bringing connected calendars into Project Life (Settings → Connected
// accounts → Sync calendars): a month back to six months ahead, each
// repeating event as its separate days. What was last synced stays in
// accounts.json, so the Schedule still has it offline.
import { useEffect } from "react";
import { accountsApi, inTauri, type RemoteCalendar, type RemoteEvent } from "../lib/api";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { findJoinLink, localZone, type CalEvent } from "../schedule/events";
import { addDays, startOfDay, ymd } from "../tasks/dates";
import { calendarKey, toneOf, type Account, type SyncedCalendar } from "./model";
import { accountStore } from "./useAccounts";

const BACK_DAYS = 31;
const AHEAD_DAYS = 186;

const RECONNECT = "RECONNECT:";

// Fields that belong to Project Life, not Outlook or Google: kept across syncs.
const LOCAL_FIELDS = ["Reminded", "Note", "Task", "Created"] as const;

export function toEvent(account: Account, calendar: SyncedCalendar, r: RemoteEvent, before?: CalEvent): CalEvent {
  const found = findJoinLink(r.joinUrl, r.place, r.description);
  const e: CalEvent = {
    Id: `${account.Id}|${r.id}`,
    Title: r.title,
    Kind: "event",
    Start: r.start,
    End: r.end < r.start ? r.start : r.end,
    AllDay: r.allDay,
    Calendar: calendarKey(account.Id, calendar.Id),
    Description: r.description,
    Place: r.place,
    Call: found?.call ?? null,
    JoinUrl: r.joinUrl ?? found?.url ?? null,
    TimeZone: null,
    Reminders: r.reminders,
    // Only reminders from now on go off for an event seen for the first time.
    Reminded: new Date().toISOString(),
    Repeat: null,
    Skip: [],
    Remote: { Account: account.Id, Calendar: calendar.Id, Id: r.id, Series: r.series, Link: r.link, Editable: r.editable && calendar.CanEdit, Declined: r.declined },
    Created: new Date().toISOString(),
  };
  if (before) for (const k of LOCAL_FIELDS) if (before[k] !== undefined) (e as Record<string, unknown>)[k] = before[k];
  return e;
}

// The calendars as the account lists them now, keeping what was chosen here.
// New ones start on when they're yours (the main one and ones you can write
// to); shared and holiday calendars start off.
function mergeCalendars(before: SyncedCalendar[], now: RemoteCalendar[]): SyncedCalendar[] {
  return now.map((c, i) => {
    const old = before.find((b) => b.Id === c.id);
    return {
      ...old,
      Id: c.id,
      Name: c.name,
      Color: old?.Color ?? toneOf(c.color, i),
      On: old ? old.On : c.primary || c.canEdit,
      CanEdit: c.canEdit,
      Primary: c.primary,
      Reminders: c.reminders,
    };
  });
}

const running = new Map<string, Promise<void>>();

export function errorText(e: unknown): string {
  const text = e instanceof Error ? e.message : String(e);
  return text.startsWith(RECONNECT) ? "Sign in again to keep syncing." : text.replace(/^CONSENT:/, "");
}

export const needsSignIn = (e: unknown) => String(e instanceof Error ? e.message : e).startsWith(RECONNECT);

function patchAccount(id: string, fields: Partial<Account>) {
  accountStore().change((f) => ({ ...f, Accounts: f.Accounts.map((a) => (a.Id === id ? { ...a, ...fields } : a)) }));
}

// One account: its calendars, then the events on the ones that are on. A
// calendar that fails keeps what it had.
export function syncAccount(id: string): Promise<void> {
  const already = running.get(id);
  if (already) return already;
  const job = (async () => {
    const store = accountStore();
    if (store.unread()) await store.load();
    const account = store.getState().file.Accounts.find((a) => a.Id === id);
    if (!account || !inTauri) return;
    let calendars: SyncedCalendar[];
    try {
      calendars = mergeCalendars(account.Calendars, await accountsApi.calendars(id));
    } catch (e) {
      patchAccount(id, { Error: errorText(e), NeedsSignIn: needsSignIn(e) });
      return;
    }
    const today = startOfDay(new Date());
    const from = ymd(addDays(today, -BACK_DAYS));
    const to = ymd(addDays(today, AHEAD_DAYS));
    const zone = localZone();
    const fresh: CalEvent[] = [];
    const failed = new Set<string>();
    let problem: unknown = null;
    const withAccount = { ...account, Calendars: calendars };
    const before = new Map(store.getState().file.Events.filter((e) => e.Remote?.Account === id).map((e) => [e.Id, e]));
    for (const c of calendars.filter((c) => c.On)) {
      try {
        const list = await accountsApi.events(id, c.Id, from, to, zone, c.CanEdit, c.Reminders);
        for (const r of list) fresh.push(toEvent(withAccount, c, r, before.get(`${id}|${r.id}`)));
      } catch (e) {
        failed.add(c.Id);
        problem = e;
      }
    }
    store.change((f) => ({
      ...f,
      Accounts: f.Accounts.map((a) =>
        a.Id === id ? { ...a, Calendars: calendars, LastSync: problem ? a.LastSync : new Date().toISOString(), Error: problem ? errorText(problem) : null, NeedsSignIn: problem ? needsSignIn(problem) : false } : a,
      ),
      Events: [...f.Events.filter((e) => e.Remote?.Account !== id || failed.has(e.Remote.Calendar)), ...fresh],
    }));
  })().finally(() => running.delete(id));
  running.set(id, job);
  return job;
}

export async function syncAll(): Promise<void> {
  const store = accountStore();
  if (store.unread()) await store.load();
  await Promise.all(store.getState().file.Accounts.filter((a) => !a.NeedsSignIn).map((a) => syncAccount(a.Id)));
}

// When calendars sync: on start, then every 5 or 15 minutes, or only when
// Project Life opens and when the Schedule is opened ("Only when open").
export function useAccountSync() {
  const { settings } = useSettings();
  const every = settings.SyncEvery ?? "5";
  useEffect(() => {
    if (!inTauri) return;
    const first = window.setTimeout(() => void syncAll(), 3000);
    const minutes = every === "15" ? 15 : every === "5" ? 5 : 0;
    const timer = minutes ? window.setInterval(() => void syncAll(), minutes * 60_000) : 0;
    return () => {
      window.clearTimeout(first);
      if (timer) window.clearInterval(timer);
    };
  }, [every]);
}

// The Schedule asks for a fresh look when it opens, if the last one is a
// minute old.
export function syncIfStale() {
  if (!inTauri) return;
  const accounts = accountStore().getState().file.Accounts;
  const stale = accounts.some((a) => !a.NeedsSignIn && (!a.LastSync || Date.now() - Date.parse(a.LastSync) > 60_000));
  if (stale || currentSettings().SyncEvery === "open") void syncAll();
}
