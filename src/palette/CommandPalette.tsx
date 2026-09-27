import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { ArrowRight, BookOpen, CalendarPlus, FilePlus, FileText, ListTodo, Lock, LockOpen, Palette, PanelLeft, PanelRight, PanelTopOpen, Settings as SettingsIcon, Terminal, Type } from "lucide-react";
import { Popup } from "../ui/Popup";
import { toast } from "../ui/Toast";
import { inTauri, titleOf } from "../lib/api";
import { priorityLabel, type PriorityValue } from "../lib/notebook";
import { useSettings } from "../lib/SettingsContext";
import { themes } from "../lib/themes";
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
}

const modes: { id: PaletteMode; label: string; icon: ReactNode; placeholder: string }[] = [
  { id: "task", label: "Task", icon: <ListTodo size={18} />, placeholder: "Add a task, like: Pay rent fri 5pm !high #personal" },
  { id: "note", label: "Note", icon: <FileText size={18} />, placeholder: "Add a note, like: Ideas for the stream #ideas" },
  { id: "event", label: "Event", icon: <CalendarPlus size={18} />, placeholder: "Add an event, like: Haircut sat 3pm" },
];

// "note: …", "n: …", "event: …", "e: …", "task: …", "t: …" pick what to add.
const prefix = /^\s*(task|t|note|n|event|e)\s*:\s*/i;
const prefixMode: Record<string, PaletteMode> = { task: "task", t: "task", note: "note", n: "note", event: "event", e: "event" };

const sectionNames = { create: "", commands: "Commands", notes: "Notes" };

// The command palette (Ctrl+K): type to add a task, note or event, the way
// quick add reads them, or pick a command or a note to open. The top row
// says exactly what Enter will add. A leading ">" searches commands only.
export default function CommandPalette({ initial, onClose, onNavigate, onSettings, onGuide }: Props) {
  const { settings, update } = useSettings();
  const notes = useNotes();
  const [text, setText] = useState(initial.text ?? "");
  const [picked, setPicked] = useState<PaletteMode>(initial.mode ?? "task");
  const [active, setActive] = useState(0);
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);

  // A typed prefix wins over the switch.
  const typed = prefix.exec(text);
  const mode: PaletteMode = typed ? prefixMode[typed[1].toLowerCase()] : picked;
  const body = typed ? text.slice(typed[0].length) : text;
  const commandsOnly = text.trimStart().startsWith(">");
  const query = (commandsOnly ? text.trimStart().slice(1) : body).trim().toLowerCase();

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
    { id: "new-task", section: "commands", icon: <ListTodo size={16} />, label: "New task", hint: k("app.newTask"), run: run(() => requestTasks({ kind: "new" })) },
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

  const matches = (label: string) => query.split(/\s+/).every((w) => label.toLowerCase().includes(w));

  // With nothing typed: every command and the five notes changed last.
  const shownCommands = (query ? commands.filter((c) => matches(`${c.label} ${c.detail ?? ""}`)) : commands).slice(0, query ? 8 : 20);
  const shownNotes: Row[] = commandsOnly
    ? []
    : [...notes.notes]
        .filter((n) => !query || matches(titleOf(n.name)))
        .sort((a, b) => b.modified - a.modified)
        .slice(0, query ? 6 : 5)
        .map((n) => {
          const icon = notes.iconFor(n.name);
          return {
            id: `note:${n.name}`,
            section: "notes",
            icon: icon ? <span className="text-15 leading-none">{icon}</span> : <FileText size={16} />,
            label: titleOf(n.name),
            run: run(() => void notes.activate(n.name)),
          };
        });
  // In Note and Event mode the commands step aside; notes stay (a note may already exist).
  const rows = [...(createRow ? [createRow] : []), ...(mode === "task" || commandsOnly ? shownCommands : []), ...shownNotes];
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

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      rows[at]?.run();
    } else if (e.key === "Tab") {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    }
  };

  const current = modes.find((m) => m.id === mode)!;
  let lastSection: Row["section"] | null = null;

  return (
    <Popup onClose={onClose} width={680} label="Command palette" className="overflow-hidden">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-line pr-3 pl-5">
        <span className="text-accent">{commandsOnly ? <Terminal size={18} /> : current.icon}</span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={current.placeholder}
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={rows.length ? `${listId}-${at}` : undefined}
          aria-label={`Add a ${mode}, or search commands and notes`}
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-16 text-text outline-none placeholder:text-muted"
        />
        <div role="radiogroup" aria-label="What to add" className="flex shrink-0 gap-1 rounded-[12px] bg-panel2 p-[3px]">
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
              className={clsx("h-8 rounded-[9px] px-3 text-13 font-medium transition-colors", mode === m.id ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text")}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={list} id={listId} role="listbox" aria-label="Results" className="max-h-[440px] min-h-0 overflow-y-auto p-2">
        {rows.length === 0 && <div className="px-3 py-6 text-center text-13 text-muted">Nothing matches “{query}”.</div>}
        {rows.map((r, i) => {
          const heading = r.section !== lastSection && sectionNames[r.section] ? sectionNames[r.section] : null;
          lastSection = r.section;
          return (
            <div key={r.id}>
              {heading && <div className="px-3 pt-3 pb-1 font-mono text-10 tracking-[0.12em] text-muted uppercase">{heading}</div>}
              <div
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === at}
                onMouseMove={() => i !== at && setActive(i)}
                onClick={r.run}
                className={clsx(
                  "flex cursor-default items-center gap-3 rounded-[12px] px-3",
                  r.section === "create" ? "min-h-14 py-2" : "h-10",
                  i === at ? "bg-accent-soft text-text" : "text-text",
                )}
              >
                <span className={clsx("flex w-5 shrink-0 justify-center", i === at ? "text-accent" : "text-muted")}>{r.icon}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={clsx("truncate", r.section === "create" ? "text-15 font-semibold" : "text-14")}>{r.label}</span>
                  {r.detail && <span className="truncate text-12 text-muted">{r.detail}</span>}
                </span>
                {r.hint && <span className="shrink-0 font-mono text-11 text-muted">{r.hint}</span>}
                {i === at && r.section === "create" && <span className="shrink-0 rounded-[7px] border border-line px-[7px] py-0.5 font-mono text-11 text-muted">Enter</span>}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-t border-line bg-side px-5 py-2.5 font-mono text-11 text-muted">
        <span>↑↓ move</span>
        <span>Enter run</span>
        <span>Tab task, note or event</span>
        <span>note: event: pick too</span>
        <span>&gt; commands only</span>
        <span>Esc close</span>
      </footer>
    </Popup>
  );
}
