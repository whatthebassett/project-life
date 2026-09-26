// Notes, the app side: which notes there are, how the notebook is organized,
// the open tabs and note, and every action on them. Ported from Checkpoint's
// App.tsx. It lives above the screens, so Home can show recent notes and
// leaving the Notes screen always saves what's being typed.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorView } from "@codemirror/view";
import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { api, inTauri, titleOf, type NoteInfo } from "../lib/api";
import {
  isPinned,
  isWithin,
  loadNotebook,
  lookup,
  moved,
  movedBy,
  movedPin,
  nestedUnderAbove,
  newTagId,
  parentOf,
  removed,
  renamed,
  saveNotebook,
  unnested,
  withParent,
  withPin,
  withPriority,
  withTag,
  withTags,
  withoutTag,
  type DropWhere,
  type Notebook,
  type PriorityValue,
  type Tag,
} from "../lib/notebook";
import { flushStats, forgetStats, loadStats, onStatsChange, recordEdit, recordOpen, renameStats, statsSnapshot, type NoteStats } from "../lib/stats";
import { flushSpots, forgetSpot, renameSpot } from "../lib/positions";
import { splitFront, withCover, withCoverPosition } from "../lib/frontmatter";
import { todoText } from "../editor/taskLinks";
import { accountStore } from "../accounts/useAccounts";
import { eventStore } from "../schedule/useEvents";
import { setCompleted } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { taskStore } from "../tasks/useTasks";
import { linkedTasks, sendAllTodos, sendTodo, todosOf, withTodoChecked } from "./todoLinks";
import { keyMap, keyOf, keysFor } from "../lib/shortcuts";
import { initRecents, rememberEmoji, setSkinTone } from "../lib/emoji";
import { setDefaultCodeLanguage } from "../editor/code";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { beforeClose } from "../lib/closing";
import { motionReduced } from "../lib/motion";
import type { MenuItem, MenuState } from "../components/ContextMenu";
import ContextMenu from "../components/ContextMenu";
import ConfirmDialog, { type ConfirmOptions } from "../components/ConfirmDialog";
import TagDialog from "../components/TagDialog";
import TagManager from "../components/TagManager";
import RecycleBin from "../components/RecycleBin";
import MovePicker from "../components/MovePicker";
import NotePicker from "../components/NotePicker";
import EmojiPicker from "./EmojiPicker";
import { GUIDE, WELCOME, welcomeNotes } from "./welcome";

const SAVE_DELAY = 500;

// What the notebook is narrowed to (Notes.dc.html's chips, and its tags).
export type NotesFilter = "all" | "recent" | "high" | "untagged" | { tag: string };

// Everything the notebook panel can do to a note, as in Checkpoint's Sidebar.
export interface Actions {
  open: (name: string) => void;
  openInTab: (name: string) => void;
  newNote: () => void;
  rename: (name: string) => void;
  newPageInside: (name: string) => void;
  moveTo: (name: string) => void;
  setTags: (name: string, ids: string[]) => void;
  setPriority: (name: string, priority: PriorityValue) => void;
  setPinned: (name: string, pinned: boolean) => void;
  moveBy: (name: string, step: -1 | 1) => void;
  nest: (name: string) => void;
  unnest: (name: string) => void;
  dropPin: (name: string, target: string, where: "before" | "after") => void;
  duplicate: (name: string) => void;
  recycle: (name: string) => void;
  deleteForever: (name: string) => void;
  // Several selected notes at once (Checkpoint 1.1.2).
  removeMany: (names: string[], permanently: boolean) => void;
  changeMany: (names: string[], change: (nb: Notebook, name: string) => Notebook) => void;
  toggleCollapse: (name: string) => void;
  drop: (name: string, target: string, where: DropWhere) => void;
  newTag: () => void;
  editTag: (tag: Tag) => void;
  deleteTag: (tag: Tag) => void;
  manageTags: () => void;
  recycleBin: () => void;
  setSort: (byPriority: boolean) => void;
}

type DialogState =
  | null
  | { kind: "tag"; tag?: Tag; back?: boolean }
  | { kind: "manager" }
  | { kind: "recycle" }
  | { kind: "move"; name: string }
  | { kind: "pick"; newTab: boolean }
  | { kind: "emoji"; x: number; y: number };

interface NotesValue {
  ready: boolean;
  notes: NoteInfo[];
  notebook: Notebook | null;
  stats: Record<string, NoteStats>;
  current: string | null;
  tabs: string[];
  text: string;
  loaded: boolean;
  // Counts openings: the editors are keyed on it, so a rename keeps them.
  opening: number;
  editing: string | null;
  saved: "saved" | "saving" | "dirty";
  filter: NotesFilter;
  setFilter: (f: NotesFilter) => void;
  title: string;
  setTitle: (t: string) => void;
  titleInput: React.RefObject<HTMLTextAreaElement | null>;
  renaming: string | null;
  finishRename: (name: string, title: string | null) => void;
  actions: Actions;
  activate: (name: string, newTab?: boolean) => Promise<void>;
  closeTab: (name: string) => Promise<void>;
  reorderTab: (name: string, target: string, before: boolean) => void;
  tabMenu: (name: string) => MenuItem[];
  onChange: (markdown: string) => void;
  onBodyChange: (body: string) => void;
  setCover: (src: string | null) => void;
  setCoverPosition: (pos: string | null) => void;
  // Right-clicking a to-do in the open note: Send to Tasks, or open its task.
  todoMenu: (todo: { text: string; checked: boolean }) => MenuItem[];
  chooseCover: () => Promise<void>;
  commitTitle: () => Promise<void>;
  focusBody: () => void;
  flush: () => Promise<void>;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  keys: Map<string, string>;
  keyFor: (id: string) => string;
  mode: "Visual" | "Markdown";
  setMode: (m: "Visual" | "Markdown") => void;
  onVisualEditor: (e: Editor | null) => void;
  onSourceView: (v: EditorView | null) => void;
  // The / menu's Emoji, and Ctrl+;: the picker at the cursor.
  openEmoji: () => void;
  moreMenu: () => MenuItem[];
  priorityMenu: (name: string) => MenuItem[];
  // On this page: scroll to the index-th heading of the open note.
  jumpToHeading: (index: number) => void;
  // The note switcher (Ctrl+P), or Ctrl+T's version that opens a new tab.
  pickNote: (newTab: boolean) => void;
  exportNote: () => void;
}

const NotesContext = createContext<NotesValue | null>(null);

// The open note changed: tick or untick the tasks sent from its to-dos to
// match.
function syncTodosToTasks(note: string | null, markdown: string) {
  const store = taskStore();
  if (!note || store.unread()) return;
  const linked = linkedTasks(store.getState().file.Tasks, note);
  if (!linked.length) return;
  const states = new Map(todosOf(markdown).map((t) => [t.text, t.checked]));
  const now = new Date();
  store.update((ts) =>
    linked.reduce((out, t) => {
      const checked = states.get(t.NoteTodo!);
      return checked === undefined || checked === Boolean(t.Completed) ? out : setCompleted(out, t.Id, checked, now);
    }, ts),
  );
}

export function useNotes(): NotesValue {
  const v = useContext(NotesContext);
  if (!v) throw new Error("useNotes needs a NotesProvider");
  return v;
}

interface Props {
  // The Notes screen is showing; most shortcuts only work then.
  visible: boolean;
  // Show the Notes screen (opening a note from Home, Ctrl+N elsewhere…).
  onShow: () => void;
  children: ReactNode;
}

export function NotesProvider({ visible, onShow, children }: Props) {
  const { settings, update } = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  const [ready, setReady] = useState(false);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const notesRef = useRef<NoteInfo[]>([]);
  notesRef.current = notes;
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [stats, setStats] = useState<Record<string, NoteStats>>({});
  const [current, setCurrent] = useState<string | null>(null);
  const [tabs, setTabs] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [opening, setOpening] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilterState] = useState<NotesFilter>("all");
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty">("saved");
  const [title, setTitleState] = useState("");
  // The title as typed, read by commitTitle so an Enter right after typing
  // never commits the previous title.
  const titleNow = useRef("");
  const setTitle = useCallback((t: string) => {
    titleNow.current = t;
    setTitleState(t);
  }, []);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ options: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmation({ options, resolve })), []);
  const notify = useCallback((t: string, message: string) => confirm({ title: t, message }).then(() => {}), [confirm]);
  const titleInput = useRef<HTMLTextAreaElement | null>(null);

  // Autosave state lives in refs so a pending save always writes the latest text.
  const textRef = useRef("");
  const currentRef = useRef<string | null>(null);
  const notebookRef = useRef<Notebook | null>(null);
  const tabsRef = useRef<string[]>([]);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const visualRef = useRef<Editor | null>(null);
  const sourceRef = useRef<EditorView | null>(null);

  const setFilter = useCallback((f: NotesFilter) => setFilterState(f), []);

  const refreshNotes = useCallback(async () => {
    const list = await api.listNotes();
    setNotes(list);
    return list;
  }, []);

  // Every organization change goes through here: state, then the notebook files.
  const commit = useCallback(async (nb: Notebook) => {
    notebookRef.current = nb;
    setNotebook(nb);
    await saveNotebook(nb);
  }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current || !currentRef.current) return;
    dirty.current = false;
    setSaved("saving");
    await api.writeNote(currentRef.current, textRef.current);
    recordEdit(currentRef.current);
    setSaved("saved");
    void refreshNotes();
  }, [refreshNotes]);

  const onChange = useCallback(
    (markdown: string) => {
      if (markdown === textRef.current) return;
      textRef.current = markdown;
      syncTodosToTasks(currentRef.current, markdown);
      // Keep state current too: a mode switch mounts a new editor from it.
      setText(markdown);
      dirty.current = true;
      setSaved("dirty");
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  // The Visual editor works on the note's body; its front matter (the cover,
  // and anything other apps keep there) goes back in front unchanged.
  const onBodyChange = useCallback((body: string) => onChange(splitFront(textRef.current).head + body), [onChange]);

  // Change the front matter. In Markdown mode the change goes through
  // CodeMirror, so the source on screen shows the new "cover:" line.
  const editFront = useCallback(
    (edit: (md: string) => string) => {
      const full = textRef.current;
      const next = edit(full);
      if (next === full) return;
      const view = settingsRef.current.EditorMode === "Markdown" ? sourceRef.current : null;
      if (!view) return onChange(next);
      let same = 0;
      while (same < full.length && same < next.length && full[full.length - 1 - same] === next[next.length - 1 - same]) same++;
      view.dispatch({ changes: { from: 0, to: full.length - same, insert: next.slice(0, next.length - same) } });
    },
    [onChange],
  );

  // Set or remove the cover, or move the picture in its frame.
  const setCover = useCallback((src: string | null) => editFront((md) => withCover(md, src)), [editFront]);
  const setCoverPosition = useCallback((pos: string | null) => editFront((md) => withCoverPosition(md, pos)), [editFront]);

  // A task sent from a to-do was ticked (or unticked) in Tasks: tick the
  // to-do. In the open note that goes through the editor, so the change shows
  // and saves like typing would; any other note is changed on disk.
  const setTodoChecked = useCallback(
    async (note: string, text: string, checked: boolean) => {
      if (note === currentRef.current) {
        const e = settingsRef.current.EditorMode === "Markdown" ? null : visualRef.current;
        if (!e || e.isDestroyed) return editFront((md) => withTodoChecked(md, text, checked));
        let at = -1;
        e.state.doc.descendants((node, pos) => {
          if (at >= 0) return false;
          if (node.type.name === "taskItem" && todoText(node) === text) {
            at = pos;
            return false;
          }
          return true;
        });
        const node = at >= 0 ? e.state.doc.nodeAt(at) : null;
        if (node && Boolean(node.attrs.checked) !== checked) e.view.dispatch(e.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, checked }));
        return;
      }
      try {
        const md = await api.readNote(note);
        const next = withTodoChecked(md, text, checked);
        if (next !== md) await api.writeNote(note, next);
      } catch {
        // The note is gone or can't be read: the task keeps its own state.
      }
    },
    [editFront],
  );

  useEffect(() => {
    const store = taskStore();
    let before: Map<string, boolean> | null = null;
    const linkedState = () => new Map(store.getState().file.Tasks.filter((t) => t.Note && t.NoteTodo).map((t) => [t.Id, Boolean(t.Completed)]));
    const run = () => {
      if (store.unread()) return;
      const now = linkedState();
      if (before) {
        for (const t of store.getState().file.Tasks) {
          const was = before.get(t.Id);
          if (t.Note && t.NoteTodo && was !== undefined && was !== Boolean(t.Completed)) void setTodoChecked(t.Note, t.NoteTodo, Boolean(t.Completed));
        }
      }
      before = now;
    };
    run();
    return store.subscribe(run);
  }, [setTodoChecked]);

  const todoMenu = useCallback((todo: { text: string; checked: boolean }): MenuItem[] => {
    const note = currentRef.current;
    if (!note) return [];
    const task = taskStore()
      .getState()
      .file.Tasks.find((t) => t.Note === note && t.NoteTodo === todo.text);
    return task
      ? [{ label: "Open in Tasks", onSelect: () => requestTasks({ kind: "open", id: task.Id }) }]
      : [{ label: "Send to Tasks", onSelect: () => void sendTodo(note, todo.text, todo.checked) }];
  }, []);

  const chooseCover = useCallback(async () => {
    if (!inTauri) return;
    const path = await openFile({ multiple: false, filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg"] }] });
    if (typeof path === "string") setCover(await api.importAsset(path));
  }, [setCover]);

  // Enter in the title: on into the note, at the start of its text.
  const focusBody = useCallback(() => {
    if (settingsRef.current.EditorMode === "Markdown") {
      const view = sourceRef.current;
      if (!view) return;
      view.dispatch({ selection: { anchor: splitFront(view.state.doc.toString()).head.length } });
      view.focus();
    } else visualRef.current?.commands.focus("start");
  }, []);

  // Open a note. `quietly` is for startup: it isn't counted as opened.
  const open = useCallback(
    async (name: string | null, quietly = false) => {
      await flush();
      currentRef.current = name;
      setCurrent(name);
      setLoaded(false);
      const contents = name ? await api.readNote(name).catch(() => "") : "";
      // Ignore a stale read when the user has already moved on.
      if (currentRef.current !== name) return;
      textRef.current = contents;
      setText(contents);
      setTitle(name ? titleOf(name) : "");
      setOpening((n) => n + 1);
      setEditing(name);
      setLoaded(true);
      if (name && !quietly) recordOpen(name);
    },
    [flush],
  );

  // ----- tabs -----

  const setTabList = useCallback(
    (next: string[], active: string | null) => {
      tabsRef.current = next;
      setTabs(next);
      update({ Tabs: next, ActiveTab: active });
    },
    [update],
  );

  // Open a note: in its existing tab, in a new tab, or in place of the active one.
  const activate = useCallback(
    async (name: string, newTab = false) => {
      onShowRef.current();
      const cur = tabsRef.current;
      const active = currentRef.current;
      if (name === active && cur.includes(name)) return;
      let next = cur;
      if (!cur.includes(name)) {
        // Settings → Notes → Open notes in a new tab.
        const inNew = newTab || currentSettings().OpenInNewTab === true;
        next = inNew || !active || !cur.includes(active) ? [...cur, name] : cur.map((t) => (t === active ? name : t));
      }
      setTabList(next, name);
      await open(name);
    },
    [setTabList, open],
  );

  const closeTab = useCallback(
    async (name: string) => {
      const cur = tabsRef.current;
      const at = cur.indexOf(name);
      const next = cur.filter((t) => t !== name);
      if (name !== currentRef.current) {
        setTabList(next, currentRef.current);
        return;
      }
      const replacement = next[Math.min(Math.max(at, 0), next.length - 1)] ?? null;
      setTabList(next, replacement);
      await open(replacement, true);
    },
    [setTabList, open],
  );

  const reorderTab = useCallback(
    (name: string, target: string, before: boolean) => {
      const cur = tabsRef.current.filter((t) => t !== name);
      const at = cur.indexOf(target);
      cur.splice(before ? at : at + 1, 0, name);
      setTabList(cur, currentRef.current);
    },
    [setTabList],
  );

  const cycleTab = useCallback(
    (step: number) => {
      const cur = tabsRef.current;
      if (cur.length < 2 || !currentRef.current) return;
      const at = cur.indexOf(currentRef.current);
      const next = cur[(at + step + cur.length) % cur.length];
      setTabList(cur, next);
      void open(next);
    },
    [open, setTabList],
  );

  // ----- startup -----

  useEffect(() => {
    void (async () => {
      // A new notes folder starts with the welcome notes (only ever once).
      const seeded = await api.seedNotes(welcomeNotes()).catch(() => [] as string[]);
      const [list, nb] = await Promise.all([refreshNotes(), loadNotebook(), loadStats()]);
      let book = nb;
      if (seeded.length) {
        const byTitle = (t: string) => seeded.find((n) => titleOf(n) === t);
        const order = [byTitle(WELCOME), byTitle(GUIDE)].filter((n): n is string => Boolean(n));
        const tag: Tag = { Id: newTagId(), Name: "Getting started", Color: "#A092FF" };
        book = withTag({ ...book, order: [...order, ...book.order] }, tag);
        for (const n of order) book = withTags(book, n, [tag.Id]);
        await saveNotebook(book);
      }
      notebookRef.current = book;
      setNotebook(book);
      setStats(statsSnapshot());
      const s = settingsRef.current;
      initRecents(s.RecentEmoji, (recents) => update({ RecentEmoji: recents }));
      setSkinTone(s.EmojiSkinTone ?? 0);
      const exists = (n: string) => list.some((x) => x.name === n);
      const restored = (s.Tabs ?? []).filter(exists);
      const first = book.order.find(exists) ?? list[0]?.name ?? null;
      const active = s.ActiveTab && restored.includes(s.ActiveTab) ? s.ActiveTab : (restored[restored.length - 1] ?? first);
      const initialTabs = restored.length ? restored : active ? [active] : [];
      tabsRef.current = initialTabs;
      setTabs(initialTabs);
      await open(active, true);
      setReady(true);
      const folder = await api.notesFolderInfo().catch(() => null);
      if (folder?.unavailable)
        void notify(
          "Notes folder",
          `Project Life couldn't reach your notes folder, ${folder.chosen}, so it's using ${folder.path} for now. Reconnect the drive and restart Project Life, or choose another folder in Settings → Notes.`,
        );
    })();
    // Startup runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => onStatsChange(() => setStats(statsSnapshot())), []);

  useEffect(() => {
    setDefaultCodeLanguage(settings.DefaultCodeLanguage ?? "text");
  }, [settings.DefaultCodeLanguage]);

  // The open note is the active tab, so the next start comes back to it.
  useEffect(() => {
    if (loaded && current && settingsRef.current.ActiveTab !== current) update({ ActiveTab: current });
  }, [loaded, current, update]);

  // Leaving the Notes screen saves what's being typed.
  useEffect(() => {
    if (!visible) void flush();
  }, [visible, flush]);

  useEffect(() => {
    const leaving = () => {
      flushSpots();
      void flush();
    };
    window.addEventListener("pagehide", leaving);
    return () => window.removeEventListener("pagehide", leaving);
  }, [flush]);

  // ----- note actions -----

  const createNote = useCallback(
    async (parent: string | null) => {
      const nb = notebookRef.current;
      if (!nb) return;
      const name = await api.createNote("Untitled");
      let next: Notebook = { ...nb };
      if (parent) {
        next = withParent(next, name, parent);
        const at = next.order.findIndex((n) => n.toLowerCase() === parent.toLowerCase());
        const order = [...next.order];
        order.splice(at < 0 ? 0 : at + 1, 0, name);
        next = { ...next, order, pages: { ...next.pages, Collapsed: next.pages.Collapsed.filter((n) => n.toLowerCase() !== parent.toLowerCase()) } };
      } else {
        next = { ...next, order: [name, ...next.order] };
        if (typeof filter === "object") next = withTags(next, name, [filter.tag]);
      }
      await commit(next);
      await refreshNotes();
      await activate(name, true);
      window.setTimeout(() => titleInput.current?.select(), 0);
    },
    [filter, commit, refreshNotes, activate],
  );

  // Rename any note, open or not: the file, then its order, tags, priority,
  // pages and tabs. Returns the name it ended up with (a clash gets " 2").
  const renameNote = useCallback(
    async (name: string, wanted: string): Promise<string> => {
      const nb = notebookRef.current;
      const t = wanted.trim();
      if (!nb || !t || t === titleOf(name)) return name;
      if (name === currentRef.current) await flush();
      const next = await api.renameNote(name, t);
      if (next === name) return name;
      await commit(renamed(nb, name, next));
      renameStats(name, next);
      renameSpot(name, next);
      // Tasks and events linked to the note follow it.
      taskStore().update((ts) =>
        ts.some((t) => t.Note === name || t.Attachments?.some((a) => a.Kind === "note" && a.Path === name))
          ? ts.map((t) => ({
              ...t,
              Note: t.Note === name ? next : t.Note,
              Attachments: t.Attachments?.map((a) => (a.Kind === "note" && a.Path === name ? { ...a, Path: next, Name: titleOf(next) } : a)),
            }))
          : ts,
      );
      eventStore().change((f) => (f.Events.some((e) => e.Note === name) ? { ...f, Events: f.Events.map((e) => (e.Note === name ? { ...e, Note: next } : e)) } : f));
      accountStore().change((f) => (f.Events.some((e) => e.Note === name) ? { ...f, Events: f.Events.map((e) => (e.Note === name ? { ...e, Note: next } : e)) } : f));
      setEditing((e) => (e === name ? next : e));
      if (currentRef.current === name) {
        currentRef.current = next;
        setCurrent(next);
        setTitle(titleOf(next));
      }
      setTabList(
        tabsRef.current.map((x) => (x === name ? next : x)),
        currentRef.current,
      );
      await refreshNotes();
      return next;
    },
    [flush, commit, refreshNotes, setTabList],
  );

  const commitTitle = useCallback(async () => {
    const name = currentRef.current;
    if (!name) return;
    setTitle(titleOf(await renameNote(name, titleNow.current)));
  }, [renameNote, setTitle]);

  const finishRename = useCallback(
    (name: string, t: string | null) => {
      setRenaming(null);
      if (t !== null) void renameNote(name, t);
    },
    [renameNote],
  );

  // A note left the notebook (recycled or deleted): tidy up and move on.
  const afterRemoval = useCallback(
    async (name: string) => {
      const nb = notebookRef.current;
      if (!nb) return;
      if (name === currentRef.current) {
        dirty.current = false;
        window.clearTimeout(timer.current);
      }
      await commit(removed(nb, name));
      forgetStats(name);
      forgetSpot(name);
      const list = await refreshNotes();
      if (tabsRef.current.includes(name)) await closeTab(name);
      if (!currentRef.current) {
        const first = notebookRef.current?.order.find((n) => list.some((x) => x.name === n)) ?? list[0]?.name;
        if (first) await activate(first, true);
      }
    },
    [commit, refreshNotes, closeTab, activate],
  );

  const recycle = useCallback(
    async (name: string) => {
      await api.recycleNote(name);
      await afterRemoval(name);
    },
    [afterRemoval],
  );

  const deleteForever = useCallback(
    async (name: string) => {
      const ok = await confirm({
        title: "Delete permanently",
        message: `Permanently delete "${titleOf(name)}"? It won't go to the Recycle Bin.`,
        okLabel: "Delete",
        cancelLabel: "Cancel",
        danger: true,
      });
      if (!ok) return;
      await api.deleteNote(name);
      await afterRemoval(name);
    },
    [afterRemoval, confirm],
  );

  // Several notes at once (a selection in the notebook, Checkpoint 1.1.2):
  // one question, then every note goes, and the notebook, tabs and open note
  // are tidied up once.
  const removeMany = useCallback(
    async (names: string[], permanently: boolean) => {
      if (!names.length) return;
      if (names.length === 1) return permanently ? deleteForever(names[0]) : recycle(names[0]);
      const ok = await confirm(
        permanently
          ? {
              title: "Delete permanently",
              message: `Permanently delete these ${names.length} notes? They won't go to the Recycle Bin.`,
              okLabel: `Delete ${names.length} notes`,
              cancelLabel: "Cancel",
              danger: true,
            }
          : {
              title: "Recycle notes",
              message: `Move these ${names.length} notes to the Recycle Bin? You can restore them from there.`,
              okLabel: `Recycle ${names.length} notes`,
              cancelLabel: "Cancel",
            },
      );
      if (!ok) return;
      const gone = new Set<string>();
      const failed: string[] = [];
      if (currentRef.current && names.some((n) => n.toLowerCase() === currentRef.current!.toLowerCase())) {
        dirty.current = false;
        window.clearTimeout(timer.current);
      }
      for (const name of names) {
        try {
          await (permanently ? api.deleteNote(name) : api.recycleNote(name));
          gone.add(name.toLowerCase());
        } catch (e) {
          failed.push(`${titleOf(name)}: ${String(e)}`);
        }
      }
      let nb = notebookRef.current;
      if (nb) {
        for (const name of names) if (gone.has(name.toLowerCase())) nb = removed(nb, name);
        await commit(nb);
      }
      for (const name of names) {
        if (!gone.has(name.toLowerCase())) continue;
        forgetStats(name);
        forgetSpot(name);
      }
      const list = await refreshNotes();
      const tabsLeft = tabsRef.current.filter((t) => !gone.has(t.toLowerCase()));
      if (currentRef.current && gone.has(currentRef.current.toLowerCase())) {
        const next = tabsLeft[tabsLeft.length - 1] ?? notebookRef.current?.order.find((n) => list.some((x) => x.name === n)) ?? list[0]?.name ?? null;
        setTabList(next && !tabsLeft.includes(next) ? [...tabsLeft, next] : tabsLeft, next);
        await open(next, true);
      } else if (tabsLeft.length !== tabsRef.current.length) {
        setTabList(tabsLeft, currentRef.current);
      }
      if (failed.length) await notify(permanently ? "Delete permanently" : "Recycle notes", `Some notes couldn't be ${permanently ? "deleted" : "recycled"}:\n${failed.join("\n")}`);
    },
    [confirm, notify, deleteForever, recycle, commit, refreshNotes, setTabList, open],
  );

  const importNotes = useCallback(async () => {
    if (!inTauri) return;
    try {
      const picked = await openFile({ multiple: true, filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }] });
      const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
      const nb = notebookRef.current;
      if (!paths.length || !nb) return;
      const { imported, failed } = await api.importNotes(paths);
      if (imported.length) {
        let next: Notebook = { ...nb, order: [...imported, ...nb.order] };
        if (typeof filter === "object") for (const n of imported) next = withTags(next, n, [filter.tag]);
        await commit(next);
        await refreshNotes();
        await activate(imported[0], true);
      }
      if (failed.length) {
        const list = failed.map((f) => `• ${f.file}: ${f.error}`).join("\n");
        await notify(
          "Import",
          imported.length
            ? `Imported ${imported.length} note${imported.length === 1 ? "" : "s"}, but ${failed.length} couldn't be read:\n${list}`
            : `Couldn't import ${failed.length === 1 ? "that file" : "those files"}:\n${list}`,
        );
      }
    } catch (e) {
      await notify("Import", `Couldn't import: ${String(e)}`);
    }
  }, [filter, commit, refreshNotes, activate, notify]);

  const exportNote = useCallback(async () => {
    const name = currentRef.current;
    if (!name || !inTauri) return;
    await flush();
    const destination = await saveFile({ defaultPath: name, filters: [{ name: "Markdown", extensions: ["md"] }] });
    if (destination) await api.exportNote(name, destination);
  }, [flush]);

  const exportAll = useCallback(async () => {
    if (!inTauri) return;
    await flush();
    const destination = await saveFile({ defaultPath: "Project Life notes.zip", filters: [{ name: "ZIP archive", extensions: ["zip"] }] });
    if (!destination) return;
    const count = await api.exportAll(destination);
    await notify("Export all notes", `Exported ${count} file${count === 1 ? "" : "s"} to ${destination}.`);
  }, [flush, notify]);

  const reload = useCallback(async () => {
    dirty.current = false;
    window.clearTimeout(timer.current);
    await open(currentRef.current);
  }, [open]);

  const actions = useMemo<Actions>(
    () => ({
      open: (name) => void activate(name),
      openInTab: (name) => void activate(name, true),
      newNote: () => void createNote(null),
      rename: (name) => setRenaming(name),
      newPageInside: (name) => void createNote(name),
      moveTo: (name) => setDialog({ kind: "move", name }),
      setTags: (name, ids) => void (notebookRef.current && commit(withTags(notebookRef.current, name, ids))),
      setPriority: (name, p) => void (notebookRef.current && commit(withPriority(notebookRef.current, name, p))),
      setPinned: (name, pinned) => void (notebookRef.current && commit(withPin(notebookRef.current, name, pinned))),
      dropPin: (name, target, where) =>
        void (async () => {
          const nb = notebookRef.current;
          if (!nb) return;
          await commit(movedPin(isPinned(nb, name) ? nb : withPin(nb, name, true), name, target, where));
        })(),
      duplicate: (name) =>
        void (async () => {
          const nb = notebookRef.current;
          if (!nb) return;
          await flush();
          const contents = await api.readNote(name);
          const copy = await api.createNote(`${titleOf(name)} copy`);
          await api.writeNote(copy, contents);
          let next = withTags(nb, copy, lookup(nb.tags.Notes, name) ?? []);
          next = withPriority(next, copy, (lookup(nb.tags.Priorities, name) ?? 0) as PriorityValue);
          next = withParent(next, copy, parentOf(nb, name) ?? null);
          const at = next.order.findIndex((n) => n.toLowerCase() === name.toLowerCase());
          const order = [...next.order];
          order.splice(at < 0 ? order.length : at + 1, 0, copy);
          await commit({ ...next, order });
          await refreshNotes();
          await activate(copy, true);
        })(),
      recycle: (name) => void recycle(name),
      removeMany: (names, permanently) => void removeMany(names, permanently),
      changeMany: (names, change) => {
        let nb = notebookRef.current;
        if (!nb) return;
        for (const name of names) nb = change(nb, name);
        void commit(nb);
      },
      deleteForever: (name) => void deleteForever(name),
      toggleCollapse: (name) => {
        const nb = notebookRef.current;
        if (!nb) return;
        const has = nb.pages.Collapsed.some((n) => n.toLowerCase() === name.toLowerCase());
        const Collapsed = has ? nb.pages.Collapsed.filter((n) => n.toLowerCase() !== name.toLowerCase()) : [...nb.pages.Collapsed, name];
        void commit({ ...nb, pages: { ...nb.pages, Collapsed } });
      },
      drop: (name, target, where) => {
        if (!notebookRef.current) return;
        // Placing a note by hand means your own order, not priority.
        if (where !== "inside" && settingsRef.current.SortByPriority) update({ SortByPriority: false });
        void commit(moved(notebookRef.current, name, target, where));
      },
      moveBy: (name, step) => {
        if (!notebookRef.current) return;
        if (settingsRef.current.SortByPriority) update({ SortByPriority: false });
        void commit(movedBy(notesRef.current, notebookRef.current, name, step));
      },
      nest: (name) => void (notebookRef.current && commit(nestedUnderAbove(notesRef.current, notebookRef.current, name))),
      unnest: (name) => void (notebookRef.current && commit(unnested(notesRef.current, notebookRef.current, name))),
      newTag: () => setDialog((d) => ({ kind: "tag", back: d?.kind === "manager" })),
      editTag: (tag) => setDialog((d) => ({ kind: "tag", tag, back: d?.kind === "manager" })),
      deleteTag: (tag) =>
        void (async () => {
          const nb = notebookRef.current;
          if (!nb) return;
          const ok = await confirm({ title: "Delete tag", message: `Delete the tag "${tag.Name}"? Notes keep their other tags.`, okLabel: "Delete", cancelLabel: "Cancel", danger: true });
          if (!ok) return;
          await commit(withoutTag(nb, tag.Id));
          setFilterState((f) => (typeof f === "object" && f.tag === tag.Id ? "all" : f));
        })(),
      manageTags: () => setDialog({ kind: "manager" }),
      recycleBin: () => setDialog({ kind: "recycle" }),
      setSort: (byPriority) => update({ SortByPriority: byPriority }),
    }),
    [activate, createNote, commit, flush, refreshNotes, recycle, deleteForever, removeMany, update, confirm],
  );
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // ----- emoji -----

  // Where the cursor is, for the emoji picker.
  const caretPoint = useCallback((): { x: number; y: number } => {
    try {
      if (settingsRef.current.EditorMode === "Markdown") {
        const v = sourceRef.current;
        const c = v?.coordsAtPos(v.state.selection.main.head);
        if (c) return { x: c.left, y: c.bottom + 6 };
      } else {
        const e = visualRef.current;
        const c = e?.view.coordsAtPos(e.state.selection.head);
        if (c) return { x: c.left, y: c.bottom + 6 };
      }
    } catch {
      // No cursor on screen: the middle of the window.
    }
    return { x: window.innerWidth / 2 - 190, y: window.innerHeight / 4 };
  }, []);

  const openEmoji = useCallback(() => {
    const at = caretPoint();
    setDialog({ kind: "emoji", ...at });
  }, [caretPoint]);

  const insertEmoji = useCallback((native: string) => {
    if (settingsRef.current.EditorMode === "Markdown") {
      const v = sourceRef.current;
      if (v) v.dispatch({ ...v.state.replaceSelection(native), scrollIntoView: true });
    } else visualRef.current?.chain().focus().insertContent(native).scrollIntoView().run();
    rememberEmoji(native);
  }, []);

  // ----- menus and shortcuts -----

  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  // Settings → Keyboard shortcuts; App handles the Everywhere ones.
  const shortcutOverrides = settings.Shortcuts;
  const keys = useMemo(() => keyMap(shortcutOverrides, ["Notes", "Tabs", "Formatting"]), [shortcutOverrides]);
  const keyFor = useCallback((id: string) => keysFor(id, shortcutOverrides), [shortcutOverrides]);
  const mode = settings.EditorMode === "Markdown" ? "Markdown" : "Visual";
  const setMode = useCallback((m: "Visual" | "Markdown") => update({ EditorMode: m }), [update]);

  const priorityMenu = useCallback((name: string): MenuItem[] => {
    const nb = notebookRef.current;
    const priority = (nb ? (lookup(nb.tags.Priorities, name) ?? 0) : 0) as PriorityValue;
    const labels: Record<PriorityValue, string> = { 3: "High", 2: "Medium", 1: "Low", 0: "No priority" };
    const colors: Record<PriorityValue, string> = { 3: "var(--danger)", 2: "var(--warn)", 1: "var(--accent2)", 0: "" };
    return ([3, 2, 1, 0] as PriorityValue[]).map((p) => ({
      label: labels[p],
      checked: priority === p,
      icon: p ? <span className="h-[9px] w-[9px] rounded-full" style={{ background: colors[p] }} /> : <span className="h-[9px] w-[9px] rounded-full border border-current opacity-60" />,
      onSelect: () => actionsRef.current.setPriority(name, p),
    }));
  }, []);

  const tabMenu = useCallback(
    (name: string): MenuItem[] => {
      const cur = tabsRef.current;
      const at = cur.indexOf(name);
      return [
        { label: "Close", hint: keyFor("app.closeTab"), onSelect: () => void closeTab(name) },
        {
          label: "Close others",
          disabled: cur.length < 2,
          onSelect: () =>
            void (async () => {
              await activate(name);
              setTabList([name], name);
            })(),
        },
        {
          label: "Close tabs to the right",
          disabled: at === cur.length - 1,
          onSelect: () => {
            const keep = cur.slice(0, at + 1);
            setTabList(keep, keep.includes(currentRef.current ?? "") ? currentRef.current : name);
            if (!keep.includes(currentRef.current ?? "")) void open(name);
          },
        },
        { type: "separator" },
        { label: "Move left", disabled: at === 0, onSelect: () => reorderTab(name, cur[at - 1], true) },
        { label: "Move right", disabled: at === cur.length - 1, onSelect: () => reorderTab(name, cur[at + 1], false) },
      ];
    },
    [keyFor, closeTab, activate, setTabList, open, reorderTab],
  );

  // The Notes toolbar's "…" menu: what Checkpoint kept in its title bar menus.
  const moreMenu = useCallback((): MenuItem[] => {
    const name = currentRef.current;
    const s = settingsRef.current;
    const a = actionsRef.current;
    const markdown = s.EditorMode === "Markdown";
    return [
      { label: "Import Markdown files…", hint: keyFor("app.import"), disabled: !inTauri, onSelect: () => void importNotes() },
      { label: "Export this note…", hint: keyFor("app.export"), disabled: !name || !inTauri, onSelect: () => void exportNote() },
      { label: "Export all notes…", disabled: !inTauri, onSelect: () => void exportAll() },
      { label: "Open the notes folder", disabled: !inTauri, onSelect: () => void api.openNotesFolder() },
      { type: "separator" },
      { label: "Rename", hint: keyFor("app.rename"), disabled: !name, onSelect: () => name && a.rename(name) },
      { label: "Duplicate", disabled: !name, onSelect: () => name && a.duplicate(name) },
      { label: "Move to…", disabled: !name, onSelect: () => name && a.moveTo(name) },
      { label: "Reload from disk", disabled: !name, onSelect: () => void reload() },
      { label: "Send all to-dos to Tasks", disabled: !name, onSelect: () => name && void sendAllTodos(name, textRef.current) },
      { type: "separator" },
      { label: "Link previews", checked: s.LinkPreviews !== false, onSelect: () => update({ LinkPreviews: s.LinkPreviews === false }) },
      { label: "Word wrap (Markdown)", checked: s.WordWrap !== false, disabled: !markdown, onSelect: () => update({ WordWrap: s.WordWrap === false }) },
      { label: "Line numbers (Markdown)", checked: Boolean(s.LineNumbers), disabled: !markdown, onSelect: () => update({ LineNumbers: !s.LineNumbers }) },
      { type: "separator" },
      { label: "Manage tags…", onSelect: () => a.manageTags() },
      { label: "Recycle Bin", onSelect: () => a.recycleBin() },
      { type: "separator" },
      { label: "Recycle", disabled: !name, onSelect: () => name && a.recycle(name) },
      { label: "Delete permanently", danger: true, disabled: !name, onSelect: () => name && a.deleteForever(name) },
    ];
  }, [keyFor, importNotes, exportNote, exportAll, reload, update]);

  // What each Notes and Tabs shortcut does (Checkpoint's). Formatting runs in
  // the editor. Most work on the Notes screen; a few from anywhere.
  const appCommand = useMemo<Record<string, () => void>>(() => {
    const cur = () => currentRef.current;
    const a = () => actionsRef.current;
    const s = () => settingsRef.current;
    const moveTab = (step: number) => {
      const list = tabsRef.current;
      const name = cur();
      const at = name ? list.indexOf(name) : -1;
      const target = list[at + step];
      if (name && target) reorderTab(name, target, step < 0);
    };
    return {
      "app.new": () => {
        onShowRef.current();
        a().newNote();
      },
      "app.newPage": () => void (cur() && a().newPageInside(cur()!)),
      "app.movePage": () => void (cur() && a().moveTo(cur()!)),
      "app.noteUp": () => void (cur() && a().moveBy(cur()!, -1)),
      "app.noteDown": () => void (cur() && a().moveBy(cur()!, 1)),
      "app.noteIn": () => void (cur() && a().nest(cur()!)),
      "app.noteOut": () => void (cur() && a().unnest(cur()!)),
      "app.pin": () => {
        const name = cur();
        const nb = notebookRef.current;
        if (name && nb) a().setPinned(name, !isPinned(nb, name));
      },
      // Rename in place in the notebook when the note shows there, else in the header.
      "app.rename": () => {
        const name = cur();
        if (!name) return;
        if (document.querySelector(`[data-note="${CSS.escape(name)}"]`)) setRenaming(name);
        else {
          titleInput.current?.focus();
          titleInput.current?.select();
        }
      },
      "app.save": () => void flush(),
      "app.reload": () => void reload(),
      "app.import": () => void importNotes(),
      "app.export": () => void exportNote(),
      "app.exportAll": () => void exportAll(),
      "app.notesFolder": () => void api.openNotesFolder(),
      "app.recycle": () => void (cur() && a().recycle(cur()!)),
      "app.delete": () => void (cur() && a().deleteForever(cur()!)),
      "app.bin": () => setDialog({ kind: "recycle" }),
      "app.tag": () => a().newTag(),
      "app.tags": () => a().manageTags(),
      "app.mode": () => update({ EditorMode: s().EditorMode === "Markdown" ? "Visual" : "Markdown" }),
      "app.wrap": () => update({ WordWrap: s().WordWrap === false }),
      "app.lines": () => update({ LineNumbers: !s().LineNumbers }),
      "app.emoji": () => openEmoji(),
      "app.newTab": () => {
        onShowRef.current();
        setDialog({ kind: "pick", newTab: true });
      },
      "app.switch": () => {
        onShowRef.current();
        setDialog({ kind: "pick", newTab: false });
      },
      "app.closeTab": () => void (cur() && closeTab(cur()!)),
      "app.closeOtherTabs": () => {
        const name = cur();
        if (name) setTabList([name], name);
      },
      "app.nextTab": () => cycleTab(1),
      "app.previousTab": () => cycleTab(-1),
      "app.moveTabLeft": () => moveTab(-1),
      "app.moveTabRight": () => moveTab(1),
    };
  }, [flush, reload, importNotes, exportNote, exportAll, update, closeTab, cycleTab, reorderTab, setTabList, openEmoji]);
  const appCommandRef = useRef(appCommand);
  appCommandRef.current = appCommand;

  // These work from any screen; the rest only on Notes.
  const everywhere = useMemo(() => new Set(["app.new", "app.switch", "app.newTab"]), []);

  // Capture phase: app shortcuts win over the editors' own keys (so Ctrl+/
  // switches modes instead of commenting a line in Markdown mode). Not while
  // a pop-up or menu is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.getElementById("app-content")?.inert || document.querySelector("[data-menu]")) return;
      const k = keyOf(e);
      const id = k ? keys.get(k) : undefined;
      const run = id ? appCommandRef.current[id] : undefined;
      if (!run || (!visibleRef.current && !everywhere.has(id!))) return;
      e.preventDefault();
      e.stopPropagation();
      run();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [keys, everywhere]);

  // Save before the window closes (the title bar's close waits for this).
  useEffect(
    () =>
      beforeClose(async () => {
        await flush();
        flushSpots();
        await flushStats();
      }),
    [flush],
  );

  const jumpToHeading = useCallback((index: number) => {
    if (settingsRef.current.EditorMode === "Markdown") {
      const view = sourceRef.current;
      if (!view) return;
      let seen = -1;
      let fence = false;
      for (let n = 1; n <= view.state.doc.lines; n++) {
        const line = view.state.doc.line(n);
        if (/^(```|~~~)/.test(line.text)) fence = !fence;
        if (!fence && /^#{1,6}\s/.test(line.text) && ++seen === index) {
          view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
          view.focus();
          return;
        }
      }
      return;
    }
    const e = visualRef.current;
    const el = e?.view.dom.querySelectorAll(":scope > :is(h1, h2, h3, h4, h5, h6)")[index] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "start", behavior: motionReduced() ? "auto" : "smooth" });
  }, []);

  const onVisualEditor = useCallback((e: Editor | null) => void (visualRef.current = e), []);
  const onSourceView = useCallback((v: EditorView | null) => void (sourceRef.current = v), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const value: NotesValue = {
    ready,
    notes,
    notebook,
    stats,
    current,
    tabs,
    text,
    loaded,
    opening,
    editing,
    saved,
    filter,
    setFilter,
    title,
    setTitle,
    titleInput,
    renaming,
    finishRename,
    actions,
    activate,
    closeTab,
    reorderTab,
    tabMenu,
    onChange,
    onBodyChange,
    setCover,
    setCoverPosition,
    todoMenu,
    chooseCover,
    commitTitle,
    focusBody,
    flush,
    openMenu,
    keys,
    keyFor,
    mode,
    setMode,
    onVisualEditor,
    onSourceView,
    openEmoji,
    moreMenu,
    priorityMenu,
    jumpToHeading,
    pickNote: (newTab) => {
      onShowRef.current();
      setDialog({ kind: "pick", newTab });
    },
    exportNote: () => void exportNote(),
  };

  return (
    <NotesContext.Provider value={value}>
      {children}
      <ContextMenu menu={menu} onClose={closeMenu} />
      {notebook && dialog?.kind === "tag" && (
        <TagDialog
          tag={dialog.tag}
          existing={notebook.tags.Tags}
          onClose={() => setDialog(dialog.back ? { kind: "manager" } : null)}
          onSave={(name, color) => {
            void commit(withTag(notebook, { Id: dialog.tag?.Id ?? newTagId(), Name: name, Color: color }));
            setDialog(dialog.back ? { kind: "manager" } : null);
          }}
        />
      )}
      {notebook && dialog?.kind === "manager" && (
        <TagManager notebook={notebook} onNew={actions.newTag} onEdit={actions.editTag} onDelete={actions.deleteTag} onClose={closeDialog} />
      )}
      {notebook && dialog?.kind === "recycle" && (
        <RecycleBin
          confirm={confirm}
          onClose={closeDialog}
          onRestored={(name) =>
            void (async () => {
              const nb = notebookRef.current ?? notebook;
              await commit({ ...nb, order: [name, ...nb.order] });
              await refreshNotes();
              await activate(name, true);
            })()
          }
        />
      )}
      {notebook && dialog?.kind === "move" && (
        <MovePicker
          name={dialog.name}
          notes={notes}
          notebook={notebook}
          onClose={closeDialog}
          onMove={(target) => {
            if (!target || !isWithin(notebook, target, dialog.name)) void commit(withParent(notebook, dialog.name, target));
            setDialog(null);
          }}
        />
      )}
      {notebook && dialog?.kind === "pick" && (
        <NotePicker
          notes={notes}
          notebook={notebook}
          newTab={dialog.newTab}
          onClose={closeDialog}
          onPick={(name) => {
            setDialog(null);
            void activate(name, dialog.newTab);
          }}
        />
      )}
      {dialog?.kind === "emoji" && (
        <EmojiPicker
          x={dialog.x}
          y={dialog.y}
          tone={settings.EmojiSkinTone ?? 0}
          onTone={(t) => {
            setSkinTone(t);
            update({ EmojiSkinTone: t });
          }}
          onPick={insertEmoji}
          onClose={closeDialog}
        />
      )}
      {confirmation && (
        <ConfirmDialog
          {...confirmation.options}
          onResult={(ok) => {
            confirmation.resolve(ok);
            setConfirmation(null);
          }}
        />
      )}
    </NotesContext.Provider>
  );
}
