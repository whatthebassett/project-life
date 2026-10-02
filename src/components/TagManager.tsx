import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Check, FileText, Plus, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { titleOf, type NoteInfo } from "../lib/api";
import { lookup, newTagId, tagPresets, type Notebook, type Tag } from "../lib/notebook";
import { Button } from "../ui/Button";
import { SectionLabel } from "../ui/bits";
import { Popup, PopupBody, PopupHeader } from "../ui/Popup";

interface Props {
  notebook: Notebook;
  notes: NoteInfo[];
  onSave: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  onOpen: (name: string) => void;
  onClose: () => void;
}

const validColor = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
const cleanName = (s: string) => s.trim().replace(/\s+/g, " ");

// A tag's color as a soft chip: tinted fill, the color itself for the text.
export function tagChipStyle(color: string): React.CSSProperties {
  return {
    color: `color-mix(in srgb, ${color} 78%, var(--text))`,
    background: `color-mix(in srgb, ${color} 16%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent)`,
  };
}

// Notes → Manage tags: every tag on the left, with how many notes use it;
// the one picked (or a new one) on the right, to rename, recolor or delete,
// with the notes that have it. Changes save as they're made.
export default function TagManager({ notebook, notes, onSave, onDelete, onOpen, onClose }: Props) {
  const tags = notebook.tags.Tags;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | "new" | null>(tags[0]?.Id ?? "new");

  // Which notes have each tag (only notes that still exist).
  const tagged = useMemo(() => {
    const map = new Map<string, NoteInfo[]>();
    for (const note of notes) for (const id of lookup(notebook.tags.Notes, note.name) ?? []) map.set(id, [...(map.get(id) ?? []), note]);
    for (const list of map.values()) list.sort((a, b) => b.modified - a.modified);
    return map;
  }, [notes, notebook.tags.Notes]);

  // A deleted tag hands the pane to the next one.
  useEffect(() => {
    if (picked !== "new" && !tags.some((t) => t.Id === picked)) setPicked(tags[0]?.Id ?? "new");
  }, [tags, picked]);

  const q = query.trim().toLowerCase();
  const shown = q ? tags.filter((t) => t.Name.toLowerCase().includes(q)) : tags;
  const current = picked === "new" ? null : (tags.find((t) => t.Id === picked) ?? null);
  const taggedCount = new Set([...tagged.values()].flat().map((n) => n.name)).size;

  return (
    <Popup onClose={onClose} width={880} height={620} label="Manage tags">
      <PopupHeader tag="TAGS" onClose={onClose}>
        Color-code your notes, then filter the notebook by tag.
      </PopupHeader>
      <PopupBody>
        <aside className="flex w-[300px] shrink-0 flex-col gap-3 border-r border-line bg-side px-4 py-5">
          <div className="flex gap-2">
            <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-line bg-panel px-3 text-muted focus-within:border-accent">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a tag"
                aria-label="Find a tag"
                className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text outline-none"
              />
            </label>
            <button
              type="button"
              aria-label="New tag"
              title="New tag"
              onClick={() => setPicked("new")}
              className={clsx(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-colors",
                picked === "new" ? "bg-accent text-accent-ink" : "border border-line bg-panel text-muted hover:text-text",
              )}
            >
              <Plus size={17} />
            </button>
          </div>

          <div role="listbox" aria-label="Tags" className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
            {shown.map((t) => {
              const count = tagged.get(t.Id)?.length ?? 0;
              const on = t.Id === picked;
              return (
                <button
                  key={t.Id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => setPicked(t.Id)}
                  className={clsx(
                    "flex min-h-12 items-center gap-3 rounded-[12px] px-2.5 text-left transition-colors",
                    on ? "bg-panel shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-panel/60",
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={tagChipStyle(t.Color)}>
                    <TagIcon size={14} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={clsx("truncate text-14", on && "font-semibold")}>{t.Name}</span>
                    <span className="text-11 text-muted">{count === 0 ? "No notes" : `${count} ${count === 1 ? "note" : "notes"}`}</span>
                  </span>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.Color }} />
                </button>
              );
            })}
            {tags.length === 0 && <p className="m-0 px-2 py-3 text-13 leading-[1.5] text-muted">No tags yet. Make one with the + above.</p>}
            {tags.length > 0 && shown.length === 0 && <p className="m-0 px-2 py-3 text-13 text-muted">No tag matches “{query.trim()}”.</p>}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6">
          <TagEditor
            key={current?.Id ?? "new"}
            tag={current}
            existing={tags}
            notes={current ? (tagged.get(current.Id) ?? []) : []}
            onSave={(t) => {
              onSave(t);
              setPicked(t.Id);
            }}
            onDelete={onDelete}
            onOpen={onOpen}
          />
        </div>
      </PopupBody>
      <footer className="flex h-[60px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6">
        <span className="min-w-0 truncate text-13 text-muted">
          {tags.length} {tags.length === 1 ? "tag" : "tags"} · {taggedCount} tagged {taggedCount === 1 ? "note" : "notes"} · Deleting a tag never deletes notes
        </span>
        <Button size="md" variant="primary" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Popup>
  );
}

interface EditorProps {
  // Null for a new one.
  tag: Tag | null;
  existing: Tag[];
  notes: NoteInfo[];
  onSave: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  onOpen: (name: string) => void;
}

// One tag: a live preview, its name (saved on Enter or leaving the field),
// its color (saved on a click), and the notes that have it.
function TagEditor({ tag, existing, notes, onSave, onDelete, onOpen }: EditorProps) {
  const [name, setName] = useState(tag?.Name ?? "");
  const [color, setColor] = useState(tag?.Color ?? tagPresets[existing.length % tagPresets.length]);
  const cleaned = cleanName(name);
  const duplicate = existing.some((t) => t.Id !== tag?.Id && t.Name.toLowerCase() === cleaned.toLowerCase());
  const valid = cleaned.length > 0 && cleaned.length <= 40 && validColor(color) && !duplicate;

  // An existing tag saves each change; a new one waits for Create.
  const commit = (next: { name?: string; color?: string }) => {
    if (!tag) return;
    const n = cleanName(next.name ?? name);
    const c = (next.color ?? color).toUpperCase();
    const ok = n.length > 0 && n.length <= 40 && validColor(c) && !existing.some((t) => t.Id !== tag.Id && t.Name.toLowerCase() === n.toLowerCase());
    if (ok && (n !== tag.Name || c !== tag.Color.toUpperCase())) onSave({ ...tag, Name: n, Color: c });
  };
  // Closing with Esc, or picking another tag, mid-rename still keeps it.
  const latest = useRef(commit);
  latest.current = commit;
  useEffect(() => () => latest.current({}), []);

  const pickColor = (c: string) => {
    setColor(c);
    commit({ color: c });
  };
  const create = () => valid && onSave({ Id: newTagId(), Name: cleaned, Color: color.toUpperCase() });

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px]" style={tagChipStyle(validColor(color) ? color : "#888888")}>
          <TagIcon size={24} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <SectionLabel>{tag ? "Tag" : "New tag"}</SectionLabel>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded-[9px] px-2.5 py-1 text-15 font-semibold" style={tagChipStyle(validColor(color) ? color : "#888888")}>
              #{cleaned || "name"}
            </span>
            {tag && <span className="shrink-0 text-13 text-muted">on {notes.length === 1 ? "1 note" : `${notes.length} notes`}</span>}
          </span>
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <SectionLabel>Name</SectionLabel>
        <input
          autoFocus={!tag}
          value={name}
          maxLength={40}
          placeholder="Like: Ideas, Work, Stream"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => commit({})}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (tag) commit({});
            else create();
          }}
          aria-invalid={duplicate}
          className={clsx(
            "h-11 w-full rounded-[12px] border bg-panel px-3.5 text-15 text-text outline-none focus:border-accent",
            duplicate ? "border-danger" : "border-line",
          )}
        />
        {duplicate && <span className="text-12 text-danger">A tag with that name already exists.</span>}
      </label>

      <div className="flex flex-col gap-2.5">
        <SectionLabel>Color</SectionLabel>
        <TagColors value={color} onChange={pickColor} onHex={setColor} onHexDone={() => commit({})} />
      </div>

      {tag ? (
        <>
          <div className="flex flex-col gap-2">
            <SectionLabel>Notes with this tag</SectionLabel>
            {notes.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {notes.map((n) => (
                  <button
                    key={n.name}
                    type="button"
                    onClick={() => onOpen(n.name)}
                    title="Open this note"
                    className="flex h-10 items-center gap-2.5 rounded-[10px] px-2.5 text-left text-14 transition-colors hover:bg-panel"
                  >
                    <FileText size={15} className="shrink-0 text-muted" />
                    <span className="truncate">{titleOf(n.name)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="m-0 text-13 leading-[1.5] text-muted">None yet. Right-click a note in the notebook and choose Tags to add it.</p>
            )}
          </div>
          <div className="border-t border-line pt-5">
            <Button size="md" variant="danger" onClick={() => onDelete(tag)}>
              <Trash2 size={15} /> Delete tag
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button size="md" variant="primary" disabled={!valid} onClick={create}>
            <Plus size={15} /> Create tag
          </Button>
        </div>
      )}
    </div>
  );
}

// The preset swatches, a custom color, and its hex code. Shared with the
// New tag dialog.
export function TagColors({ value, onChange, onHex, onHexDone }: { value: string; onChange: (c: string) => void; onHex?: (c: string) => void; onHexDone?: () => void }) {
  const upper = value.toUpperCase();
  const custom = validColor(value) && !tagPresets.includes(upper);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {tagPresets.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            aria-pressed={upper === c}
            onClick={() => onChange(c)}
            className="flex h-9 w-9 items-center justify-center rounded-[11px] text-white transition-transform hover:scale-110"
            style={{ background: c, boxShadow: upper === c ? `0 0 0 2px var(--bg), 0 0 0 4px ${c}` : undefined }}
          >
            {upper === c && <Check size={16} strokeWidth={3} />}
          </button>
        ))}
        <label
          className="relative flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-[11px] text-white transition-transform hover:scale-110"
          title="Any color"
          style={{ boxShadow: custom ? `0 0 0 2px var(--bg), 0 0 0 4px ${value}` : undefined }}
        >
          <span className="absolute inset-0" style={{ background: custom ? value : "conic-gradient(#f55, #fd5, #5e5, #5dd, #57f, #e5e, #f55)" }} />
          {custom ? <Check size={16} strokeWidth={3} className="relative" /> : <Plus size={16} strokeWidth={2.6} className="relative" />}
          <input
            type="color"
            aria-label="Any color"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={validColor(value) ? value : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
          />
        </label>
      </div>
      {onHex && (
        <label className="flex h-10 w-[150px] items-center gap-2 rounded-[12px] border border-line bg-panel px-3 focus-within:border-accent">
          <span className="h-4 w-4 shrink-0 rounded-[5px]" style={{ background: validColor(value) ? value : "transparent", boxShadow: "inset 0 0 0 1px var(--line)" }} />
          <input
            value={value}
            maxLength={7}
            aria-label="Hex color"
            onChange={(e) => onHex(e.target.value)}
            onBlur={onHexDone}
            onKeyDown={(e) => e.key === "Enter" && onHexDone?.()}
            className="min-w-0 flex-1 border-0 bg-transparent font-mono text-13 text-text uppercase outline-none"
          />
        </label>
      )}
    </div>
  );
}
