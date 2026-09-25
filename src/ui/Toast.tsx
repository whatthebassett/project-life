import { useSyncExternalStore } from "react";

// A short message at the bottom of the window, with Undo when the change can
// be taken back ("Moved “Pay rent” to the Recycle Bin · Undo"). One at a
// time; a new one replaces the last. Screen readers hear it as it appears.
interface ToastState {
  key: number;
  message: string;
  undo?: () => void;
  // The button's label: Undo, or something else ("Show").
  label: string;
}

const UNDO_MS = 6000;
let current: ToastState | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, undo?: () => void, label = "Undo") {
  if (timer) clearTimeout(timer);
  current = { key: Date.now(), message, undo, label };
  emit();
  timer = setTimeout(dismiss, UNDO_MS);
}

function dismiss() {
  current = null;
  emit();
}

export function Toaster() {
  const t = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => current,
  );
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center">
      {t && (
        <div key={t.key} className="pl-toast pointer-events-auto flex h-12 items-center gap-3 rounded-[14px] border border-line bg-panel pr-2 pl-4 text-13 text-text shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
          <span className="max-w-[520px] truncate">{t.message}</span>
          {t.undo && (
            <button
              className="h-8 rounded-[9px] px-3 text-13 font-semibold text-accent hover:bg-panel2"
              onClick={() => {
                t.undo!();
                dismiss();
              }}
            >
              {t.label}
            </button>
          )}
          <button aria-label="Dismiss" className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel2 hover:text-text" onClick={dismiss}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
