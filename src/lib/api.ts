import { invoke, isTauri } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

// Typed wrappers around the Rust commands in src-tauri/src/lib.rs.
//
// Outside Tauri (the plain Vite page in a browser, handy for checking layouts)
// settings fall back to localStorage so the app still works.
export const inTauri = isTauri();

const BROWSER_KEY = "project-life:settings";

export async function readSettings(): Promise<string | null> {
  if (!inTauri) {
    try {
      return localStorage.getItem(BROWSER_KEY);
    } catch {
      return null;
    }
  }
  return invoke<string | null>("read_settings");
}

export async function writeSettings(contents: string): Promise<void> {
  if (!inTauri) {
    try {
      localStorage.setItem(BROWSER_KEY, contents);
    } catch {
      // Private window or blocked storage: the change just isn't kept.
    }
    return;
  }
  await invoke("write_settings", { contents });
}

// The JSON data files in Data\ (tasks.json, events.json …), read and written whole.
export type DataFile = "tasks.json" | "events.json" | "habits.json" | "goals.json" | "accounts.json" | "calendars.json";

export async function readData(name: DataFile): Promise<string | null> {
  if (!inTauri) {
    try {
      return localStorage.getItem(`project-life:${name}`);
    } catch {
      return null;
    }
  }
  return invoke<string | null>("read_data", { name });
}

export async function writeData(name: DataFile, contents: string): Promise<void> {
  if (!inTauri) {
    try {
      localStorage.setItem(`project-life:${name}`, contents);
    } catch {
      // Not kept in a private window; fine for a preview.
    }
    return;
  }
  await invoke("write_data", { name, contents });
}

// Another window saved a data file (Tasks popped out saves tasks.json, and the
// main window reloads it, and the other way round).
const DATA_CHANGED = "data:changed";

function windowLabel(): string {
  return inTauri ? getCurrentWindow().label : "browser";
}

export function announceData(name: DataFile | "settings.json"): void {
  if (!inTauri) return;
  void emit(DATA_CHANGED, { name, from: windowLabel() }).catch(() => {});
}

export function onDataChanged(name: DataFile | "settings.json", reload: () => void): void {
  if (!inTauri) return;
  const me = windowLabel();
  void listen<{ name?: string; from?: string }>(DATA_CHANGED, (e) => {
    if (e.payload?.name === name && e.payload.from !== me) reload();
  });
}

// Text from a public web address (feeds, weather), fetched by Rust so there's
// no cross-origin trouble. The browser preview uses fetch, which works for
// services that allow it (Open-Meteo does; most feeds don't).
export async function fetchText(url: string): Promise<string> {
  if (!inTauri) {
    const res = await fetch(url);
    if (!res.ok) throw `${new URL(url).hostname} answered ${res.status}.`;
    return res.text();
  }
  return invoke<string>("fetch_text", { url });
}

// Scores and stock prices for Home's Sports and Markets cards (fetch_data:
// ESPN and Yahoo Finance only). The browser preview tries fetch, which those
// services may refuse.
export async function fetchData(url: string): Promise<string> {
  if (!inTauri) {
    const res = await fetch(url);
    if (!res.ok) throw `${new URL(url).hostname} answered ${res.status}.`;
    return res.text();
  }
  return invoke<string>("fetch_data", { url });
}

// A calendar shared by link (.ics), for subscribing. See fetch_calendar.
export async function fetchCalendar(url: string): Promise<string> {
  if (!inTauri) {
    const res = await fetch(url.trim().replace(/^webcals?:/i, "https:"));
    if (!res.ok) throw `${new URL(url).hostname} answered ${res.status}.`;
    return res.text();
  }
  return invoke<string>("fetch_calendar", { url });
}

// Opens a web page in the default browser.
export async function openUrl(url: string): Promise<void> {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl: open } = await import("@tauri-apps/plugin-opener");
  await open(url);
}

export async function defaultName(): Promise<string> {
  if (!inTauri) return "";
  return invoke<string>("default_name");
}

// ----- notes (ported from Checkpoint) -----

export interface NoteInfo {
  name: string;
  modified: number;
  // When the file was made; 0 when Windows doesn't say.
  created: number;
  size: number;
  // The emoji from its front matter ("icon:"), when it has one.
  icon?: string | null;
}

// Switching notes folders. With copying on, the notes are merged into
// whatever the folder already holds; nothing there is replaced.
export interface FolderSwitch {
  path: string;
  // Notes written into the folder; how many of those got a new name because
  // the folder had one by that name; and how many were already there, identical.
  copied: number;
  renamed: number;
  same: number;
  // The folder already had a notebook of its own.
  merged: boolean;
}

export interface NotesFolderInfo {
  path: string;
  defaultPath: string;
  chosen: string | null;
  // The chosen folder couldn't be reached, so the default is in use.
  unavailable: boolean;
}

// Importing keeps going past a file it can't read, and says which ones failed.
export interface ImportResult {
  imported: string[];
  failed: { file: string; error: string }[];
}

// The notebook files beside the notes, named like Checkpoint's so a notes
// folder works in both apps.
export type MetaFile = ".noted-order.json" | ".noted-tags.json" | ".noted-folders.json" | ".noted-pages.json" | ".noted-pins.json" | ".noted-stats.json";

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  site: string;
  image: string;
}

// The notes commands in src-tauri/src/notes.rs. The browser preview keeps
// notes in localStorage instead (browserNotes.ts), so the screen can be tried
// out without the app.
const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
  if (inTauri) return invoke<T>(command, args);
  const { browserNotes } = await import("./browserNotes");
  return browserNotes(command, args ?? {}) as T;
};

export const api = {
  listNotes: () => call<NoteInfo[]>("list_notes"),
  readNote: (name: string) => call<string>("read_note", { name }),
  writeNote: (name: string, contents: string) => call<void>("write_note", { name, contents }),
  createNote: (title: string) => call<string>("create_note", { title }),
  // The first-run notes; written only into an untouched notes folder.
  seedNotes: (notes: [string, string][]) => call<string[]>("seed_notes", { notes }),
  renameNote: (name: string, title: string) => call<string>("rename_note", { name, title }),
  recycleNote: (name: string) => call<string>("recycle_note", { name }),
  deleteNote: (name: string) => call<void>("delete_note", { name }),
  listTrash: () => call<NoteInfo[]>("list_trash"),
  restoreNote: (name: string) => call<string>("restore_note", { name }),
  deleteTrash: (name: string) => call<void>("delete_trash", { name }),
  readMeta: (file: MetaFile) => call<string | null>("read_meta", { file }),
  writeMeta: (file: MetaFile, contents: string) => call<void>("write_meta", { file, contents }),
  notesFolderInfo: () => call<NotesFolderInfo>("notes_folder_info"),
  // null: back to the default. Returns the folder now in use, and what copying did.
  setNotesFolder: (path: string | null, copy: boolean) => call<FolderSwitch>("set_notes_folder", { path, copy }),
  importNotes: (paths: string[]) => call<ImportResult>("import_notes", { paths }),
  // A note Windows asked the app to open (File Explorer), once; and its name
  // when it's in the notes folder already.
  takeOpenedNote: () => (inTauri ? invoke<string | null>("take_opened_note") : Promise.resolve(null)),
  noteInFolder: (path: string) => invoke<string | null>("note_in_folder", { path }),
  exportNote: (name: string, destination: string) => call<void>("export_note", { name, destination }),
  exportAll: (destination: string) => call<number>("export_all", { destination }),
  openNotesFolder: () => call<void>("open_notes_folder"),
  saveAsset: (name: string, base64: string) => call<string>("save_asset", { name, base64 }),
  importAsset: (path: string) => call<string>("import_asset", { path }),
  fetchLinkPreview: (url: string) => call<LinkPreview | null>("fetch_link_preview", { url }),
};

// A note's title is its file name. Characters Windows won't allow in file
// names are stored as lookalikes (NAME_LOOKALIKES in notes.rs); show the real ones.
const lookalikes: Record<string, string> = {
  "∕": "/",
  "⧵": "\\",
  "꞉": ":",
  "∗": "*",
  "？": "?",
  "＂": '"',
  "＜": "<",
  "＞": ">",
  "∣": "|",
};
export const titleOf = (name: string) => name.replace(/\.md$/i, "").replace(/[∕⧵꞉∗？＂＜＞∣]/g, (c) => lookalikes[c]);

// Files attached to tasks, copied into Data\Attachments (attachments.rs).
export interface Attached {
  path: string;
  name: string;
  size: number;
}

export async function attachFile(task: string, source: string): Promise<Attached> {
  if (!inTauri) throw new Error("Attachments work in the Project Life app.");
  return invoke<Attached>("attach_file", { task, source });
}

export async function openAttachment(path: string): Promise<void> {
  if (!inTauri) return;
  await invoke("open_attachment", { path });
}

export async function removeAttachment(path: string): Promise<void> {
  if (!inTauri) return;
  await invoke("remove_attachment", { path });
}

// ----- Settings (system.rs) -----

export interface AppFont {
  family: string;
  weight: number;
  italic: boolean;
  path: string;
  folder: string;
}

export interface DataInfo {
  data: string;
  notes: string;
  notesInside: boolean;
  bytes: number;
  defaultBackups: string;
}

export interface CheckpointImport {
  notes: { copied: number; renamed: number; same: number; merged: boolean };
  tasks: string | null;
  from: string;
}

const tauriOnly = <T>(fallback: T, run: () => Promise<T>): Promise<T> => (inTauri ? run() : Promise.resolve(fallback));

export const system = {
  theme: () => tauriOnly<"light" | "dark">(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark", () => invoke("system_theme")),
  osBuild: () => tauriOnly(0, () => invoke<number>("os_build")),
  runningApps: (names: string[]) => tauriOnly<string[]>([], () => invoke("running_apps", { names })),
  // The clipboard's text and HTML, for Paste in the right-click menu.
  readClipboard: () =>
    inTauri ? invoke<{ text: string; html: string }>("read_clipboard") : navigator.clipboard.readText().then((text) => ({ text, html: "" })),
  location: () => (inTauri ? invoke<{ latitude: number; longitude: number }>("current_location") : Promise.reject(new Error("Location works in the Project Life app."))),
  secretGet: (name: string) => tauriOnly<string | null>(null, () => invoke("secret_get", { name })),
  secretSet: (name: string, value: string | null) => tauriOnly(undefined, () => invoke<void>("secret_set", { name, value })),
  systemFonts: () => tauriOnly<string[]>([], () => invoke("list_system_fonts")),
  appFonts: () => tauriOnly<AppFont[]>([], () => invoke("list_app_fonts")),
  googleFont: (family: string) => invoke<string>("download_google_font", { family }),
  removeFont: (folder: string) => invoke<void>("remove_app_font", { folder }),
  dataInfo: () => tauriOnly<DataInfo>({ data: "(browser preview)", notes: "", notesInside: true, bytes: 0, defaultBackups: "" }, () => invoke("data_info")),
  openDataFolder: (sub?: "Logs" | "Backups" | "Fonts") => tauriOnly(undefined, () => invoke<void>("open_data_folder", { sub: sub ?? null })),
  openBackupFolder: (folder: string | null) => tauriOnly(undefined, () => invoke<void>("open_backup_folder", { folder })),
  exportEverything: (target: string) => invoke<void>("export_everything", { target }),
  backupNow: (folder: string | null, keep = 14) => invoke<string>("backup_now", { folder, keep }),
  clearCaches: () => tauriOnly(undefined, () => invoke<void>("clear_caches")),
  deleteAllData: () => invoke<void>("delete_all_data"),
  saveCrash: (text: string) => tauriOnly(undefined, () => invoke<void>("save_crash", { text })),
  importCheckpoint: (folder: string) => invoke<CheckpointImport>("import_checkpoint", { folder }),
};

// ----- Connected accounts (accounts.rs) -----

export type ProviderId = "microsoft" | "google";

export interface AccountInfo {
  id: string;
  provider: ProviderId;
  email: string;
  name: string;
  work: boolean;
}

export interface RemoteCalendar {
  id: string;
  name: string;
  color: string | null;
  canEdit: boolean;
  primary: boolean;
  reminders: number[];
}

export interface RemoteEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  place: string;
  description: string;
  joinUrl: string | null;
  reminders: number[];
  series: string | null;
  link: string | null;
  editable: boolean;
  declined: boolean;
}

export interface RemoteEventInput {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  place: string;
  description: string;
  reminders: number[];
  meeting: boolean;
}

const needsApp = () => Promise.reject(new Error("Connected accounts work in the Project Life app."));

export const accountsApi = {
  available: () => tauriOnly<Record<ProviderId, boolean>>({ microsoft: false, google: false }, () => invoke("accounts_available")),
  connect: (provider: ProviderId) => (inTauri ? invoke<AccountInfo>("account_connect", { provider }) : needsApp()),
  allowMeetings: (account: string, email: string) => invoke<void>("account_allow_meetings", { account, email }),
  disconnect: (account: string) => tauriOnly(undefined, () => invoke<void>("account_disconnect", { account })),
  calendars: (account: string) => invoke<RemoteCalendar[]>("account_calendars", { account }),
  events: (account: string, calendar: string, from: string, to: string, zone: string, writable: boolean, defaults: number[]) =>
    invoke<RemoteEvent[]>("account_events", { account, calendar, from, to, zone, writable, defaults }),
  saveEvent: (account: string, calendar: string, id: string | null, event: RemoteEventInput, zone: string) => invoke<RemoteEvent>("account_save_event", { account, calendar, id, event, zone }),
  deleteEvent: (account: string, calendar: string, id: string) => invoke<void>("account_delete_event", { account, calendar, id }),
  meeting: (account: string, title: string, start: string, end: string) => invoke<string>("account_meeting", { account, title, start, end }),
};

// ----- Updates (update.rs) -----

export interface Release {
  version: string;
  name: string;
  notes: string;
  page: string;
  download: string;
  prerelease: boolean;
  published: string;
}

export const updatesApi = {
  check: (beta: boolean) => (inTauri ? invoke<Release | null>("update_check", { beta }) : Promise.resolve(null)),
  download: (download: string) => invoke<void>("update_download", { download }),
  install: () => invoke<void>("update_install"),
  ready: () => tauriOnly(false, () => invoke<boolean>("update_ready")),
};
