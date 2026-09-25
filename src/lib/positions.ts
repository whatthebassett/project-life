// Where you were in each note: the cursor and how far down the page, for the
// Visual and Markdown editors separately (their positions count differently).
// Opening a note, or reloading Checkpoint, puts you back there.
//
// It's a convenience for this PC, so it lives in the webview's own storage
// rather than beside the notes; if that storage is unavailable, notes simply
// open at the top.

export type EditorMode = "visual" | "markdown";
export interface EditorSpot {
  anchor: number;
  head: number;
  scroll: number;
}
type Entry = Partial<Record<EditorMode, EditorSpot>> & { at: number };

const KEY = "project-life:positions";
// Enough for every note anyone keeps open, without growing forever.
const LIMIT = 300;

let spots: Record<string, Entry> | null = null;
let timer: number | undefined;

function all(): Record<string, Entry> {
  if (spots) return spots;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    spots = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    spots = {};
  }
  return spots!;
}

const keyOf = (name: string) => name.toLowerCase();

export function spotFor(name: string | null, mode: EditorMode): EditorSpot | undefined {
  if (!name) return undefined;
  const spot = all()[keyOf(name)]?.[mode];
  return spot && Number.isFinite(spot.anchor) && Number.isFinite(spot.head) && Number.isFinite(spot.scroll) ? spot : undefined;
}

export function rememberSpot(name: string, mode: EditorMode, spot: EditorSpot) {
  const map = all();
  map[keyOf(name)] = { ...map[keyOf(name)], [mode]: spot, at: Date.now() };
  window.clearTimeout(timer);
  timer = window.setTimeout(flushSpots, 400);
}

export function renameSpot(from: string, to: string) {
  const map = all();
  const entry = map[keyOf(from)];
  if (!entry) return;
  delete map[keyOf(from)];
  map[keyOf(to)] = entry;
  flushSpots();
}

export function forgetSpot(name: string) {
  const map = all();
  if (!map[keyOf(name)]) return;
  delete map[keyOf(name)];
  flushSpots();
}

export function flushSpots() {
  window.clearTimeout(timer);
  if (!spots) return;
  const entries = Object.entries(spots);
  if (entries.length > LIMIT) spots = Object.fromEntries(entries.sort((a, b) => b[1].at - a[1].at).slice(0, LIMIT));
  try {
    localStorage.setItem(KEY, JSON.stringify(spots));
  } catch {
    // Storage full or blocked: positions just aren't kept this time.
  }
}

// Home or a note, for a reload of this window. A fresh start of Checkpoint
// follows Settings (Show Home when Checkpoint starts) instead.
const VIEW = "project-life:view";

export function rememberView(home: boolean) {
  try {
    sessionStorage.setItem(VIEW, home ? "home" : "note");
  } catch {
    // Not kept; a reload follows Settings.
  }
}

export function viewBeforeReload(): "home" | "note" | null {
  try {
    const view = sessionStorage.getItem(VIEW);
    return view === "home" || view === "note" ? view : null;
  } catch {
    return null;
  }
}
