// What people do with connected accounts: connect and disconnect, pick
// calendars, and change events that live in Outlook or Google Calendar. A
// change shows at once and is sent in the background; if Outlook or Google
// says no, it goes back as it was and a message says why.
import { accountsApi, type ProviderId, type RemoteEventInput } from "../lib/api";
import { newId } from "../tasks/model";
import { toast } from "../ui/Toast";
import { eventStore } from "../schedule/useEvents";
import { callNames, findJoinLink, localZone, type CalEvent, type CallKind } from "../schedule/events";
import { appName, splitKey, type Account } from "./model";
import { errorText, needsSignIn, syncAccount, toEvent } from "./sync";
import { accountStore } from "./useAccounts";

const store = () => accountStore();
const accounts = () => store().getState().file.Accounts;
const accountOf = (id: string) => accounts().find((a) => a.Id === id);

// ----- accounts -----

export async function connectAccount(provider: ProviderId): Promise<Account> {
  const s = store();
  if (s.unread()) await s.load();
  const info = await accountsApi.connect(provider);
  const existing = accountOf(info.id);
  const account: Account = {
    ...existing,
    Id: info.id,
    Provider: info.provider,
    Email: info.email,
    Name: info.name,
    Work: info.work,
    Calendars: existing?.Calendars ?? [],
    LastSync: existing?.LastSync ?? null,
    Error: null,
    NeedsSignIn: false,
  };
  s.change((f) => ({ ...f, Accounts: existing ? f.Accounts.map((a) => (a.Id === account.Id ? account : a)) : [...f.Accounts, account] }));
  await syncAccount(account.Id);
  return account;
}

export async function disconnectAccount(account: Account) {
  await accountsApi.disconnect(account.Id).catch(() => {});
  store().change((f) => ({ ...f, Accounts: f.Accounts.filter((a) => a.Id !== account.Id), Events: f.Events.filter((e) => e.Remote?.Account !== account.Id) }));
  toast(`Disconnected ${account.Email || appName[account.Provider]}`);
}

export function setCalendarOn(account: Account, calendar: string, on: boolean) {
  store().change((f) => ({
    ...f,
    Accounts: f.Accounts.map((a) => (a.Id === account.Id ? { ...a, Calendars: a.Calendars.map((c) => (c.Id === calendar ? { ...c, On: on } : c)) } : a)),
    // Off: its events go until it's on again.
    Events: on ? f.Events : f.Events.filter((e) => !(e.Remote?.Account === account.Id && e.Remote.Calendar === calendar)),
  }));
  if (on) void syncAccount(account.Id);
}

// ----- where an event's call link comes from -----

// The account that makes Teams links (a work or school Microsoft account) or
// Meet links (Google). Zoom links are always pasted.
export function meetingAccount(call: CallKind | null | undefined, prefer?: string): Account | null {
  if (call !== "teams" && call !== "meet") return null;
  const ok = (a: Account) => !a.NeedsSignIn && (call === "teams" ? a.Provider === "microsoft" && a.Work : a.Provider === "google");
  return accounts().find((a) => a.Id === prefer && ok(a)) ?? accounts().find(ok) ?? null;
}

// Whether saving this event makes its call link, and with which account.
export function meetingPlan(e: Pick<CalEvent, "Kind" | "Call" | "JoinUrl" | "Place" | "Description" | "Calendar">): Account | null {
  if (e.Kind === "reminder" || !e.Call || e.JoinUrl || findJoinLink(e.Place, e.Description)) return null;
  return meetingAccount(e.Call, splitKey(e.Calendar)?.account);
}

// A link on its own, for an event on one of Project Life's own calendars (or
// on another provider's calendar). Asks once for Teams permission when needed.
async function standaloneLink(account: Account, e: CalEvent): Promise<string> {
  try {
    return await accountsApi.meeting(account.Id, e.Title || "Meeting", e.Start, e.End);
  } catch (err) {
    if (String(err instanceof Error ? err.message : err).startsWith("CONSENT:")) {
      await accountsApi.allowMeetings(account.Id, account.Email);
      return accountsApi.meeting(account.Id, e.Title || "Meeting", e.Start, e.End);
    }
    throw err;
  }
}

// After a local event is saved: make its Teams or Meet link, if it asked for one.
export async function addMeetingLink(event: CalEvent) {
  const account = meetingPlan(event);
  if (!account || event.Remote) return;
  const name = callNames[event.Call!];
  try {
    const url = await standaloneLink(account, event);
    eventStore().change((f) => ({ ...f, Events: f.Events.map((e) => (e.Id === event.Id ? { ...e, JoinUrl: url } : e)) }));
    toast(`Added a ${name} link to “${event.Title || "Untitled"}”`);
  } catch (err) {
    toast(`Couldn't make a ${name} link: ${errorText(err)}`);
  }
}

// ----- events in Outlook and Google Calendar -----

function inputOf(e: CalEvent, meeting: boolean): RemoteEventInput {
  return {
    title: e.Title,
    start: e.Start,
    end: e.End,
    allDay: Boolean(e.AllDay),
    place: e.Place ?? "",
    description: e.Description ?? "",
    reminders: e.Reminders ?? [],
    meeting,
  };
}

const syncedEvents = () => store().getState().file.Events;

function putSynced(e: CalEvent, replacing?: string) {
  store().change((f) => {
    const rest = f.Events.filter((x) => x.Id !== e.Id && x.Id !== replacing);
    return { ...f, Events: [...rest, e] };
  });
}

function dropSynced(id: string) {
  store().change((f) => ({ ...f, Events: f.Events.filter((x) => x.Id !== id) }));
}

function failed(what: string, err: unknown, account?: Account) {
  if (account && needsSignIn(err)) store().change((f) => ({ ...f, Accounts: f.Accounts.map((a) => (a.Id === account.Id ? { ...a, NeedsSignIn: true, Error: errorText(err) } : a)) }));
  toast(`${what}: ${errorText(err)}`);
}

// Saves an event onto a connected calendar: new, changed, or moved there
// from another calendar (the old one is removed once the new one is in).
export async function saveRemote(draft: CalEvent, before: CalEvent | null) {
  const target = splitKey(draft.Calendar);
  if (!target) return;
  const account = accountOf(target.account);
  const calendar = account?.Calendars.find((c) => c.Id === target.calendar);
  if (!account || !calendar) return;
  const sameCalendar = before?.Remote && before.Remote.Account === account.Id && before.Remote.Calendar === calendar.Id;
  // Teams on an Outlook calendar and Meet on a Google one come with the
  // event; the other way round, the link is made on its own and written in.
  const maker = meetingPlan(draft);
  const native = maker?.Id === account.Id && ((draft.Call === "teams" && account.Provider === "microsoft") || (draft.Call === "meet" && account.Provider === "google"));
  const tempId = sameCalendar ? draft.Id : `${account.Id}|pending-${newId()}`;
  const shown: CalEvent = {
    ...draft,
    Id: tempId,
    Repeat: null,
    Skip: [],
    Remote: sameCalendar ? before!.Remote : { Account: account.Id, Calendar: calendar.Id, Id: "", Editable: true },
  };
  const prior = syncedEvents().find((e) => e.Id === draft.Id) ?? null;
  putSynced(shown);
  // Moved here from Project Life's own calendars: it leaves events.json.
  const fromLocal = before && !before.Remote ? before : null;
  if (fromLocal) eventStore().change((f) => ({ ...f, Events: f.Events.filter((e) => e.Id !== fromLocal.Id && e.Of !== fromLocal.Id) }));
  try {
    let input = inputOf(draft, native);
    if (maker && !native) {
      const url = await standaloneLink(maker, draft);
      input = { ...input, description: `${input.description ? `${input.description}\n\n` : ""}${callNames[draft.Call!]}: ${url}` };
    }
    const saved = await accountsApi.saveEvent(account.Id, calendar.Id, sameCalendar ? before!.Remote!.Id : null, input, localZone());
    putSynced(toEvent(account, calendar, saved, { ...draft, Reminded: draft.Reminded ?? new Date().toISOString() }), tempId);
    // Moved here from another connected calendar: the old one goes.
    if (before?.Remote && !sameCalendar) {
      dropSynced(before.Id);
      await accountsApi.deleteEvent(before.Remote.Account, before.Remote.Calendar, before.Remote.Id).catch((e) => failed(`Couldn't remove the old copy of “${before.Title}”`, e));
    }
    if (!sameCalendar) toast(`Added “${draft.Title || "New event"}” to ${appName[account.Provider]}`);
  } catch (err) {
    dropSynced(tempId);
    if (prior) putSynced(prior);
    if (fromLocal) eventStore().change((f) => ({ ...f, Events: [...f.Events, fromLocal] }));
    failed(`Couldn't save “${draft.Title || "the event"}” to ${appName[account.Provider]}`, err, account);
  }
}

// From a connected calendar to one of Project Life's own.
export async function moveRemoteToLocal(draft: CalEvent, before: CalEvent) {
  const remote = before.Remote!;
  const local: CalEvent = { ...draft, Id: newId(), Remote: null, Repeat: null, Skip: [] };
  eventStore().change((f) => ({ ...f, Events: [...f.Events, local] }));
  dropSynced(before.Id);
  try {
    await accountsApi.deleteEvent(remote.Account, remote.Calendar, remote.Id);
  } catch (err) {
    putSynced(before);
    failed(`Moved “${draft.Title}”, but couldn't remove it from ${appName[accountOf(remote.Account)?.Provider ?? "microsoft"]}`, err, accountOf(remote.Account));
  }
}

export async function moveRemote(event: CalEvent, start: string, end: string) {
  await saveRemote({ ...event, Start: start, End: end }, event);
}

export async function deleteRemote(event: CalEvent) {
  const remote = event.Remote!;
  const account = accountOf(remote.Account);
  dropSynced(event.Id);
  try {
    await accountsApi.deleteEvent(remote.Account, remote.Calendar, remote.Id);
    toast(`Deleted “${event.Title || "Untitled"}” from ${appName[account?.Provider ?? "microsoft"]}`);
  } catch (err) {
    putSynced(event);
    failed(`Couldn't delete “${event.Title}”`, err, account);
  }
}

// Project Life's own notes on a synced event (its note, task, reminders
// fired): kept here, never sent.
export function patchSynced(id: string, fields: Partial<CalEvent>): boolean {
  if (!syncedEvents().some((e) => e.Id === id)) return false;
  store().change((f) => ({ ...f, Events: f.Events.map((e) => (e.Id === id ? { ...e, ...fields } : e)) }));
  return true;
}
