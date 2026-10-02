// Opening the command palette (Ctrl+T, Home's capture box, or the + beside
// the note tabs) from anywhere.
// App.tsx listens and draws it.
export type PaletteMode = "task" | "note" | "event";

export interface PaletteRequest {
  mode?: PaletteMode;
  text?: string;
  // Enter opens a note in a new tab (and Ctrl+Enter in place), not the other way round.
  newTab?: boolean;
}

let listener: ((req: PaletteRequest) => void) | null = null;

export function openPalette(req: PaletteRequest = {}) {
  listener?.(req);
}

export function onOpenPalette(l: (req: PaletteRequest) => void): () => void {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}
