// Spell check (Settings → General → Spell check), with Windows' own spell
// checker (src-tauri/src/spell.rs). Notes underline misspellings themselves
// (editor/spellcheck.ts); everywhere else the browser's underline shows, and
// right-clicking a word anywhere offers Windows' suggestions
// (components/AppMenu.tsx). In a browser preview there's no Windows checker,
// so the browser's own spell check does it all.
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./api";

type Found = [number, number][];

// A stand-in checker for trying things out in a browser preview while
// developing (window.__spellBackend); never in a build.
interface Backend {
  check: (texts: string[]) => Promise<Found[]>;
  suggest: (word: string) => Promise<string[]>;
}
function stand(): Backend | null {
  return import.meta.env.DEV ? ((window as unknown as { __spellBackend?: Backend }).__spellBackend ?? null) : null;
}

export const spellAvailable = () => inTauri || Boolean(stand());

let on = true;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

// Spell check is on (the setting), and there's a checker to ask.
export const spellOn = () => on && spellAvailable();

export function setSpellOn(value: boolean) {
  if (value === on) return;
  on = value;
  changed();
}

// Spell check turned on or off, or the dictionary changed (a word added or
// ignored), so what's underlined may be different now.
export function onSpellChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Each text's misspellings: [start, length] in the string's own indexes.
export function checkSpelling(texts: string[]): Promise<Found[]> {
  const s = stand();
  if (s) return s.check(texts);
  if (!inTauri || !texts.length) return Promise.resolve(texts.map(() => []));
  return invoke<Found[]>("spell_check", { texts }).catch(() => texts.map(() => []));
}

export function suggestSpelling(word: string): Promise<string[]> {
  const s = stand();
  if (s) return s.suggest(word);
  if (!inTauri) return Promise.resolve([]);
  return invoke<string[]>("spell_suggest", { word }).catch(() => []);
}

export async function addToDictionary(word: string) {
  if (inTauri) await invoke("spell_add", { word }).catch(() => undefined);
  changed();
}

export async function ignoreSpelling(word: string) {
  if (inTauri) await invoke("spell_ignore", { word }).catch(() => undefined);
  changed();
}

// The word around `at` in `text` (letters, marks, and apostrophes inside it).
export function wordAround(text: string, at: number): { start: number; end: number } | null {
  const letter = /[\p{L}\p{M}'’]/u;
  let start = at;
  let end = at;
  while (start > 0 && letter.test(text[start - 1])) start--;
  while (end < text.length && letter.test(text[end])) end++;
  while (start < end && /['’]/.test(text[start])) start++;
  while (end > start && /['’]/.test(text[end - 1])) end--;
  return end > start ? { start, end } : null;
}

// Whether a single word is misspelled.
export async function misspelled(word: string): Promise<boolean> {
  if (!spellOn() || !word.trim()) return false;
  const [found] = await checkSpelling([word]);
  return Boolean(found?.length);
}
