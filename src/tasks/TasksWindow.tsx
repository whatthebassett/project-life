import clsx from "clsx";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronRight, Minus, Pin, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ContextMenu, { menuPoint, type MenuItem, type MenuState } from "../components/ContextMenu";
import { inTauri, onDataChanged } from "../lib/api";
import { applyAppearance } from "../lib/appearance";
import { useNow } from "../lib/dates";
import { motionReduced } from "../lib/motion";
import { loadSettings } from "../lib/settings";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Toaster } from "../ui/Toast";
import AppMenu from "../components/AppMenu";
import Tooltips from "../components/Tooltips";
import { addTask, deleteTasks, toggleTask } from "./actions";
import { formatDue, startOfDay } from "./dates";
import { listFor } from "./lists";
import { groupMenu, taskMenu } from "./menus";
import type { Task } from "./model";
import { parseCapture } from "./quick";
import TaskRow from "./TaskRow";
import { taskStore, useTasks } from "./useTasks";
import { groupTasks, inView, type BaseView } from "./views";

// Asks the main window to open a task in its pop-up.
export const TASKS_OPEN = "tasks:open";

// Tasks popped out into their own small window: Today, Upcoming or All, quick
// add, and the list with checkboxes and Later. Double-click (or Enter) opens
// the task in the main window. It can stay on top of other windows.
export default function TasksWindow() {
  const { tasks, lists } = useTasks();
  const now = useNow();
  const [view, setView] = useState<BaseView>("today");
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [laterFor, setLaterFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set(["completed"]));
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const [onTop, setOnTop] = useState(false);
  const listBox = useRef<HTMLDivElement>(null);

  // Follows the main window's theme, text size and motion settings.
  useEffect(() => {
    const apply = () => void loadSettings().then(applyAppearance);
    onDataChanged("settings.json", apply);
    if (!inTauri) return;
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());
    const closing = win.onCloseRequested(async () => {
      await taskStore().flush();
    });
    return () => void closing.then((f) => f());
  }, []);

  const shown = useMemo(() => tasks.filter((t) => inView(t, view, now) || settling.has(t.Id)), [tasks, view, now, settling]);
  const groups = useMemo(() => groupTasks(shown, "date", lists.map((l) => listFor(l.Id)), now, settling), [shown, lists, now, settling]);
  const visibleIds = groups.flatMap((g) => (folded.has(g.id) ? [] : g.tasks.map((t) => t.Id)));
  const parsed = draft.trim() ? parseCapture(draft, now, { undated: view === "upcoming" ? "tomorrow" : "today" }) : null;

  const openInMain = (id: string) => void emitTo("main", TASKS_OPEN, { id }).catch(() => {});

  const toggle = (t: Task) => {
    const done = !t.Completed;
    toggleTask(t);
    if (done && !motionReduced()) {
      setSettling((s) => new Set(s).add(t.Id));
      setTimeout(() => setSettling((s) => new Set([...s].filter((x) => x !== t.Id))), 650);
    }
  };

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setSelected(id);
    requestAnimationFrame(() => listBox.current?.querySelector<HTMLElement>(`[data-task-id="${id}"]`)?.focus());
  };

  const onRowKey = (e: React.KeyboardEvent, t: Task) => {
    if (e.target !== e.currentTarget) return;
    const i = visibleIds.indexOf(t.Id);
    if (e.key === " ") toggle(t);
    else if (e.key === "Enter") openInMain(t.Id);
    else if (e.key === "Delete") {
      focusRow(visibleIds[i + 1] ?? visibleIds[i - 1]);
      deleteTasks([t]);
    } else if (e.key === "ArrowDown") focusRow(visibleIds[i + 1]);
    else if (e.key === "ArrowUp") focusRow(visibleIds[i - 1]);
    else return;
    e.preventDefault();
  };

  const add = () => {
    if (!parsed) return;
    const t = addTask({ ...parsed, how: "Created with quick add" });
    setDraft("");
    setSelected(t.Id);
  };

  const win = () => getCurrentWindow();
  const openMenu = (x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items });
  const toggleGroup = (id: string) => setFolded((f) => new Set(f.has(id) ? [...f].filter((x) => x !== id) : [...f, id]));

  return (
    <div className="relative flex h-full flex-col bg-bg text-text">
      <header data-tauri-drag-region className="flex h-8 shrink-0 items-stretch border-b border-line bg-side">
        <span data-tauri-drag-region className="pointer-events-none flex items-center pl-3.5 text-12 text-muted">
          Tasks · Project Life
        </span>
        <div data-tauri-drag-region className="flex-1" />
        <WinButton
          title={onTop ? "Stop keeping on top" : "Keep on top"}
          pressed={onTop}
          onClick={() => {
            const next = !onTop;
            setOnTop(next);
            if (inTauri) void win().setAlwaysOnTop(next);
          }}
        >
          <Pin size={13} className={onTop ? "text-accent" : undefined} />
        </WinButton>
        <WinButton title="Minimize" onClick={() => inTauri && void win().minimize()}>
          <Minus size={16} />
        </WinButton>
        <WinButton title="Close" close onClick={() => inTauri && void taskStore().flush().finally(() => win().close())}>
          <X size={17} />
        </WinButton>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3.5">
        <SegmentedControl
          label="View"
          fill
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: "Today" },
            { value: "upcoming", label: "Upcoming" },
            { value: "all", label: "All" },
          ]}
        />
        <label className={clsx("flex h-11 items-center gap-2.5 rounded-[13px] border bg-panel pr-1.5 pl-3 text-muted", parsed ? "border-accent" : "border-line")}>
          <Plus size={16} strokeWidth={2} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              else if (e.key === "Escape") setDraft("");
            }}
            placeholder="Add a task…"
            aria-label="Add a task"
            className="h-full min-w-0 flex-1 bg-transparent text-14 text-text outline-none placeholder:text-muted"
          />
          {parsed && (
            <span className="shrink-0 rounded-[8px] bg-accent-soft px-2 py-1 text-11 font-medium text-accent">
              {parsed.due ? formatDue(parsed.due, parsed.time, startOfDay(now)) : "Someday"}
            </span>
          )}
        </label>
      </div>

      <div ref={listBox} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-2 pb-6">
        {groups.map((g) => {
          const open = !folded.has(g.id);
          return (
            <div key={g.id} className="flex flex-col">
              <button
                aria-expanded={open}
                onClick={() => toggleGroup(g.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const { x, y } = menuPoint(e);
                  const ids = groups.map((x) => x.id);
                  openMenu(
                    x,
                    y,
                    groupMenu(g, {
                      fold: {
                        open,
                        toggle: () => toggleGroup(g.id),
                        setAll: (all) => setFolded((f) => (all ? new Set([...f].filter((id) => !ids.includes(id))) : new Set([...f, ...ids]))),
                        anyOpen: ids.some((id) => !folded.has(id)),
                        anyFolded: ids.some((id) => folded.has(id)),
                      },
                    }),
                  );
                }}
                className={clsx("flex h-7 items-center gap-2 px-1 font-mono text-11 tracking-[0.12em] uppercase", g.danger ? "text-danger" : "text-muted")}
              >
                <ChevronRight size={11} strokeWidth={2.6} style={{ transform: open ? "rotate(90deg)" : undefined }} />
                {g.label}
                <span className="text-muted">{g.tasks.length}</span>
                <span className="h-px flex-1 bg-line" />
              </button>
              {open && (
                <div role="list" aria-label={g.label} className="flex flex-col gap-0.5">
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.Id}
                      compact
                      task={t}
                      kind={g.kind}
                      now={now}
                      selected={t.Id === selected}
                      tabbable={t.Id === (selected ?? visibleIds[0])}
                      settling={settling.has(t.Id)}
                      showList={false}
                      laterOpen={laterFor === t.Id}
                      onToggle={() => toggle(t)}
                      onSelect={() => setSelected(t.Id)}
                      onOpen={() => openInMain(t.Id)}
                      onLater={(o) => setLaterFor(o ? t.Id : null)}
                      onMenu={(x, y) => openMenu(x, y, taskMenu(t, { open: () => openInMain(t.Id), pickDate: () => openInMain(t.Id), rename: () => openInMain(t.Id) }))}
                      onKeyDown={(e) => onRowKey(e, t)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {groups.length === 0 && <div className="px-4 py-10 text-center text-13 text-muted">Nothing here. Add a task above.</div>}
      </div>
      <Toaster />
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <AppMenu />
      <Tooltips />
    </div>
  );
}

function WinButton({ title, close, pressed, onClick, children }: { title: string; close?: boolean; pressed?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={title}
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={clsx("flex w-[42px] items-center justify-center text-muted transition-colors", close ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-panel2 hover:text-text")}
    >
      {children}
    </button>
  );
}
