// Opening the command palette (Ctrl+K, or Home's capture box) from anywhere.
// App.tsx listens and draws it.
export type PaletteMode = "task" | "note" | "event";

export interface PaletteRequest {
  mode?: PaletteMode;
  text?: string;
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
