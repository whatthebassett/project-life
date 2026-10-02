import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Book, Clock, CornerDownLeft, FileText, Search } from "lucide-react";
import clsx from "clsx";
import { titleOf, type NoteInfo } from "../lib/api";
import { lookup, parentOf, type Notebook } from "../lib/notebook";
import { ago } from "../home/time";
import { zoomOut } from "../lib/motion";

interface Props {
  notes: NoteInfo[];
  notebook: Notebook;
  // Opening into a new tab, or in place of the current one.
  newTab: boolean;
  onPick: (name: string) => void;
  onClose: () => void;
}

const LIMIT = 8;

// How well a title matches: the start of the title, then the start of a
// word, then anywhere. -1 is no match.
function score(title: string, q: string): number {
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) return 2;
  return t.includes(q) ? 1 : -1;
}

// Picking a note to link (from a task, event or goal): a search bar and
// nothing else. Typing shows the notes that match; ↓ on an empty bar shows the ones
// edited most recently. Enter opens, Escape closes.
export default function NotePicker({ notes, notebook, newTab, onPick, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState(false);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const now = useMemo(() => Date.now(), []);

  // Zooms back out as it closes, like every other modal.
  useLayoutEffect(() => {
    const el = overlay.current;
    return () => zoomOut(el);
  }, []);
  const q = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (q)
      return notes
        .map((note) => ({ note, rank: score(titleOf(note.name), q) }))
        .filter((r) => r.rank >= 0)
        .sort((a, b) => b.rank - a.rank || b.note.modified - a.note.modified)
        .slice(0, 50)
        .map((r) => r.note);
    if (recent) return [...notes].sort((a, b) => b.modified - a.modified).slice(0, LIMIT);
    return [];
  }, [notes, q, recent]);

  useEffect(() => setIndex(0), [q, recent]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index, results]);

  // Escape closes, before anything behind it sees the key.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!q && !recent) setRecent(true);
      else setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      // Up from the first recent note folds the list away again.
      if (!q && recent && index === 0) setRecent(false);
      else setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[index]) {
      e.preventDefault();
      onPick(results[index].name);
    }
  };

  const showList = results.length > 0 || q !== "";

  return createPortal(
    <div ref={overlay} className="picker-backdrop fixed inset-0 z-40 flex justify-center px-6 pt-[14vh]" onMouseDown={onClose}>
      <div
        data-modal-panel
        className="picker-panel picker-glass flex h-fit max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3.5 px-6 py-5">
          <Search size={20} className="shrink-0 text-muted" />
          <input
            autoFocus
            aria-label={newTab ? "Open a note in a new tab" : "Switch to a note"}
            className="min-w-0 flex-1 bg-transparent text-[18px] outline-none placeholder:text-muted"
            style={{ caretColor: "auto" }}
            placeholder={newTab ? "Open a note in a new tab…" : "Jump to a note…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          {!showList && (
            <span className="hidden shrink-0 items-center gap-1 text-[11.5px] text-muted sm:flex">
              <kbd className="slash-key">↓</kbd> recent
            </span>
          )}
        </div>

        {showList && (
          <div className="picker-divider flex min-h-0 flex-col border-t">
            <div className="flex items-center gap-1.5 px-6 pt-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
              {q ? (
                <>
                  Notes <span className="font-normal normal-case tracking-normal">· {results.length === 50 ? "50+" : results.length}</span>
                </>
              ) : (
                <>
                  <Clock size={11} /> Recently edited
                </>
              )}
            </div>
            <div ref={list} className="min-h-0 overflow-y-auto px-3 pb-3">
              {results.map((note, i) => {
                const title = titleOf(note.name);
                const parent = parentOf(notebook, note.name);
                const hasPages = Object.entries(notebook.pages.Parents).some(([, p]) => p.toLowerCase() === note.name.toLowerCase());
                const tags = (lookup(notebook.tags.Notes, note.name) ?? [])
                  .map((id) => notebook.tags.Tags.find((t) => t.Id === id))
                  .filter((t): t is NonNullable<typeof t> => Boolean(t));
                const Icon = hasPages ? Book : FileText;
                const active = i === index;
                return (
                  <div
                    key={note.name}
                    data-index={i}
                    style={{ "--row": i } as React.CSSProperties}
                    className={clsx("picker-row menu-drop-row flex cursor-default items-center gap-3.5 rounded-xl px-3 py-2.5", active && "is-active")}
                    onMouseMove={() => i !== index && setIndex(i)}
                    onClick={() => onPick(note.name)}
                  >
                    <span className="picker-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border">
                      <Icon size={17} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="picker-title block truncate text-[14px] font-medium">
                        <Highlight text={title} query={q} />
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-muted">
                        {parent && <span className="truncate">in {titleOf(parent)}</span>}
                        {parent && note.modified > 0 && <span>·</span>}
                        {note.modified > 0 && <span className="shrink-0">edited {ago(note.modified, now)}</span>}
                        {tags.map((t) => (
                          <span key={t.Id} className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: t.Color }} title={t.Name} />
                        ))}
                      </span>
                    </span>
                    {active && (
                      <span className="picker-enter flex shrink-0 items-center gap-1 text-[11px]">
                        {newTab ? "Open in new tab" : "Open"} <CornerDownLeft size={12} />
                      </span>
                    )}
                  </div>
                );
              })}
              {q && results.length === 0 && (
                <div className="flex flex-col items-center gap-1 py-8 text-center text-muted">
                  <Search size={20} />
                  <span>No notes match “{query.trim()}”</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The matched part of a title, picked out in the accent.
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="picker-mark">{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </>
  );
}
