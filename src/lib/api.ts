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

export async function defaultName(): Promise<string> {
  if (!inTauri) return "";
  return invoke<string>("default_name");
}
