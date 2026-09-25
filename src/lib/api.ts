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
