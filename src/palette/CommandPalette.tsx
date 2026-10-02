import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowRight, Book, BookOpen, CalendarPlus, FilePlus, FileText, ListTodo, Lock, LockOpen, Palette, PanelLeft, PanelRight, PanelTopOpen, Settings as SettingsIcon, Terminal, Type } from "lucide-react";
import { Popup } from "../ui/Popup";
import { toast } from "../ui/Toast";
import { inTauri, titleOf } from "../lib/api";
import { parentOf, priorityLabel, type PriorityValue } from "../lib/notebook";
import { useSettings } from "../lib/SettingsContext";
import { themes } from "../lib/themes";
import { ago } from "../home/time";
import { useNotes } from "../notes/NotesContext";
import { addEvent, parseQuickEvent } from "../schedule/actions";
import { repeatLabels } from "../schedule/events";
import { requestSchedule } from "../schedule/nav";
import { navItems, type Screen } from "../shell/nav";
import { addTask } from "../tasks/actions";
import { formatDue, startOfDay } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { requestTasks } from "../tasks/nav";
import { parseCapture } from "../tasks/quick";
import { taskStore } from "../tasks/useTasks";
import { openTasksWindow } from "../tasks/window";
import type { PaletteMode, PaletteRequest } from "./open";

interface Props {
  initial: PaletteRequest;
  onClose: () => void;
  onNavigate: (screen: Screen) => void;
  onSettings: () => void;
  onGuide: () => void;
}

interface Row {
  id: string;
  section: "create" | "commands" | "notes";
  icon: ReactNode;
  label: string;
  detail?: string;
  hint?: string;
  run: () => void;
  // Ctrl+Enter or Ctrl+click: a note opens the other way (a new tab, or in place).
  alt?: () => void;
}

const modes: { id: PaletteMode; label: string; icon: ReactNode; placeholder: string }[] = [
  { id: "task", label: "Task", icon: <ListTodo size={18} />, placeholder: "Add a task, open a note, or run a command" },
  { id: "note", label: "Note", icon: <FileText size={18} />, placeholder: "Find a note, or add one, like: Ideas #stream" },
  { id: "event", label: "Event", icon: <CalendarPlus size={18} />, placeholder: "Add an event, like: Haircut sat 3pm" },
];

// "note: …", "n: …", "event: …", "e: …", "task: …", "t: …" pick what to add.
const prefix = /^\s*(task|t|note|n|event|e)\s*:\s*/i;
const prefixMode: Record<string, PaletteMode> = { task: "task", t: "task", note: "note", n: "note", event: "event", e: "event" };

// How well a note's title matches every word typed: the start of the title,
// then the start of a word, then anywhere. -1 is no match.
function score(title: string, words: string[]): number {
  const t = title.toLowerCase();
  let total = 0;
  for (const w of words) {
    if (t.startsWith(w)) total += 3;
    else if (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) total += 2;
    else if (t.includes(w)) total += 1;
    else return -1;
  }
  return total;
}

function Key({ children }: { children: ReactNode }) {
  return <kbd className="glass-key">{children}</kbd>;
}

// The command palette (Ctrl+T): type to add a task, note or event, the way
// quick add reads them, jump to a note (Enter here, Ctrl+Enter in a new tab),
// or run a command. The top row says exactly what Enter will add; a note
// whose title is exactly what's typed goes above it. A leading ">" searches
// commands only.
export default function CommandPalette({ initial, onClose, onNavigate, onSettings, onGuide }: Props) {
  const { settings, update } = useSettings();
  const notes = useNotes();
  const [text, setText] = useState(initial.text ?? "");
  const [picked, setPicked] = useState<PaletteMode>(initial.mode ?? "task");
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const opened = useMemo(() => Date.now(), []);
  const newTab = initial.newTab === true;

  // A typed prefix wins over the switch.
  const typed = prefix.exec(text);
  const mode: PaletteMode = typed ? prefixMode[typed[1].toLowerCase()] : picked;
  const body = typed ? text.slice(typed[0].length) : text;
  const commandsOnly = text.trimStart().startsWith(">");
  const query = (commandsOnly ? text.trimStart().slice(1) : body).trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);

  const now = new Date();
  const run = (f: () => void) => () => {
    onClose();
    f();
  };

  const createRow = ((): Row | null => {
    const t = body.trim();
    if (!t || commandsOnly) return null;
    if (mode === "task") {
      const p = parseCapture(t, now);
      const bits = [
        p.due ? formatDue(p.due, p.time, startOfDay(now)) : "No date",
        p.priority ? priorityLabel[p.priority as PriorityValue] : null,
        listFor(p.list).name,
        ...(p.tags ?? []).map((tag) => `#${tag}`),
      ].filter(Boolean);
      return {
        id: "create",
        section: "create",
        icon: <ListTodo size={16} />,
        label: `Add task “${p.title}”`,
        detail: bits.join(" · "),
        run: run(() => {
          const task = addTask({ ...p, how: "Created with the command palette" });
          toast(`Added task “${task.Title}”`, () => taskStore().update((ts) => ts.filter((x) => x.Id !== task.Id)));
        }),
      };
    }
    if (mode === "note") {
      const tags = [...t.matchAll(/(?:^|\s)#([\w-]+)/g)].map((m) => m[1]);
      const title = t.replace(/(?:^|\s)#[\w-]+/g, "").trim() || "Untitled";
      return {
        id: "create",
        section: "create",
        icon: <FilePlus size={16} />,
        label: `Add note “${title}”`,
        detail: [...tags.map((tag) => `#${tag}`), "Opens in Notes"].join(" · "),
        run: run(() => {
          void notes.actions.capture(title, tags).then((name) => name && toast(`Added note “${titleOf(name)}”`));
        }),
      };
    }
    const e = parseQuickEvent(t, now);
    if (!e) return null;
    const day = e.Start.slice(0, 10);
    const bits = [
      e.AllDay ? `${formatDue(day, null, startOfDay(now))} · All day` : formatDue(day, e.Start.slice(11, 16), startOfDay(now)),
      e.Repeat ? repeatLabels[e.Repeat] : null,
      listFor(e.Calendar).name,
    ].filter(Boolean);
    return {
      id: "create",
      section: "create",
      icon: <CalendarPlus size={16} />,
      label: `Add event “${e.Title || "New event"}”`,
      detail: bits.join(" · "),
      run: run(() => addEvent(e)),
    };
  })();

  const k = (id: string) => notes.keyFor(id) || undefined;
  const commands: Row[] = [
    ...navItems.map<Row>((n) => ({ id: `go:${n.id}`, section: "commands", icon: <ArrowRight size={16} />, label: `Go to ${n.label}`, hint: n.id === "home" ? k("app.home") : undefined, run: run(() => onNavigate(n.id)) })),
    { id: "new-note", section: "commands", icon: <FilePlus size={16} />, label: "New note", hint: k("app.new"), run: run(() => (onNavigate("notes"), notes.actions.newNote())) },
    { id: "new-task", section: "commands", icon: <ListTodo size={16} />, label: "New task…", detail: "With every detail", run: run(() => requestTasks({ kind: "new" })) },
    { id: "new-event", section: "commands", icon: <CalendarPlus size={16} />, label: "New event…", hint: k("app.newEvent"), run: run(() => requestSchedule({ kind: "new" })) },
    { id: "settings", section: "commands", icon: <SettingsIcon size={16} />, label: "Open settings", hint: k("app.settings"), run: run(onSettings) },
    { id: "guide", section: "commands", icon: <BookOpen size={16} />, label: "Open the guide", hint: k("app.guide"), run: run(onGuide) },
    ...(inTauri ? [{ id: "popout", section: "commands", icon: <PanelTopOpen size={16} />, label: "Pop out Tasks", run: run(() => void openTasksWindow()) } as Row] : []),
    {
      id: "formatbar",
      section: "commands",
      icon: <Type size={16} />,
      label: settings.NotesFormatBar === false ? "Show the format bar" : "Hide the format bar",
      run: run(() => update({ NotesFormatBar: settings.NotesFormatBar === false })),
    },
    {
      id: "notebook",
      section: "commands",
      icon: <PanelLeft size={16} />,
      label: settings.NotesListHidden ? "Show the notebook" : "Hide the notebook",
      hint: k("app.sidebar"),
      run: run(() => update({ NotesListHidden: !settings.NotesListHidden })),
    },
    {
      id: "details",
      section: "commands",
      icon: <PanelRight size={16} />,
      label: settings.NotesDetailsHidden ? "Show About this note" : "Hide About this note",
      hint: k("app.details"),
      run: run(() => update({ NotesDetailsHidden: !settings.NotesDetailsHidden })),
    },
    settings.HomeLocked
      ? { id: "unlock", section: "commands", icon: <LockOpen size={16} />, label: "Unlock the Home layout", run: run(() => update({ HomeLocked: false })) }
      : { id: "lock", section: "commands", icon: <Lock size={16} />, label: "Lock the Home layout", run: run(() => update({ HomeLocked: true })) },
    ...themes
      .filter((t) => t.id !== settings.Theme)
      .map<Row>((t) => ({ id: `theme:${t.id}`, section: "commands", icon: <Palette size={16} />, label: `Theme: ${t.name}`, detail: t.mood, run: run(() => update({ Theme: t.id })) })),
  ];

  const matches = (label: string) => words.every((w) => label.toLowerCase().includes(w));

  // With nothing typed: the notes changed last, then every command.
  const shownCommands = (query ? commands.filter((c) => matches(`${c.label} ${c.detail ?? ""}`)) : commands).slice(0, query ? 8 : 20);
  const noteLimit = mode === "note" ? 8 : query ? 6 : 5;
  const found = commandsOnly
    ? []
    : query
      ? notes.notes
          .map((note) => ({ note, rank: score(titleOf(note.name), words) }))
          .filter((r) => r.rank >= 0)
          .sort((a, b) => b.rank - a.rank || b.note.modified - a.note.modified)
          .slice(0, noteLimit)
          .map((r) => r.note)
      : [...notes.notes].sort((a, b) => b.modified - a.modified).slice(0, noteLimit);
  const shownNotes = found.map<Row>((n) => {
    const icon = notes.iconFor(n.name);
    const parent = notes.notebook ? parentOf(notes.notebook, n.name) : undefined;
    const hasPages = notes.notebook ? Object.values(notes.notebook.pages.Parents).some((p) => p.toLowerCase() === n.name.toLowerCase()) : false;
    const here = run(() => void notes.activate(n.name));
    const inNew = run(() => void notes.activate(n.name, true));
    return {
      id: `note:${n.name}`,
      section: "notes",
      icon: icon ? <span className="text-15 leading-none">{icon}</span> : hasPages ? <Book size={16} /> : <FileText size={16} />,
      label: titleOf(n.name),
      detail: [parent ? `in ${titleOf(parent)}` : null, n.modified > 0 ? `edited ${ago(n.modified, opened)}` : null].filter(Boolean).join(" · ") || undefined,
      run: newTab ? inNew : here,
      alt: newTab ? here : inNew,
    };
  });
  // A note titled exactly what's typed is surely the one wanted: it goes first.
  const exact = shownNotes.length > 0 && shownNotes[0].label.toLowerCase() === body.trim().toLowerCase();
  // In Note and Event mode the commands step aside; notes stay (a note may already exist).
  const rows = [
    ...(exact ? [shownNotes[0]] : []),
    ...(createRow ? [createRow] : []),
    ...(exact ? shownNotes.slice(1) : shownNotes),
    ...(mode === "task" || commandsOnly ? shownCommands : []),
  ];
  const at = Math.min(active, Math.max(rows.length - 1, 0));

  useEffect(() => setActive(0), [text, picked]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${at}"]`)?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const cycle = (step: number) => {
    const i = modes.findIndex((m) => m.id === mode);
    const next = modes[(i + step + modes.length) % modes.length].id;
    setPicked(next);
    if (typed) setText(body);
  };

  const choose = (r: Row | undefined, other: boolean) => (other && r?.alt ? r.alt() : r?.run());

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[at], e.ctrlKey);
    } else if (e.key === "Tab") {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    }
  };

  const current = modes.find((m) => m.id === mode)!;
  const modeIndex = modes.findIndex((m) => m.id === mode);
  let lastSection: Row["section"] | null = null;
  const sectionName = (s: Row["section"]) => (s === "commands" ? "Commands" : s === "notes" ? (query ? "Notes" : "Recent notes") : "");

  return (
    <Popup onClose={onClose} width={680} label="Command palette" glass>
      <div className="glass-divider flex h-16 shrink-0 items-center gap-3 border-b pr-3 pl-5">
        <span className="text-accent">{commandsOnly ? <Terminal size={18} /> : current.icon}</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={newTab && mode === "note" ? "Open a note in a new tab, or add one" : current.placeholder}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${at}` : undefined}
          aria-label={`Add a ${mode}, or search notes and commands`}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-16 text-text outline-none placeholder:text-muted"
        />
        <div role="radiogroup" aria-label="What to add" className="glass-seg relative grid shrink-0 grid-cols-3 rounded-full p-[3px]">
          <span aria-hidden="true" className="glass-thumb absolute top-[3px] bottom-[3px] left-[3px] w-[62px] rounded-full" style={{ transform: `translateX(${modeIndex * 100}%)` }} />
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              tabIndex={-1}
              onClick={() => {
                setPicked(m.id);
                if (typed) setText(body);
              }}
              className={clsx("relative h-8 w-[62px] rounded-full text-13 font-medium transition-colors", mode === m.id ? "text-text" : "text-muted hover:text-text")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={list} id={listId} role="listbox" aria-label="Results" className="max-h-[440px] min-h-0 overflow-y-auto p-2">
        {rows.length === 0 && <div className="px-3 py-6 text-center text-13 text-muted">Nothing matches “{query}”.</div>}
        {rows.map((r, i) => {
          const heading = r.section !== lastSection ? sectionName(r.section) : "";
          lastSection = r.section;
          const on = i === at;
          return (
            <div key={r.id}>
              {heading && <div className="px-3 pt-3 pb-1 font-mono text-10 tracking-[0.12em] text-muted uppercase">{heading}</div>}
              <div
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={on}
                onMouseMove={() => !on && setActive(i)}
                onClick={(e) => choose(r, e.ctrlKey)}
                className={clsx("glass-row flex cursor-default items-center gap-3 rounded-[14px] px-2.5", r.section === "create" ? "min-h-14 py-2" : "min-h-11 py-1", on && "is-active")}
              >
                <span className="glass-tile flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]">{r.icon}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={clsx("truncate", r.section === "create" ? "text-15 font-semibold" : "text-14")}>{r.label}</span>
                  {r.detail && <span className="truncate text-12 text-muted">{r.detail}</span>}
                </span>
                {r.hint && !(on && r.alt) && <span className="shrink-0 font-mono text-11 text-muted">{r.hint}</span>}
                {on && r.alt && (
                  <span className="flex shrink-0 items-center gap-1.5 text-11 text-muted">
                    <Key>Enter</Key>
                    {newTab ? "new tab" : "open"}
                    <Key>Ctrl Enter</Key>
                    {newTab ? "here" : "new tab"}
                  </span>
                )}
                {on && r.section === "create" && <Key>Enter</Key>}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="glass-divider glass-footer flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-5 py-2.5 text-11 text-muted">
        <span className="flex items-center gap-1.5">
          <Key>↑↓</Key> move
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Enter</Key> run
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Ctrl Enter</Key> {newTab ? "note here" : "note in a new tab"}
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Tab</Key> task, note or event
        </span>
        <span className="flex items-center gap-1.5">
          <Key>&gt;</Key> commands only
        </span>
        <span className="flex items-center gap-1.5">
          <Key>Esc</Key> close
        </span>
      </footer>
    </Popup>
  );
}
