import { useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { Columns2, List, ListOrdered, ListTree, TextAlignStart, WrapText, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { setTocAttrs, tocAttrs, type TocAttrs, type TocLayout, type TocMarkers } from "../editor/toc";

interface Props {
  editor: Editor | null;
  // The contents block being changed, by where it was when its Edit button
  // was pressed; null while the panel is shut.
  target: { pos: number } | null;
  // Where that block is now, kept for VisualEditor too: it moves as the note
  // above it changes. null while the panel is shut.
  at: RefObject<number | null>;
  onClose: () => void;
}

const layouts: Choice<TocLayout>[] = [
  { value: "list", label: "List", icon: ListTree, hint: "One heading to a line, with the headings under it stepped in." },
  { value: "columns", label: "Columns", icon: Columns2, hint: "The list in two columns, for a note with a lot of headings." },
  { value: "inline", label: "Inline", icon: WrapText, hint: "Every heading on one row, wrapping like a line of text." },
];

const markers: Choice<TocMarkers>[] = [
  { value: "none", label: "None", icon: TextAlignStart, hint: "Just the headings." },
  { value: "bullets", label: "Bullets", icon: List, hint: "A bullet in front of each heading." },
  { value: "numbers", label: "Numbers", icon: ListOrdered, hint: "Numbered in order, with the headings under each one as 1.1, 1.2 and so on." },
];

// How a table of contents looks: its layout, and bullets or numbers on its
// lines. It sits beside the note (VisualEditor slides it in from the right)
// and changes the block as you pick, so you see each choice in the note.
export default function TocPanel({ editor, target, at, onClose }: Props) {
  const [look, setLook] = useState<TocAttrs>(() => tocAttrs(null));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const dismiss = () => {
    onCloseRef.current();
    editor?.commands.focus(undefined, { scrollIntoView: false });
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    if (!editor || !target) return;
    at.current = target.pos;
    // The block's look, or shut the panel once the block is gone.
    const read = () => {
      const node = at.current === null ? null : editor.state.doc.nodeAt(at.current);
      if (node?.type.name === "tableOfContents") setLook(tocAttrs(node.attrs));
      else {
        at.current = null;
        onCloseRef.current();
      }
    };
    read();
    const follow = ({ transaction }: { transaction: { docChanged: boolean; mapping: { map: (pos: number, assoc?: number) => number } } }) => {
      if (at.current === null || !transaction.docChanged) return;
      at.current = transaction.mapping.map(at.current, 1);
      read();
    };
    // Escape shuts it, unless something in front (a menu, a dialog) took the key.
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) dismissRef.current();
    };
    editor.on("transaction", follow);
    document.addEventListener("keydown", key);
    return () => {
      at.current = null;
      editor.off("transaction", follow);
      document.removeEventListener("keydown", key);
    };
  }, [editor, target, at]);

  const set = (patch: Partial<TocAttrs>) => {
    if (editor && at.current !== null) setTocAttrs(editor.view, at.current, patch);
  };

  return (
    <aside className="flex h-full flex-col text-13" aria-label="Table of contents">
      <div className="flex h-14 shrink-0 items-center justify-between pr-3 pl-5">
        <span className="text-15 font-semibold">Table of contents</span>
        <button className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel hover:text-text" aria-label="Close" title="Close (Esc)" onClick={dismiss}>
          <X size={15} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
        <Choices label="Layout" value={look.layout} options={layouts} onChange={(layout) => set({ layout })} />
        <Choices label="Bullets and numbering" value={look.markers} options={markers} onChange={(markers) => set({ markers })} />
      </div>
    </aside>
  );
}

interface Choice<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
  hint: string;
}

// A row of tiles to pick one from, with a line on what the picked one does.
function Choices<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-6">
      <div className="mb-2 font-mono text-11 tracking-[0.12em] text-muted uppercase">{label}</div>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={o.value === value}
            className={clsx(
              "flex flex-col items-center gap-1.5 rounded-[12px] border px-1 py-2.5 text-12 font-medium transition-colors",
              o.value === value ? "border-accent bg-accent-soft text-text" : "border-line bg-panel text-muted hover:text-text",
            )}
            onClick={() => onChange(o.value)}
          >
            <o.icon size={18} />
            {o.label}
          </button>
        ))}
      </div>
      <p className="m-0 mt-2 text-12 leading-[1.5] text-muted">{options.find((o) => o.value === value)?.hint}</p>
    </div>
  );
}
