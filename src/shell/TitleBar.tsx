import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, LayoutGrid, Minus, Pin, Square, X } from "lucide-react";
import { menuPoint } from "../components/ContextMenu";
import { inTauri } from "../lib/api";
import { runBeforeClose } from "../lib/closing";
import { useNotes } from "../notes/NotesContext";
import { eventStore } from "../schedule/useEvents";
import { goalStore } from "../goals/useGoals";
import { habitStore } from "../habits/useHabits";
import { taskStore } from "../tasks/useTasks";

interface Props {
  title: string;
  // Development builds get a button to the component gallery.
  onGallery?: () => void;
  galleryOpen?: boolean;
}

// The window draws its own 32px title bar in the theme's colors: the app and
// screen name on the left, window controls on the right. Empty space drags
// the window; double-clicking it maximizes, and right-clicking it gives the
// window's own menu.
export default function TitleBar({ title, onGallery, galleryOpen }: Props) {
  const [maximized, setMaximized] = useState(false);
  const { openMenu } = useNotes();

  useEffect(() => {
    if (!inTauri) return;
    const win = getCurrentWindow();
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => void unlisten.then((f) => f());
  }, []);

  const win = () => getCurrentWindow();
  // Everything waiting to be saved goes to disk first.
  const close = () => void Promise.all([taskStore().flush(), eventStore().flush(), habitStore().flush(), goalStore().flush(), runBeforeClose()]).finally(() => win().close());

  const windowMenu = async (e: React.MouseEvent<HTMLElement>) => {
    if (!inTauri || (e.target as Element).closest("button")) return;
    e.preventDefault();
    const { x, y } = menuPoint(e);
    const onTop = await win().isAlwaysOnTop().catch(() => false);
    openMenu(x, y, [
      { label: "Minimize", icon: <Minus size={13} />, onSelect: () => void win().minimize() },
      maximized
        ? { label: "Restore", icon: <Copy size={13} className="-scale-x-100" />, onSelect: () => void win().toggleMaximize() }
        : { label: "Maximize", icon: <Square size={13} />, onSelect: () => void win().toggleMaximize() },
      { label: "Always on top", icon: <Pin size={13} />, checked: onTop, onSelect: () => void win().setAlwaysOnTop(!onTop) },
      { type: "separator" },
      { label: "Close", icon: <X size={13} />, onSelect: close },
    ]);
  };

  return (
    <header data-tauri-drag-region onContextMenu={(e) => void windowMenu(e)} className="flex h-8 shrink-0 items-stretch border-b border-line bg-side">
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2 pl-4 text-12 text-muted">
        <span className="pointer-events-none truncate">{title}</span>
        {onGallery && (
          <button
            type="button"
            onClick={onGallery}
            aria-pressed={galleryOpen}
            title="Component gallery (development builds only)"
            className={clsx(
              "ml-2 flex h-6 items-center gap-1.5 rounded-[7px] border border-dashed px-2 text-11 transition-colors",
              galleryOpen ? "border-accent text-accent" : "border-line hover:text-text",
            )}
          >
            <LayoutGrid size={12} />
            Components
          </button>
        )}
      </div>
      <div data-tauri-drag-region className="flex-1" />
      <div className="flex items-stretch">
        <WinButton title="Minimize" onClick={() => inTauri && void win().minimize()}>
          <Minus size={16} />
        </WinButton>
        <WinButton title={maximized ? "Restore" : "Maximize"} onClick={() => inTauri && void win().toggleMaximize()}>
          {maximized ? <Copy size={13} className="-scale-x-100" /> : <Square size={13} />}
        </WinButton>
        <WinButton title="Close" close onClick={() => inTauri && close()}>
          <X size={17} />
        </WinButton>
      </div>
    </header>
  );
}

function WinButton({ title, close, onClick, children }: { title: string; close?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={title}
      title={title}
      onClick={onClick}
      className={clsx(
        "flex w-[46px] items-center justify-center text-muted transition-colors duration-100",
        close ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-panel2 hover:text-text",
      )}
    >
      {children}
    </button>
  );
}
