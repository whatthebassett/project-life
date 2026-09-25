import { invoke, isTauri } from "@tauri-apps/api/core";

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
export type DataFile = "tasks.json" | "events.json" | "habits.json" | "goals.json";

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
