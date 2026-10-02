import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import clsx from "clsx";

// The "i" at the end of the format bar (Notes, and a task's description):
// pointing at it, or tabbing to it, shows how the / menu adds blocks.
const SHOW_MS = 150;
const WIDTH = 300;

const blocks = ["Headings", "Lists", "To-dos", "Tables", "Callouts", "Code", "Quotes", "Dividers", "Pictures", "Emoji", "Dates"];

function Key({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[6px] border border-line border-b-2 bg-panel2 px-1.5 font-mono text-11 text-text">{children}</kbd>;
}

export default function BlocksHint({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const timer = useRef(0);
  const id = useId();

  const show = (delay: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Esc, a scroll or the window losing focus puts it away.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", key, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, [open]);

  // Under the button, its right edge lined up with the button's; inside the window.
  useLayoutEffect(() => {
    const r = button.current?.getBoundingClientRect();
    if (!open || !r) return setPos(null);
    setPos({ left: Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8)), top: r.bottom + 6 });
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="How to add blocks"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => show(SHOW_MS)}
        onMouseLeave={hide}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(0)}
        onBlur={hide}
        // A click keeps the cursor where it was in the note.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? hide() : show(0))}
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-panel2 hover:text-text",
          open && "bg-panel2 text-text",
          className,
        )}
      >
        <Info size={16} />
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            className="pointer-events-none fixed z-[60] flex flex-col gap-3 rounded-[14px] border border-line p-4 text-13 leading-[1.45] text-text shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
            style={{
              width: WIDTH,
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              background: "var(--menu)",
              animation: "pl-zoom-in 140ms cubic-bezier(0.2, 0, 0, 1)",
              transformOrigin: "top right",
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="font-semibold">Add a block</div>
              <div className="text-muted">
                Type <Key>/</Key> at the start of a line, or after a space, and pick from the menu that opens.
              </div>
            </div>
            <ol className="flex flex-col gap-2 border-t border-line pt-3">
              <li className="flex items-center gap-2.5">
                <Key>/</Key>
                <span className="text-muted">opens the block menu</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Key>/table</Key>
                <span className="text-muted">keep typing to narrow it down</span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex gap-1">
                  <Key>↑</Key>
                  <Key>↓</Key>
                  <Key>Enter</Key>
                </span>
                <span className="text-muted">pick one and add it</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Key>Esc</Key>
                <span className="text-muted">closes the menu</span>
              </li>
            </ol>
            <div className="flex flex-wrap gap-1.5 border-t border-line pt-3">
              {blocks.map((b) => (
                <span key={b} className="rounded-[7px] bg-accent-soft px-2 py-0.5 text-11 font-medium text-accent">
                  {b}
                </span>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
