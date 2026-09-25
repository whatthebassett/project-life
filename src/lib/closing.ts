// Work that must finish before the window closes (the note being typed, the
// task list, stats). The title bar's close button runs it all, then closes.
const steps = new Set<() => Promise<void>>();

export function beforeClose(step: () => Promise<void>): () => void {
  steps.add(step);
  return () => void steps.delete(step);
}

// Each step on its own: one failed save (a locked file) mustn't keep the
// window open.
export async function runBeforeClose() {
  for (const step of steps) await step().catch((e) => console.error("While closing:", e));
}
