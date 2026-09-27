// Connected accounts as they live in Data\accounts.json: who is signed in
// (never a token: those are in Windows' Credential Manager), their
// calendars, and the events last synced from them, so they show offline too.
// PascalCase keys, and keys this version doesn't know are kept.
import type { ProviderId } from "../lib/api";
import { cleanEvents, type CalEvent } from "../schedule/events";
import type { ListColor, TaskList } from "../tasks/lists";

export interface SyncedCalendar {
  // The calendar's id in Outlook or Google Calendar.
  Id: string;
  Name: string;
  // A theme color near the calendar's own, so every theme suits it.
  Color: ListColor;
  // Synced and shown.
  On: boolean;
  CanEdit: boolean;
  Primary: boolean;
  // Minutes before, for Google events that use the calendar's own reminders.
  Reminders: number[];
  [key: string]: unknown;
}

export interface Account {
  Id: string;
  Provider: ProviderId;
  Email: string;
  Name: string;
  // A work or school Microsoft account (Teams meetings can be made).
  Work: boolean;
  Calendars: SyncedCalendar[];
  // ISO; when the last sync finished.
  LastSync: string | null;
  // Why the last sync didn't work.
  Error: string | null;
  // The sign-in ran out or was taken back: Reconnect.
  NeedsSignIn: boolean;
  [key: string]: unknown;
}

export interface AccountFile {
  Accounts: Account[];
  Events: CalEvent[];
  [key: string]: unknown;
}

export const providerName: Record<ProviderId, string> = { microsoft: "Microsoft", google: "Google" };
export const appName: Record<ProviderId, string> = { microsoft: "Outlook", google: "Google Calendar" };

// A synced calendar's id where events and lists refer to it.
export const calendarKey = (account: string, calendar: string) => `${account}|${calendar}`;

export function splitKey(key: string): { account: string; calendar: string } | null {
  const at = key.indexOf("|");
  if (at < 0 || !/^(ms|google)-/.test(key)) return null;
  return { account: key.slice(0, at), calendar: key.slice(at + 1) };
}

const isObject = (x: unknown): x is Record<string, unknown> => Boolean(x) && typeof x === "object" && !Array.isArray(x);
const TONES: ListColor[] = ["accent", "accent2", "warn", "danger", "muted"];

export function parseAccounts(text: string | null): AccountFile {
  const clean = text?.replace(/^﻿/, "").trim();
  if (!clean) return { Accounts: [], Events: [] };
  const data = JSON.parse(clean) as Partial<AccountFile>;
  const accounts = (Array.isArray(data.Accounts) ? data.Accounts : [])
    .filter((a): a is Account => isObject(a) && typeof a.Id === "string" && (a.Provider === "microsoft" || a.Provider === "google"))
    .map((a) => ({
      ...a,
      Email: typeof a.Email === "string" ? a.Email : "",
      Name: typeof a.Name === "string" ? a.Name : "",
      Work: a.Work === true,
      Calendars: (Array.isArray(a.Calendars) ? a.Calendars : [])
        .filter((c): c is SyncedCalendar => isObject(c) && typeof c.Id === "string")
        .map((c) => ({
          ...c,
          Name: typeof c.Name === "string" ? c.Name : "Calendar",
          Color: TONES.includes(c.Color) ? c.Color : "accent",
          On: c.On !== false,
          CanEdit: c.CanEdit === true,
          Primary: c.Primary === true,
          Reminders: Array.isArray(c.Reminders) ? c.Reminders.filter((m) => typeof m === "number") : [],
        })),
      LastSync: typeof a.LastSync === "string" ? a.LastSync : null,
      Error: typeof a.Error === "string" ? a.Error : null,
      NeedsSignIn: a.NeedsSignIn === true,
    }));
  const known = new Set(accounts.map((a) => a.Id));
  return {
    ...data,
    Accounts: accounts,
    // Only events with an account that's still here.
    Events: cleanEvents(data.Events).filter((e) => e.Remote && known.has(e.Remote.Account)),
  };
}

export const serializeAccounts = (f: AccountFile) => JSON.stringify(f, null, 2);

// The theme color nearest a calendar's own: reds and pinks, oranges and
// yellows, greens and teals, blues and purples, and grays.
export function toneOf(hex: string | null, fallback: number): ListColor {
  const m = hex ? /^#?([0-9a-f]{6})$/i.exec(hex.trim()) : null;
  if (!m) return TONES[fallback % 4];
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return "muted";
  let h = 0;
  if (max === r) h = ((g - b) / (max - min)) % 6;
  else if (max === g) h = (b - r) / (max - min) + 2;
  else h = (r - g) / (max - min) + 4;
  const deg = (h * 60 + 360) % 360;
  if (deg < 18 || deg >= 320) return "danger";
  if (deg < 70) return "warn";
  if (deg < 190) return "accent2";
  return "accent";
}

// The calendars that are on, as the lists module shows them.
export function calendarLists(accounts: Account[]): TaskList[] {
  return accounts.flatMap((a) =>
    a.Calendars.filter((c) => c.On).map((c) => ({ id: calendarKey(a.Id, c.Id), name: c.Name, color: `var(--${c.Color})`, tone: c.Color, inTasks: false })),
  );
}
