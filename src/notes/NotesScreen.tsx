import { locale } from "../lib/format";
import { clockText } from "../lib/format";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import clsx from "clsx";
import { Ellipsis, Pin, Share } from "lucide-react";
import { api, titleOf } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import { coverOf, coverPositionOf, iconOf, splitFront } from "../lib/frontmatter";
import { isPinned, lookup, parentOf, type PriorityValue } from "../lib/notebook";
import { spotFor, rememberSpot, type EditorSpot } from "../lib/positions";
import { saveImageFile } from "../editor/images";
import type { CaretConfig } from "../editor/caret";
import NoteHeader from "../components/NoteHeader";
import SourceEditor from "../components/SourceEditor";
import Toolbar from "../components/Toolbar";
import VisualEditor, { type EditorCommands } from "../components/VisualEditor";
import type { Editor } from "@tiptap/react";
import { SectionLabel } from "../ui/bits";
import { SegmentedControl } from "../ui/SegmentedControl";
import NoteIcon from "./NoteIcon";
import NotesSidebar from "./NotesSidebar";
import { useNotes } from "./NotesContext";
import { headingsOf, todoCount, wordCount } from "./outline";
import { todoLinksFor } from "./todoLinks";
import { useNow } from "../lib/dates";
import { occurrences } from "../schedule/events";
import { shortTime } from "../schedule/look";
import { requestSchedule } from "../schedule/nav";
import { useAllEvents } from "../schedule/useEvents";
import { requestTasks } from "../tasks/nav";
import { useTasks } from "../tasks/useTasks";
import { Icon } from "../ui/icons";

// The Notes screen (Notes.dc.html): the notebook, then tabs, the note's bar,
// the page and a status line, then On this page and Details on the right.
export default function NotesScreen() {
  const n = useNotes();
  // Either side panel can be hidden for a wider page (Ctrl+\, Ctrl+Shift+\).
  const { settings } = useSettings();
  const [trash, setTrash] = useState(0);
  useEffect(() => {
    void api
      .listTrash()
      .then((t) => setTrash(t.length))
      .catch(() => {});
  }, [n.notes]);

  if (!n.ready || !n.notebook) return <main className="min-w-0 flex-1 bg-bg" />;

  return (
    <>
      {!settings.NotesListHidden && <NotesSidebar trashCount={trash} />}
      <main className="flex min-w-0 flex-1 flex-col bg-bg">
        <Tabs />
        {n.current ? (
          <>
            <NoteBar />
            <Page />
            <StatusBar />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-14 text-muted">
            <span>No note open.</span>
            <button type="button" onClick={n.actions.newNote} className="h-10 rounded-[12px] bg-accent px-4 text-13 font-semibold text-accent-ink">
              New note
            </button>
          </div>
        )}
      </main>
      {!settings.NotesDetailsHidden && <RightPanel />}
    </>
  );
}

function Tabs() {
  const { tabs, current, activate, closeTab, reorderTab, tabMenu, openMenu, keyFor, pickNote, iconFor } = useNotes();
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ name: string; before: boolean } | null>(null);

  const over = (e: DragEvent, name: string) => {
    if (!dragging || dragging === name) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientX < r.left + r.width / 2;
    if (drop?.name !== name || drop.before !== before) setDrop({ name, before });
  };

  return (
    <div className="flex h-[50px] shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-side px-[14px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div role="tablist" aria-label="Open notes" className="contents">
        {tabs.map((name) => {
          const on = name === current;
          const icon = iconFor(name);
          return (
            <div
              key={name}
              role="presentation"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", name);
                setDragging(name);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDrop(null);
              }}
              onDragOver={(e) => over(e, name)}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && drop) reorderTab(dragging, drop.name, drop.before);
                setDragging(null);
                setDrop(null);
              }}
              // Middle-click closes the tab, as in a browser. Pressing the
              // middle button would otherwise start the tab strip's
              // autoscroll, which swallows the click.
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button !== 1) return;
                e.preventDefault();
                void closeTab(name);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, tabMenu(name));
              }}
              className={clsx(
                "-mb-px flex h-10 max-w-[220px] shrink-0 items-center gap-1 rounded-t-[12px] border border-b-0 pr-1.5 pl-[14px]",
                on ? "border-line bg-bg text-text" : "border-transparent text-muted hover:text-text",
                dragging === name && "opacity-40",
                drop?.name === name && (drop.before ? "shadow-[inset_2px_0_0_var(--accent)]" : "shadow-[inset_-2px_0_0_var(--accent)]"),
              )}
            >
              <button
                role="tab"
                aria-selected={on}
                aria-description={`${keyFor("app.closeTab")} closes it`}
                onMouseDown={(e) => e.button === 0 && !on && void activate(name)}
                className="flex h-full min-w-0 items-center gap-1.5 text-13 font-medium"
              >
                {icon && <NoteIcon icon={icon} />}
                <span className="truncate">{titleOf(name)}</span>
              </button>
              {/* For the mouse; the keyboard closes tabs with the shortcut or the tab's menu. */}
              <button
                aria-hidden="true"
                tabIndex={-1}
                title={`Close (${keyFor("app.closeTab")})`}
                onClick={() => void closeTab(name)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-panel hover:text-text"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button
        aria-label={`New tab (${keyFor("app.newTab")})`}
        title={`Open a note in a new tab (${keyFor("app.newTab")})`}
        onClick={() => pickNote(true)}
        className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-panel hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

// The breadcrumb, Visual or Markdown, pin, export and the rest.
function NoteBar() {
  const { current, notebook, mode, setMode, actions, openMenu, moreMenu, keyFor, flush, exportNote } = useNotes();
  const name = current!;
  const nb = notebook!;
  const path = parentsOf(nb, name);
  const pinned = isPinned(nb, name);
  return (
    <div className="flex h-[58px] shrink-0 items-center justify-between gap-4 border-b border-line px-6">
      <nav aria-label="Where this note is" className="flex min-w-0 items-center gap-2 text-13 text-muted">
        {path.map((p) => (
          <span key={p} className="flex shrink-0 items-center gap-2">
            <button className="hover:text-text hover:underline" onClick={() => actions.open(p)}>
              {titleOf(p)}
            </button>
            <span aria-hidden="true">/</span>
          </span>
        ))}
        <span className="truncate font-medium text-text">{titleOf(name)}</span>
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        <SegmentedControl
          label="Editor mode"
          value={mode}
          onChange={(m) => {
            void flush();
            setMode(m);
          }}
          options={[
            { value: "Visual", label: "Visual" },
            { value: "Markdown", label: "Markdown" },
          ]}
        />
        <button
          aria-label={pinned ? "Unpin note" : "Pin note"}
          aria-pressed={pinned}
          title={`${pinned ? "Unpin" : "Pin"} (${keyFor("app.pin")})`}
          onClick={() => actions.setPinned(name, !pinned)}
          className={clsx("relative flex h-10 w-10 items-center justify-center rounded-[12px] border border-line transition-colors hover:bg-panel", pinned ? "text-accent" : "text-muted hover:text-text")}
        >
          <Pin size={17} strokeWidth={1.8} className={clsx(pinned && "rotate-45")} />
        </button>
        <button
          aria-label="Export"
          title={`Export this note (${keyFor("app.export")})`}
          onClick={exportNote}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted transition-colors hover:bg-panel hover:text-text"
        >
          <Share size={17} strokeWidth={1.8} />
        </button>
        <button
          aria-label="More"
          title="More"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(r.right - 240, r.bottom + 6, moreMenu());
          }}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted transition-colors hover:bg-panel hover:text-text"
        >
          <Ellipsis size={17} />
        </button>
      </div>
    </div>
  );
}

// The notebooks a note sits in, outermost first.
function parentsOf(nb: NonNullable<ReturnType<typeof useNotes>["notebook"]>, name: string): string[] {
  const out: string[] = [];
  let p = parentOf(nb, name);
  for (let i = 0; p && i < 16; i++) {
    out.unshift(p);
    p = parentOf(nb, p);
  }
  return out;
}

function Page() {
  const n = useNotes();
  const { settings } = useSettings();
  const name = n.current!;
  const nb = n.notebook!;
  // The editor and its link and picture commands, for the format bar.
  const [editor, setEditor] = useState<Editor | null>(null);
  const commands = useRef<EditorCommands | null>(null);
  const { onVisualEditor } = n;
  const onEditor = useCallback(
    (e: Editor | null) => {
      onVisualEditor(e);
      setEditor(e);
    },
    [onVisualEditor],
  );
  const body = useMemo(() => splitFront(n.text).body, [n.text]);
  const cover = useMemo(() => coverOf(n.text), [n.text]);
  const coverPosition = useMemo(() => coverPositionOf(n.text), [n.text]);
  const icon = useMemo(() => iconOf(n.text), [n.text]);
  const info = n.notes.find((x) => x.name === name);
  const tags = useMemo(() => {
    const ids = lookup(nb.tags.Notes, name) ?? [];
    return nb.tags.Tags.filter((t) => ids.includes(t.Id));
  }, [nb, name]);
  const priority = (lookup(nb.tags.Priorities, name) ?? 0) as PriorityValue;
  const caret: CaretConfig = { width: 2, rainbow: false, blinkMs: 530 };
  const { tasks } = useTasks();
  const now = useNow();
  const todoLinks = useMemo(() => todoLinksFor(tasks, name, now), [tasks, name, now]);

  if (!n.loaded) return <div className="min-h-0 flex-1" />;

  const header = (
    <NoteHeader
      title={n.title}
      titleRef={n.titleInput}
      onTitleChange={n.setTitle}
      onTitleCommit={() => void n.commitTitle()}
      onTitleCancel={() => n.setTitle(titleOf(name))}
      onEnterBody={n.focusBody}
      cover={cover}
      onChooseCover={() => void n.chooseCover()}
      onDropCover={(file) => void saveImageFile(file).then(n.setCover)}
      onRemoveCover={() => n.setCover(null)}
      coverPosition={coverPosition}
      onCoverPosition={n.setCoverPosition}
      icon={icon}
      onChooseIcon={n.chooseIcon}
      onRemoveIcon={() => n.setIcon(null)}
      onMenu={n.openMenu}
      path={parentsOf(nb, name)}
      onOpenParent={(p) => n.actions.open(p)}
      tags={tags}
      priority={priority}
      onPriority={(x, y) => n.openMenu(x, y, n.priorityMenu(name))}
      modified={info?.modified}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-note-page style={{ "--note-width": noteWidths[settings.NoteWidth ?? "wide"] } as React.CSSProperties}>
      {n.mode !== "Markdown" && settings.NotesFormatBar !== false && (
        <Toolbar editor={editor} openMenu={n.openMenu} keyFor={n.keyFor} onEmoji={() => n.openEmoji()} onLink={() => commands.current?.link()} onImage={() => commands.current?.image()} />
      )}
      <div className="min-h-0 flex-1">
        {n.mode === "Markdown" ? (
          <SourceEditor
            key={n.opening}
            initial={n.text}
            lineNumbers={Boolean(settings.LineNumbers)}
            wordWrap={settings.WordWrap !== false}
            blinkMs={530}
            onChange={n.onChange}
            onView={n.onSourceView}
            header={header}
            spot={spotFor(n.editing, "markdown")}
            onSpot={(spot: EditorSpot) => n.editing && rememberSpot(n.editing, "markdown", spot)}
          />
        ) : (
          <VisualEditor
            key={n.opening}
            initial={body}
            header={header}
            readable
            caret={caret}
            keys={n.keys}
            keyFor={n.keyFor}
            onChange={n.onBodyChange}
            openMenu={n.openMenu}
            onEmoji={n.openEmoji}
            onEditor={onEditor}
            commands={commands}
            linkPreviews={settings.LinkPreviews !== false}
            videoEmbeds={settings.VideoEmbeds !== false}
            todoLinks={todoLinks}
            onOpenTodo={(id) => requestTasks({ kind: "open", id })}
            todoMenu={n.todoMenu}
            spot={spotFor(n.editing, "visual")}
            onSpot={(spot: EditorSpot) => n.editing && rememberSpot(n.editing, "visual", spot)}
          />
        )}
      </div>
    </div>
  );
}

// Settings → Notes → Page width. Full width is a width the page never
// reaches, so the column fills whatever room there is.
export const noteWidths = { narrow: "660px", wide: "900px", full: "100000px" } as const;

function StatusBar() {
  const { saved, current, text, mode, keyFor } = useNotes();
  const words = useMemo(() => wordCount(splitFront(text).body), [text]);
  return (
    <div className="flex h-[38px] shrink-0 items-center justify-between border-t border-line px-6 font-mono text-11 text-muted">
      <div className="flex items-center gap-[18px]" aria-live="polite">
        <span className="flex items-center gap-1.5">
          <span className={clsx("h-1.5 w-1.5 rounded-full", saved === "saved" ? "bg-accent2" : "bg-warn")} />
          {saved === "saved" ? "Saved" : saved === "saving" ? "Saving…" : "Editing"} · {current}
        </span>
        <span>
          {words} {words === 1 ? "word" : "words"}
        </span>
      </div>
      <span>
        {mode} · {keyFor("app.mode").replace("+", " ")}
      </span>
    </div>
  );
}

// On this page, Linked in Project Life (to-dos sent to Tasks, and time on
// the schedule), then Details.
function RightPanel() {
  const n = useNotes();
  const [folder, setFolder] = useState("");
  const [active, setActive] = useState(0);
  const body = useMemo(() => splitFront(n.text).body, [n.text]);
  const headings = useMemo(() => headingsOf(body), [body]);
  const todos = useMemo(() => todoCount(body), [body]);
  const words = useMemo(() => wordCount(body), [body]);
  const info = n.notes.find((x) => x.name === n.current);
  const panel = useRef<HTMLElement>(null);
  const { tasks } = useTasks();
  const { events } = useAllEvents();
  const now = useNow();
  const sent = tasks.filter((t) => t.Note === n.current && t.NoteTodo);
  const openSent = sent.filter((t) => !t.Completed);
  const linkedHere = tasks.filter((t) => t.Note === n.current && !t.NoteTodo && !t.Completed);
  // The next showing of each event linked to this note.
  const eventsHere = useMemo(() => {
    const linked = events.filter((e) => e.Note === n.current);
    if (!linked.length) return [];
    const seen = new Set<string>();
    return occurrences(linked, now, new Date(now.getTime() + 60 * 86_400_000)).filter((o) => !seen.has(o.event.Id) && Boolean(seen.add(o.event.Id)));
  }, [events, n.current, now]);

  useEffect(() => {
    void api
      .notesFolderInfo()
      .then((f) => setFolder(f.path))
      .catch(() => {});
  }, []);

  // The heading you're reading: the last one above the top of the page.
  useEffect(() => {
    const page = document.querySelector<HTMLElement>("[data-note-page]");
    if (!page || n.mode === "Markdown") return;
    const onScroll = () => {
      const top = page.getBoundingClientRect().top + 120;
      const els = page.querySelectorAll<HTMLElement>(".ProseMirror > :is(h1, h2, h3, h4, h5, h6)");
      let at = 0;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top <= top) at = i;
      });
      setActive(at);
    };
    page.addEventListener("scroll", onScroll, { capture: true, passive: true });
    onScroll();
    return () => page.removeEventListener("scroll", onScroll, { capture: true });
  }, [n.mode, n.opening, n.loaded, headings.length]);

  if (!n.current) return <aside aria-label="About this note" className="w-[284px] shrink-0 border-l border-line bg-side" />;

  const when = (ms: number | undefined) => {
    if (!ms) return "—";
    const d = new Date(ms);
    const today = new Date();
    const time = clockText(d);
    if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
    return d.toLocaleDateString(locale(), { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  };

  return (
    <aside ref={panel} aria-label="About this note" className="flex w-[284px] shrink-0 flex-col gap-[22px] overflow-y-auto border-l border-line bg-side px-5 py-[22px]">
      <div className="flex flex-col gap-1.5">
        <SectionLabel className="pb-1.5">On this page</SectionLabel>
        {headings.map((h, i) => (
          <button
            key={i}
            onClick={() => n.jumpToHeading(i)}
            className={clsx(
              "flex min-h-[34px] items-center rounded-[10px] py-1.5 pr-3 text-left text-13",
              i === active && n.mode === "Visual" ? "bg-panel font-medium text-text" : "text-muted hover:text-text",
            )}
            style={{ paddingLeft: 12 + Math.max(0, h.level - (headings[0]?.level ?? 1)) * 12 }}
          >
            <span className="line-clamp-2">{h.text}</span>
          </button>
        ))}
        {headings.length === 0 && <span className="px-3 text-12 leading-[1.5] text-muted">Headings you add show up here. Type # and a space to make one.</span>}
      </div>

      {(sent.length > 0 || linkedHere.length > 0 || eventsHere.length > 0) && (
        <div className="flex flex-col gap-[10px]">
          <SectionLabel>Linked in Project Life</SectionLabel>
          <div className="flex flex-col gap-[10px] rounded-[16px] border border-line bg-panel p-3.5">
            {eventsHere.slice(0, 3).map((o, i) => (
              <Fragment key={o.key}>
                {i > 0 && <div className="h-px bg-line" />}
                <LinkedRow
                  icon={<Icon name="schedule" size={16} stroke={2} />}
                  tone="accent"
                  title={o.event.Title}
                  sub={`${o.start.toDateString() === now.toDateString() ? "Today" : o.start.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" })} · ${shortTime(o.start)}`}
                  onClick={() => requestSchedule({ kind: "open", id: o.event.Id, day: o.day })}
                />
              </Fragment>
            ))}
            {sent.length > 0 && (
              <>
                {eventsHere.length > 0 && <div className="h-px bg-line" />}
                <LinkedRow
                  icon={<Icon name="tasks" size={16} stroke={2} />}
                  tone="accent2"
                  title={openSent.length ? `${openSent.length} ${openSent.length === 1 ? "to-do" : "to-dos"} sent to Tasks` : `${sent.length} sent to Tasks, all done`}
                  sub="Due dates read from the text"
                  onClick={() => requestTasks({ kind: "open", id: (openSent[0] ?? sent[0]).Id })}
                />
              </>
            )}
            {linkedHere.length > 0 && (
              <>
                {(eventsHere.length > 0 || sent.length > 0) && <div className="h-px bg-line" />}
                <LinkedRow
                  icon={<Icon name="tasks" size={16} stroke={2} />}
                  tone="accent2"
                  title={linkedHere.length === 1 ? linkedHere[0].Title : `${linkedHere.length} tasks link here`}
                  sub={linkedHere.length === 1 ? "Task linked to this note" : "Tasks linked to this note"}
                  onClick={() => requestTasks({ kind: "open", id: linkedHere[0].Id })}
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-[10px]">
        <SectionLabel>Details</SectionLabel>
        <div className="grid grid-cols-2 gap-[10px]">
          <Stat label="Words" value={String(words)} />
          <Stat label="To-dos" value={todos.total ? `${todos.done}/${todos.total}` : "—"} />
        </div>
        <div className="flex flex-col gap-2 px-0.5 py-1 text-12">
          <Row label="Created" value={when(info?.created)} />
          <Row label="Modified" value={when(info?.modified)} />
          <Row label="Format" value="Plain Markdown" />
        </div>
        <div className="rounded-[12px] border border-dashed border-line px-3 py-[10px] font-mono text-11 leading-[1.5] break-all text-muted">
          {folder ? `${folder}\\${n.current}` : n.current}
        </div>
      </div>
    </aside>
  );
}

function LinkedRow({ icon, tone, title, sub, onClick }: { icon: React.ReactNode; tone: "accent" | "accent2"; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-[10px] text-left hover:opacity-90">
      <span className={clsx("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]", tone === "accent" ? "bg-accent-soft text-accent" : "bg-panel2 text-accent2")}>{icon}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-13 font-medium">{title}</span>
        <span className="truncate text-12 text-muted">{sub}</span>
      </span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-panel p-3">
      <span className="text-11 text-muted">{label}</span>
      <span className="font-mono text-18">{value}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
