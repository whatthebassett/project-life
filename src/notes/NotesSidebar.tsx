import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import {
  ArrowDownWideNarrow,
  ChevronRight,
  Copy,
  CornerDownRight,
  ExternalLink,
  Flag as FlagIcon,
  FolderInput,
  GripVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Settings2,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react";
import { titleOf, type NoteInfo } from "../lib/api";
import { motionReduced } from "../lib/motion";
import { commandIcon } from "../lib/menuIcons";
import {
  buildRows,
  isPinned,
  lookup,
  neighbours,
  withPin,
  withPriority,
  withTags,
  Priority,
  priorityColor,
  priorityLabel,
  type DropWhere,
  type PriorityValue,
  type Row,
  type Tag,
} from "../lib/notebook";
import type { MenuItem } from "../components/ContextMenu";
import { Icon } from "../ui/icons";
import { SectionLabel } from "../ui/bits";
import { useSettings } from "../lib/SettingsContext";
import NoteIcon from "./NoteIcon";
import { useNotes, type NotesFilter } from "./NotesContext";

const DAY = 86_400_000;

// The notebook panel (Notes.dc.html): search, filter chips, Pinned, the
// notebook tree, tags, and the Recycle Bin. The behavior is Checkpoint's
// Sidebar, including 1.1.2's picking several notes at once, with these fixes:
// Ctrl+Shift+click adds a run to what's picked (that branch never ran), and
// a new search or filter clears what's picked, so hidden notes can't be
// deleted along with it.
export default function NotesSidebar({ trashCount }: { trashCount: number }) {
  const { notes, notebook, current, filter, setFilter, openMenu, actions, renaming, finishRename, keyFor, stats, iconFor } = useNotes();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ name: string; where: DropWhere } | null>(null);
  const [tagDrop, setTagDrop] = useState<string | null>(null);
  // Where the note being dragged came from: pinned notes only reorder among themselves.
  const [dragFrom, setDragFrom] = useState<"pins" | "tree">("tree");
  const [pinZone, setPinZone] = useState(false);
  // Notes picked with Ctrl+click and Shift+click, for acting on several at once.
  const [selected, setSelected] = useState<string[]>([]);
  const anchor = useRef<string | null>(null);
  const hovering = useRef(false);
  // A pinned note is being dragged over the note list, to be unpinned.
  const [unpinning, setUnpinning] = useState(false);
  const pinZoneTimer = useRef<number | undefined>(undefined);
  const [pinDrop, setPinDrop] = useState<{ name: string; where: "before" | "after" } | "end" | null>(null);
  const sortByPriority = Boolean(useSettings().settings.SortByPriority);

  const nb = notebook!;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const weekAgo = Date.now() - 7 * DAY;
    return (note: NoteInfo) => {
      if (q && !titleOf(note.name).toLowerCase().includes(q)) return false;
      const ids = lookup(nb.tags.Notes, note.name) ?? [];
      if (filter === "all") return true;
      if (filter === "untagged") return ids.length === 0;
      if (filter === "high") return lookup(nb.tags.Priorities, note.name) === 3;
      if (filter === "recent") return Math.max(note.modified, lookup(stats, note.name)?.LastEdited ?? 0) >= weekAgo;
      return ids.includes(filter.tag);
    };
  }, [nb, query, filter, stats]);

  // Recent is newest first and flat; everything else is the notebook's own tree.
  const rows = useMemo<Row[]>(() => {
    if (filter !== "recent") return buildRows(notes, nb, matches, sortByPriority);
    const edited = (n: NoteInfo) => Math.max(n.modified, lookup(stats, n.name)?.LastEdited ?? 0);
    return notes
      .filter(matches)
      .sort((a, b) => edited(b) - edited(a))
      .map((note) => ({ note, depth: 0, hasChildren: false, collapsed: false }));
  }, [notes, nb, matches, filter, stats, sortByPriority]);

  // Pinned notes, in pin order; pins whose note is gone are skipped.
  const pinned = useMemo(() => {
    const byName = new Map(notes.map((n) => [n.name.toLowerCase(), n]));
    return nb.pins.flatMap((name) => {
      const note = byName.get(name.toLowerCase());
      return note && matches(note) ? [note] : [];
    });
  }, [notes, nb.pins, matches]);

  // When notes move, each row glides from where it was to where it is now.
  const treeRef = useRef<HTMLDivElement>(null);
  const lastTops = useRef(new Map<string, number>());
  const lastNotebook = useRef(nb);
  useLayoutEffect(() => {
    const rowsNow = Array.from(treeRef.current?.querySelectorAll<HTMLElement>("[data-note]") ?? []);
    const tops = new Map(rowsNow.map((el) => [el.dataset.note!, el.offsetTop]));
    if (lastNotebook.current !== nb && !motionReduced())
      for (const el of rowsNow) {
        const before = lastTops.current.get(el.dataset.note!);
        const shift = before === undefined ? 0 : before - tops.get(el.dataset.note!)!;
        if (Math.abs(shift) > 1) el.animate([{ transform: `translateY(${shift}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
      }
    lastTops.current = tops;
    lastNotebook.current = nb;
  }, [rows, nb]);

  const pinnedNames = useMemo(() => new Set(nb.pins.map((n) => n.toLowerCase())), [nb.pins]);
  const tagById = useMemo(() => new Map(nb.tags.Tags.map((t) => [t.Id, t])), [nb.tags.Tags]);

  // How many notes each folded notebook holds, for the count beside it.
  const inside = useMemo(() => {
    const count = new Map<string, number>();
    for (const parent of Object.values(nb.pages.Parents)) {
      let p: string | undefined = parent;
      for (let depth = 0; p && depth < 16; depth++) {
        const key = p.toLowerCase();
        count.set(key, (count.get(key) ?? 0) + 1);
        p = lookup(nb.pages.Parents, p);
      }
    }
    return count;
  }, [nb.pages.Parents]);

  const noteMenu = (name: string): MenuItem[] => {
    const ids = lookup(nb.tags.Notes, name) ?? [];
    const priority = (lookup(nb.tags.Priorities, name) ?? 0) as PriorityValue;
    const around = neighbours(notes, nb, name);
    return [
      { label: "Open in new tab", icon: <ExternalLink size={13} />, onSelect: () => actions.openInTab(name) },
      isPinned(nb, name)
        ? { label: "Unpin", icon: <PinOff size={13} />, hint: keyFor("app.pin"), onSelect: () => actions.setPinned(name, false) }
        : { label: "Pin to top", icon: <Pin size={13} />, hint: keyFor("app.pin"), onSelect: () => actions.setPinned(name, true) },
      { label: "Rename", icon: <Pencil size={13} />, hint: keyFor("app.rename"), onSelect: () => actions.rename(name) },
      { label: "New page inside", icon: <CornerDownRight size={13} />, hint: keyFor("app.newPage"), onSelect: () => actions.newPageInside(name) },
      { label: "Move to…", icon: <FolderInput size={13} />, onSelect: () => actions.moveTo(name) },
      { type: "separator" },
      { label: "Move up", icon: commandIcon("app.noteUp"), hint: keyFor("app.noteUp"), disabled: !around.before, onSelect: () => actions.moveBy(name, -1) },
      { label: "Move down", icon: commandIcon("app.noteDown"), hint: keyFor("app.noteDown"), disabled: !around.after, onSelect: () => actions.moveBy(name, 1) },
      {
        label: around.before ? `Put inside “${titleOf(around.before)}”` : "Put inside the note above",
        icon: commandIcon("app.noteIn"),
        hint: keyFor("app.noteIn"),
        disabled: !around.before,
        onSelect: () => actions.nest(name),
      },
      {
        label: around.parent ? `Take out of “${titleOf(around.parent)}”` : "Take out of its notebook",
        icon: commandIcon("app.noteOut"),
        hint: keyFor("app.noteOut"),
        disabled: !around.parent,
        onSelect: () => actions.unnest(name),
      },
      { type: "separator" },
      {
        label: "Tags",
        icon: <TagIcon size={13} />,
        children: [
          ...nb.tags.Tags.map<MenuItem>((tag) => ({
            label: tag.Name,
            checked: ids.includes(tag.Id),
            icon: <span className="h-[8px] w-[8px] rounded-full" style={{ background: tag.Color }} />,
            onSelect: () => actions.setTags(name, ids.includes(tag.Id) ? ids.filter((i) => i !== tag.Id) : [...ids, tag.Id]),
          })),
          ...(nb.tags.Tags.length ? [{ type: "separator" } as MenuItem] : []),
          { label: "New tag…", icon: <Plus size={13} />, onSelect: actions.newTag },
        ],
      },
      {
        label: "Priority",
        icon: <ArrowDownWideNarrow size={13} />,
        children: ([Priority.High, Priority.Medium, Priority.Low, Priority.None] as PriorityValue[]).map((p) => ({
          label: priorityLabel[p],
          checked: priority === p,
          icon: p ? <span className="h-[9px] w-[9px] rounded-full" style={{ background: priorityColor[p] }} /> : <span className="h-[9px] w-[9px] rounded-full border border-current opacity-60" />,
          onSelect: () => actions.setPriority(name, p),
        })),
      },
      { type: "separator" },
      { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => actions.duplicate(name) },
      { label: "Recycle", icon: <Trash2 size={13} />, onSelect: () => actions.recycle(name) },
      { label: "Delete permanently", icon: <X size={13} />, danger: true, onSelect: () => actions.deleteForever(name) },
    ];
  };

  // ----- picking several notes (Checkpoint 1.1.2) -----

  const isSelected = (name: string) => selected.includes(name);
  const clearSelection = () => {
    setSelected([]);
    anchor.current = null;
  };

  // Ctrl+click adds or removes a note (starting from the open one, like File
  // Explorer); Shift+click picks everything between the last one picked and
  // this one, and Ctrl+Shift+click adds that run to what's picked; a plain
  // click opens the note and clears the rest.
  const clickNote = (e: React.MouseEvent, name: string, list: string[]) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.shiftKey) {
      const from = list.indexOf(anchor.current ?? current ?? name);
      const to = list.indexOf(name);
      if (from >= 0 && to >= 0) {
        const range = list.slice(Math.min(from, to), Math.max(from, to) + 1);
        setSelected((sel) => (ctrl ? [...new Set([...sel, ...range])] : range));
        return;
      }
    }
    if (ctrl) {
      setSelected((sel) => {
        const base = sel.length === 0 && current && current !== name && list.includes(current) ? [current] : sel;
        return base.includes(name) ? base.filter((n) => n !== name) : [...base, name];
      });
      anchor.current = name;
      return;
    }
    clearSelection();
    anchor.current = name;
    actions.open(name);
  };

  // Notes that go away (recycled, deleted, renamed) drop out of the selection.
  useEffect(() => {
    setSelected((sel) => {
      const kept = sel.filter((n) => notes.some((x) => x.name === n));
      return kept.length === sel.length ? sel : kept;
    });
  }, [notes]);

  // A new search or filter starts a new selection.
  useEffect(() => {
    setSelected([]);
    anchor.current = null;
  }, [query, filter]);

  // Esc clears; Delete recycles and Shift+Delete deletes; Ctrl+A (with the
  // pointer over the notebook) picks every note shown. Not while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.closest?.("input, textarea, [contenteditable='true'], .ProseMirror, .cm-editor");
      if (document.getElementById("app-content")?.inert) return;
      if (e.key === "a" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && hovering.current && !typing) {
        e.preventDefault();
        setSelected(rows.map((r) => r.note.name));
        return;
      }
      if (!selected.length || typing) return;
      if (e.key === "Escape" && !document.querySelector("[data-menu]")) {
        clearSelection();
      } else if (e.key === "Delete") {
        e.preventDefault();
        actions.removeMany(selected, e.shiftKey);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Right-clicking one of several picked notes acts on all of them.
  const menuFor = (name: string): MenuItem[] => (selected.length > 1 && selected.includes(name) ? selectionMenu(selected) : noteMenu(name));

  const selectionMenu = (names: string[]): MenuItem[] => {
    const count = names.length;
    const allPinned = names.every((n) => isPinned(nb, n));
    const tagsOf = (n: string) => lookup(nb.tags.Notes, n) ?? [];
    return [
      { label: `Open ${count} notes in new tabs`, icon: <ExternalLink size={13} />, onSelect: () => names.forEach((n) => actions.openInTab(n)) },
      allPinned
        ? { label: "Unpin all", icon: <PinOff size={13} />, onSelect: () => actions.changeMany(names, (b, n) => withPin(b, n, false)) }
        : { label: "Pin all", icon: <Pin size={13} />, onSelect: () => actions.changeMany(names, (b, n) => withPin(b, n, true)) },
      { type: "separator" },
      {
        label: "Tags",
        icon: <TagIcon size={13} />,
        children: [
          ...nb.tags.Tags.map<MenuItem>((tag) => {
            const all = names.every((n) => tagsOf(n).includes(tag.Id));
            return {
              label: tag.Name,
              checked: all,
              icon: <span className="h-[8px] w-[8px] rounded-full" style={{ background: tag.Color }} />,
              // On for all of them, or (when they all have it already) off for all.
              onSelect: () =>
                actions.changeMany(names, (b, n) => {
                  const ids = lookup(b.tags.Notes, n) ?? [];
                  return withTags(b, n, all ? ids.filter((i) => i !== tag.Id) : ids.includes(tag.Id) ? ids : [...ids, tag.Id]);
                }),
            };
          }),
          ...(nb.tags.Tags.length ? [{ type: "separator" } as MenuItem] : []),
          { label: "New tag…", icon: <Plus size={13} />, onSelect: actions.newTag },
        ],
      },
      {
        label: "Priority",
        icon: <ArrowDownWideNarrow size={13} />,
        children: ([Priority.High, Priority.Medium, Priority.Low, Priority.None] as PriorityValue[]).map((p) => ({
          label: priorityLabel[p],
          checked: names.every((n) => ((lookup(nb.tags.Priorities, n) ?? 0) as PriorityValue) === p),
          icon: p ? <span className="h-[9px] w-[9px] rounded-full" style={{ background: priorityColor[p] }} /> : <span className="h-[9px] w-[9px] rounded-full border border-current opacity-60" />,
          onSelect: () => actions.changeMany(names, (b, n) => withPriority(b, n, p)),
        })),
      },
      { type: "separator" },
      { label: `Recycle ${count} notes`, icon: <Trash2 size={13} />, hint: "Del", onSelect: () => actions.removeMany(names, false) },
      { label: `Delete ${count} notes permanently`, icon: <X size={13} />, hint: "Shift+Del", danger: true, onSelect: () => actions.removeMany(names, true) },
      { type: "separator" },
      { label: "Clear selection", icon: <X size={13} />, hint: "Esc", onSelect: clearSelection },
    ];
  };

  const tagMenu = (tag: Tag): MenuItem[] => [
    { label: "Edit tag…", icon: <Pencil size={13} />, onSelect: () => actions.editTag(tag) },
    { label: "Delete tag", icon: <Trash2 size={13} />, danger: true, onSelect: () => actions.deleteTag(tag) },
  ];

  const dragOverRow = (e: DragEvent<HTMLDivElement>, name: string) => {
    if (!dragging || dragging === name) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientY - rect.top) / rect.height;
    const where: DropWhere = rel < 0.25 ? "before" : rel > 0.75 ? "after" : "inside";
    if (drop?.name !== name || drop.where !== where) setDrop({ name, where });
  };

  const endDrag = () => {
    window.clearTimeout(pinZoneTimer.current);
    setDragging(null);
    setDrop(null);
    setTagDrop(null);
    setPinDrop(null);
    setDragFrom("tree");
    setPinZone(false);
    setUnpinning(false);
  };

  const startDrag = (e: DragEvent<HTMLDivElement>, name: string, from: "pins" | "tree") => {
    e.dataTransfer.setData("text/plain", name);
    e.dataTransfer.effectAllowed = "move";
    setDragging(name);
    setDragFrom(from);
    // The "Drop here to pin" area opens a moment after the drag has begun:
    // opening it during dragstart moves the list under the pointer, and the
    // browser cancels a drag whose note moves as it starts.
    if (from === "tree") pinZoneTimer.current = window.setTimeout(() => setPinZone(true), 60);
  };

  const dragOverPin = (e: DragEvent<HTMLDivElement>, name: string) => {
    if (!dragging) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dragging === name) return setPinDrop(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const where = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (pinDrop === null || pinDrop === "end" || pinDrop.name !== name || pinDrop.where !== where) setPinDrop({ name, where });
  };

  const dropOnPins = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragging && pinDrop && pinDrop !== "end") actions.dropPin(dragging, pinDrop.name, pinDrop.where);
    else if (dragging && !isPinned(nb, dragging)) actions.setPinned(dragging, true);
    endDrag();
  };

  const showPins = nb.pins.length > 0 || (dragging !== null && dragFrom === "tree" && pinZone);
  const isFilter = (f: NotesFilter) => (typeof f === "object" ? typeof filter === "object" && filter.tag === f.tag : filter === f);

  const tagDropProps = (id: string, apply: () => void) => ({
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      if (!dragging) return;
      e.preventDefault();
      setTagDrop(id);
    },
    onDragLeave: () => setTagDrop((t) => (t === id ? null : t)),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (dragging) apply();
      endDrag();
    },
  });

  return (
    <aside
      aria-label="Notebook"
      className="flex w-[284px] shrink-0 flex-col gap-[18px] border-r border-line bg-side px-4 pt-[22px] pb-4"
      onMouseEnter={() => (hovering.current = true)}
      onMouseLeave={() => (hovering.current = false)}
    >
      <div className="flex items-center justify-between px-1.5">
        <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">Notes</h1>
        <button
          type="button"
          aria-label="New note"
          title={`New note (${keyFor("app.new")})`}
          onClick={actions.newNote}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink transition-[filter] hover:brightness-110"
        >
          <Icon name="plus" size={18} stroke={2.2} />
        </button>
      </div>

      <label className="flex h-[42px] items-center gap-[10px] rounded-[12px] border border-line bg-panel pr-[10px] pl-3 text-muted focus-within:border-accent">
        <Icon name="search" size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Find a note"
          aria-label="Find a note"
          className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text"
        />
        <span className="shrink-0 rounded-[6px] border border-line px-1.5 py-[3px] font-mono text-11">Ctrl P</span>
      </label>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {(
          [
            ["all", "All"],
            ["recent", "Recent"],
            ["high", "High priority"],
            ["untagged", "Untagged"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={isFilter(id)}
            onClick={() => setFilter(id)}
            className={clsx(
              "h-[30px] rounded-full border px-3 text-12 font-medium whitespace-nowrap transition-colors",
              isFilter(id) ? "border-text bg-text text-bg" : "border-line text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto">
        {showPins && (
          <div
            className="flex flex-col gap-0.5"
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              if (pinDrop === null) setPinDrop("end");
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setPinDrop(null);
            }}
            onDrop={dropOnPins}
          >
            <SectionLabel className="px-2 pb-1.5">Pinned</SectionLabel>
            {pinned.map((note) => {
              const active = note.name === current;
              const icon = iconFor(note.name);
              const dropping = pinDrop && pinDrop !== "end" && pinDrop.name === note.name ? pinDrop.where : null;
              return (
                <div
                  key={note.name}
                  data-note={note.name}
                  draggable={renaming !== note.name}
                  className={clsx(
                    "pin-row group flex h-9 cursor-default items-center gap-[10px] rounded-[10px] px-2 text-13",
                    isSelected(note.name) ? "note-selected text-text" : active ? "bg-panel text-text" : "text-muted hover:bg-panel hover:text-text",
                    dragging === note.name && "opacity-40",
                    dropping === "before" && "drop-before",
                    dropping === "after" && "drop-after",
                  )}
                  onClick={(e) => clickNote(e, note.name, pinned.map((n) => n.name))}
                  onDoubleClick={(e) => {
                    if (e.ctrlKey) return;
                    actions.rename(note.name);
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) actions.openInTab(note.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, menuFor(note.name));
                  }}
                  onDragStart={(e) => startDrag(e, note.name, "pins")}
                  onDragEnd={endDrag}
                  onDragOver={(e) => dragOverPin(e, note.name)}
                  onDrop={dropOnPins}
                >
                  <Pin size={14} strokeWidth={1.8} className="shrink-0 text-accent" />
                  {icon && <NoteIcon icon={icon} className="-mr-1" />}
                  {renaming === note.name ? (
                    <RenameField initial={titleOf(note.name)} onDone={(t) => finishRename(note.name, t)} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{titleOf(note.name)}</span>
                  )}
                  <button
                    className="hidden shrink-0 rounded-[6px] p-1 text-muted group-hover:block hover:bg-panel2 hover:text-text"
                    title="Unpin"
                    aria-label={`Unpin ${titleOf(note.name)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.setPinned(note.name, false);
                    }}
                  >
                    <PinOff size={12} />
                  </button>
                </div>
              );
            })}
            {nb.pins.length === 0 && (
              <div className={clsx("mx-1 flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-12", pinDrop ? "border-accent text-text" : "border-line text-muted")}>
                <Pin size={12} /> Drop here to pin
              </div>
            )}
            {nb.pins.length > 0 && pinned.length === 0 && <div className="px-2 py-1 text-12 text-muted">No pinned notes match.</div>}
          </div>
        )}

        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2 pr-1 pb-1.5 pl-2">
            <SectionLabel className="flex-1">{filter === "recent" ? "Edited this week" : "Notebooks"}</SectionLabel>
            <span className="font-mono text-11 text-muted">{rows.length}</span>
            {filter !== "recent" && (
              <button
                className="flex h-6 items-center gap-1 rounded-[7px] px-1.5 text-11 text-muted hover:bg-panel hover:text-text"
                title="Change how notes are ordered"
                onClick={(e) =>
                  openMenu(e.clientX, e.clientY, [
                    { label: "Custom order", icon: <GripVertical size={15} />, checked: !sortByPriority, onSelect: () => actions.setSort(false) },
                    { label: "Priority", icon: <FlagIcon size={15} />, checked: sortByPriority, onSelect: () => actions.setSort(true) },
                  ])
                }
              >
                <ArrowDownWideNarrow size={12} />
                {sortByPriority ? "Priority" : "Custom"}
              </button>
            )}
          </div>
          <div
            ref={treeRef}
            className={clsx("relative flex flex-col gap-0.5", unpinning && "drop-unpin")}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              if (dragFrom === "pins" && !unpinning) setUnpinning(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setUnpinning(false);
            }}
            // A pinned note dropped anywhere in the list comes off the pinned list.
            onDrop={(e) => {
              e.preventDefault();
              if (dragging && dragFrom === "pins") actions.setPinned(dragging, false);
              endDrag();
            }}
          >
            {rows.map(({ note, depth, hasChildren, collapsed }) => {
              const ids = lookup(nb.tags.Notes, note.name) ?? [];
              const priority = (lookup(nb.tags.Priorities, note.name) ?? 0) as PriorityValue;
              const active = note.name === current;
              const dropping = drop?.name === note.name ? drop.where : null;
              const pinnedHere = pinnedNames.has(note.name.toLowerCase());
              const icon = iconFor(note.name);
              return (
                <div
                  key={note.name}
                  data-note={note.name}
                  draggable={renaming !== note.name}
                  aria-expanded={hasChildren ? !collapsed : undefined}
                  className={clsx(
                    "group flex h-9 shrink-0 cursor-default items-center gap-2 rounded-[10px] pr-2 text-13",
                    isSelected(note.name) ? "note-selected text-text" : active ? "bg-accent-soft font-medium text-text" : "hover:bg-panel",
                    !active && !isSelected(note.name) && (depth === 0 ? "font-medium text-text" : "text-muted hover:text-text"),
                    dragging === note.name && "opacity-40",
                    dropping === "before" && "drop-before",
                    dropping === "after" && "drop-after",
                    dropping === "inside" && "drop-inside",
                  )}
                  style={{ paddingLeft: 8 + depth * 18 }}
                  onClick={(e) => clickNote(e, note.name, rows.map((r) => r.note.name))}
                  onDoubleClick={(e) => {
                    if (e.ctrlKey) return;
                    actions.rename(note.name);
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1) actions.openInTab(note.name);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, menuFor(note.name));
                  }}
                  onDragStart={(e) => startDrag(e, note.name, "tree")}
                  onDragEnd={endDrag}
                  onDragOver={(e) => dragOverRow(e, note.name)}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // From Pinned: unpinned, and placed where it was dropped.
                    if (dragging && dragFrom === "pins") actions.setPinned(dragging, false);
                    if (dragging && drop && drop.name === note.name) actions.drop(dragging, note.name, drop.where);
                    endDrag();
                  }}
                >
                  <button
                    className={clsx("flex w-3.5 shrink-0 items-center justify-center text-muted", !hasChildren && "invisible")}
                    aria-label={collapsed ? `Open ${titleOf(note.name)}` : `Fold ${titleOf(note.name)}`}
                    tabIndex={hasChildren ? 0 : -1}
                    onClick={(e) => {
                      e.stopPropagation();
                      actions.toggleCollapse(note.name);
                    }}
                  >
                    <ChevronRight size={12} strokeWidth={2.4} className={clsx("transition-transform", !collapsed && "rotate-90")} />
                  </button>
                  {icon && <NoteIcon icon={icon} />}
                  {renaming === note.name ? (
                    <RenameField initial={titleOf(note.name)} onDone={(t) => finishRename(note.name, t)} />
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{titleOf(note.name)}</span>
                  )}
                  <TagDots ids={ids} tagById={tagById} />
                  {priority > 0 && <span title={`${priorityLabel[priority]} priority`} className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: priorityColor[priority] }} />}
                  {hasChildren && collapsed && <span className="font-mono text-11 font-normal text-muted">{inside.get(note.name.toLowerCase()) ?? ""}</span>}
                  {renaming !== note.name && (
                    <button
                      className={clsx("shrink-0 rounded-[6px] p-1 hover:bg-panel2 hover:text-text", pinnedHere ? "text-accent" : "hidden text-muted group-hover:block")}
                      title={pinnedHere ? "Unpin" : "Pin to top"}
                      aria-label={`${pinnedHere ? "Unpin" : "Pin"} ${titleOf(note.name)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.setPinned(note.name, !pinnedHere);
                      }}
                    >
                      <Pin size={12} className={clsx(pinnedHere && "rotate-45")} />
                    </button>
                  )}
                </div>
              );
            })}
            {rows.length === 0 && <div className="px-2 py-3 text-13 text-muted">{notes.length ? "No notes here." : "No notes yet. Press + to write one."}</div>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-2">
            <SectionLabel>Tags</SectionLabel>
            <div className="flex gap-0.5">
              <button className="rounded-[6px] p-1 text-muted hover:bg-panel hover:text-text" title="New tag" aria-label="New tag" onClick={actions.newTag}>
                <Plus size={13} />
              </button>
              <button className="rounded-[6px] p-1 text-muted hover:bg-panel hover:text-text" title="Manage tags" aria-label="Manage tags" onClick={actions.manageTags}>
                <Settings2 size={13} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 px-1">
            {nb.tags.Tags.map((tag) => {
              const on = isFilter({ tag: tag.Id });
              return (
                <button
                  key={tag.Id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilter(on ? "all" : { tag: tag.Id })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    openMenu(e.clientX, e.clientY, tagMenu(tag));
                  }}
                  {...tagDropProps(tag.Id, () => {
                    const ids = lookup(nb.tags.Notes, dragging!) ?? [];
                    if (!ids.includes(tag.Id)) actions.setTags(dragging!, [...ids, tag.Id]);
                  })}
                  className={clsx(
                    "flex h-7 items-center gap-1.5 rounded-[8px] border px-[10px] text-12 transition-colors",
                    on ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-muted hover:text-text",
                    tagDrop === tag.Id && "ring-2 ring-accent",
                  )}
                >
                  <span className="h-[7px] w-[7px] rounded-full" style={{ background: tag.Color }} />#{tag.Name}
                </button>
              );
            })}
            {nb.tags.Tags.length === 0 && <span className="px-1 text-12 text-muted">No tags yet.</span>}
          </div>
        </div>
      </div>

      {selected.length > 0 ? (
        <div className="selection-bar -mx-2 flex items-center gap-1 rounded-[12px] border-t border-line px-2 py-1.5">
          <span className="flex-1 pl-1 text-12 font-medium">{selected.length} selected</span>
          <button className="flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-12 hover:bg-panel" title="Move them to the Recycle Bin (Del)" onClick={() => actions.removeMany(selected, false)}>
            <Trash2 size={13} /> Recycle
          </button>
          <button className="flex h-8 items-center gap-1.5 rounded-[9px] px-2 text-12 text-danger hover:bg-panel" title="Delete them for good (Shift+Del)" onClick={() => actions.removeMany(selected, true)}>
            <X size={13} /> Delete
          </button>
          <button className="rounded-[9px] p-1.5 text-muted hover:bg-panel hover:text-text" title="Clear the selection (Esc)" aria-label="Clear the selection" onClick={clearSelection}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={actions.recycleBin} className="flex h-10 items-center gap-[10px] rounded-[10px] border-t border-line px-[10px] text-13 text-muted hover:text-text">
          <Trash2 size={16} strokeWidth={1.8} />
          <span className="flex-1 text-left">Recycle Bin</span>
          <span className="font-mono text-11">{trashCount || ""}</span>
        </button>
      )}
    </aside>
  );
}

// The note's name as an editable box. Enter or clicking away saves; Escape
// cancels. Keys stay in the box so they don't reach the notebook or editor.
function RenameField({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(title);
  };
  return (
    <input
      autoFocus
      aria-label="Note name"
      className="h-7 min-w-0 flex-1 rounded-[7px] border border-accent bg-bg px-1.5 text-13 text-text outline-none"
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

function TagDots({ ids, tagById }: { ids: string[]; tagById: Map<string, Tag> }) {
  if (!ids.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-[3px]">
      {ids.map((id) => {
        const tag = tagById.get(id);
        return tag ? <span key={id} className="h-[6px] w-[6px] rounded-full opacity-80" style={{ background: tag.Color }} title={tag.Name} /> : null;
      })}
    </span>
  );
}
