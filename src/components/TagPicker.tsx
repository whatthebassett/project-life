import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Check, Plus, Search, Settings2 } from "lucide-react";
import type { Tag } from "../lib/notebook";

interface Props {
  // What it opens under (the tag chip or Add tag that was clicked).
  anchor: DOMRect;
  tags: Tag[];
  // The note's tags.
  chosen: string[];
  onChange: (ids: string[]) => void;
  // Makes a tag with this name and puts it on the note.
  onCreate: (name: string) => void;
  onManage: () => void;
  onClose: () => void;
}

const WIDTH = 280;

// Tags for one note, from the tag row under its title: type to find one or
// name a new one; a click (or Enter) puts a tag on or takes it off, and the
// picker stays open for the next. Esc or a click outside closes it.
export default function TagPicker({ anchor, tags, chosen, onChange, onCreate, onManage, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.bottom + 6);

  const q = query.trim().replace(/\s+/g, " ");
  const shown = q ? tags.filter((t) => t.Name.toLowerCase().includes(q.toLowerCase())) : tags;
  const canCreate = q.length > 0 && q.length <= 40 && !tags.some((t) => t.Name.toLowerCase() === q.toLowerCase());
  const count = shown.length + (canCreate ? 1 : 0);
  const at = Math.min(index, Math.max(count - 1, 0));

  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((i) => i !== id) : [...chosen, id]);
  const create = () => {
    onCreate(q);
    setQuery("");
  };
  const choose = (i: number) => (i < shown.length ? toggle(shown[i].Id) : canCreate && create());

  useEffect(() => setIndex(0), [query]);

  // A click anywhere else, or the window losing focus, closes it.
  useEffect(() => {
    // (The tag row's own chips toggle it themselves.)
    const down = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!box.current?.contains(target) && !target.closest?.("[data-tag-anchor]")) onClose();
    };
    document.addEventListener("mousedown", down, true);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Above the chip when there's no room below.
  useLayoutEffect(() => {
    const h = box.current?.offsetHeight ?? 0;
    setTop(anchor.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, anchor.top - 6 - h) : anchor.bottom + 6);
  }, [anchor, count]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (count) setIndex((at + (e.key === "ArrowDown" ? 1 : -1) + count) % count);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(at);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return createPortal(
    <div
      ref={box}
      data-menu
      role="dialog"
      aria-label="Tags for this note"
      className="fixed z-[55] flex flex-col overflow-hidden rounded-[14px] border border-line text-13 text-text shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      style={{
        width: WIDTH,
        left: Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8)),
        top,
        background: "var(--menu)",
        animation: "pl-zoom-in 140ms cubic-bezier(0.2, 0, 0, 1)",
        transformOrigin: "top left",
      }}
    >
      <label className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3 text-muted">
        <Search size={14} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          maxLength={40}
          placeholder={tags.length ? "Find or make a tag" : "Name your first tag"}
          aria-label="Find or make a tag"
          className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text outline-none placeholder:text-muted"
        />
      </label>
      <div role="listbox" aria-label="Tags" aria-multiselectable="true" className="flex max-h-[260px] flex-col overflow-y-auto p-1.5">
        {shown.map((t, i) => {
          const on = chosen.includes(t.Id);
          return (
            <button
              key={t.Id}
              type="button"
              role="option"
              aria-selected={on}
              tabIndex={-1}
              onMouseMove={() => i !== at && setIndex(i)}
              onClick={() => toggle(t.Id)}
              className={clsx("flex h-9 shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-left", i === at && "bg-panel2")}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.Color }} />
              <span className="min-w-0 flex-1 truncate">{t.Name}</span>
              <span
                className={clsx("flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] border transition-colors", on ? "border-accent bg-accent text-accent-ink" : "border-line")}
              >
                {on && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {canCreate && (
          <button
            type="button"
            tabIndex={-1}
            onMouseMove={() => at !== shown.length && setIndex(shown.length)}
            onClick={create}
            className={clsx("flex h-9 shrink-0 items-center gap-2.5 rounded-[9px] px-2.5 text-left", at === shown.length && "bg-panel2")}
          >
            <Plus size={14} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">
              Make tag <span className="font-semibold">“{q}”</span>
            </span>
          </button>
        )}
        {count === 0 && <p className="m-0 px-2.5 py-2 text-muted">{tags.length ? "No tag matches." : "No tags yet. Type a name to make one."}</p>}
      </div>
      <button
        type="button"
        onClick={onManage}
        className="flex h-10 shrink-0 items-center gap-2 border-t border-line px-3.5 text-12 text-muted transition-colors hover:bg-panel2 hover:text-text"
      >
        <Settings2 size={14} /> Manage tags…
      </button>
    </div>,
    document.body,
  );
}
