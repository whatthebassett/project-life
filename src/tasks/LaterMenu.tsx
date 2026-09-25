import { useEffect, useRef, useState } from "react";
import { applyLater, laterChoices } from "./actions";
import type { Task } from "./model";

// "Do it later" (Tasks.dc.html): a menu under the Later button. Arrow keys
// move, Enter picks, Esc or a click elsewhere closes it.
export default function LaterMenu({ task, onClose, className }: { task: Task; onClose: (picked: boolean) => void; className?: string }) {
  const choices = laterChoices(task, new Date());
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    box.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node) && !(e.target as Element).closest?.("[data-later-button]")) close.current(false);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  const pick = (i: number) => {
    applyLater(task, choices[i]);
    onClose(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const move = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (move) {
      const next = (at + move + choices.length) % choices.length;
      setAt(next);
      box.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    } else if (e.key === "Escape") onClose(false);
    else if (e.key === "Tab") onClose(false);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      ref={box}
      role="menu"
      aria-label="Do it later"
      onKeyDown={onKey}
      onClick={(e) => e.stopPropagation()}
      className={className ?? "absolute top-[calc(100%+6px)] right-2 z-10 flex w-[280px] flex-col gap-0.5 rounded-[16px] border border-line bg-panel p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"}
    >
      {choices.map((c, i) => (
        <button
          key={c.id}
          role="menuitem"
          tabIndex={i === at ? 0 : -1}
          onMouseEnter={() => setAt(i)}
          onFocus={() => setAt(i)}
          onClick={() => pick(i)}
          className={`flex h-10 items-center justify-between gap-2.5 rounded-[10px] px-3 text-left text-13 outline-none ${i === at ? "bg-accent-soft" : ""}`}
        >
          <span className="font-medium">{c.label}</span>
          <span className="font-mono text-11 text-muted">{c.hint}</span>
        </button>
      ))}
    </div>
  );
}
