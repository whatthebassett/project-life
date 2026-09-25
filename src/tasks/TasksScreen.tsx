import clsx from "clsx";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ContextMenu, { type MenuItem, type MenuState } from "../components/ContextMenu";
import { dayLabel, useNow } from "../lib/dates";
import { motionReduced } from "../lib/motion";
import { priorityColor, priorityLabel, type PriorityValue } from "../lib/notebook";
import { useSettings } from "../lib/SettingsContext";
import { SegmentedControl } from "../ui/SegmentedControl";
import { toast } from "../ui/Toast";
import { addTask, deleteTasks, setTaskDue, toggleTask } from "./actions";
import Calendar from "./Calendar";
import { formatTime, startOfDay, ymd, daysBetween, formatDate } from "./dates";
import { listFor } from "./lists";
import { taskMenu } from "./menus";
import type { Task } from "./model";
import { subscribeTaskRequests, takeTaskRequest } from "./nav";
import { parseCapture } from "./quick";
import RecycleBinPopup from "./RecycleBinPopup";
import TaskDetails from "./TaskDetails";
import TaskPopup from "./TaskPopup";
import TaskRow from "./TaskRow";
import TasksSidebar from "./TasksSidebar";
import { useTasks } from "./useTasks";
import { groupTasks, inView, listOfView, parseView, viewHeading, type ViewId } from "./views";
import { openTasksWindow } from "./window";
import { inTauri } from "../lib/api";

const SETTLE_MS = 650;

// The Tasks screen (Tasks.dc.html): views and lists on the left, quick add
// and the grouped list in the middle, the selected task's details on the
// right. Double-click a task, or press Enter on it, for the full pop-up
// (TaskFull.dc.html).
export default function TasksScreen() {
  const { tasks, lists, recycled, error, store } = useTasks();
  const { settings, update } = useSettings();
  const now = useNow();
  const view = parseView(settings.TasksView);
  const groupBy = settings.TasksGroupBy === "list" ? "list" : "date";
  const folded = useMemo(() => new Set(settings.TasksFolded ?? ["completed"]), [settings.TasksFolded]);
  const setView = useCallback((v: ViewId) => update({ TasksView: v }), [update]);

  const [draft, setDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [laterFor, setLaterFor] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [calendar, setCalendar] = useState<{ task: Task; anchor: DOMRect } | null>(null);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [settling, setSettling] = useState<ReadonlySet<string>>(() => new Set());
  const input = useRef<HTMLInputElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);

  const listView = listOfView(view);
  const undated = view === "someday" ? "none" : view === "upcoming" ? "tomorrow" : "today";
  const parsed = useMemo(() => (draft.trim() ? parseCapture(draft, now, { list: listView ?? undefined, undated }) : null), [draft, now, listView, undated]);

  const shown = useMemo(() => tasks.filter((t) => inView(t, view, now) || settling.has(t.Id)), [tasks, view, now, settling]);
  const groups = useMemo(() => groupTasks(shown, listView ? "date" : groupBy, lists.map((l) => listFor(l.Id)), now, settling), [shown, groupBy, listView, lists, now, settling]);
  const isOpen = (id: string) => view === "completed" || !folded.has(id);
  const visibleIds = useMemo(() => groups.flatMap((g) => (isOpen(g.id) ? g.tasks.map((t) => t.Id) : [])), [groups, folded, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = tasks.find((t) => t.Id === selectedId) ?? null;
  const popupTask = tasks.find((t) => t.Id === popupId) ?? null;

  // Keep something selected: the first task shown, once there is one.
  useEffect(() => {
    if (!selected && visibleIds.length && !selectedId) setSelectedId((cur) => cur ?? visibleIds[0]);
  }, [selected, selectedId, visibleIds]);

  const rowEl = useCallback((id: string) => listBox.current?.querySelector<HTMLElement>(`[data-task-id="${id}"]`) ?? null, []);
  const focusRow = useCallback(
    (id: string | undefined) => {
      if (!id) return;
      setSelectedId(id);
      requestAnimationFrame(() => {
        const el = rowEl(id);
        el?.focus();
        el?.scrollIntoView({ block: "nearest" });
      });
    },
    [rowEl],
  );

  // Asked for from elsewhere: open a task, show a list, or start a new one.
  useEffect(() => {
    const handle = () => {
      const req = takeTaskRequest();
      if (!req) return;
      if (req.kind === "new") requestAnimationFrame(() => input.current?.focus());
      else if (req.kind === "list") setView(`list:${req.id}`);
      else {
        const t = store.getState().file.Tasks.find((x) => x.Id === req.id);
        if (!t) return;
        if (!inView(t, view, new Date())) setView(t.Completed ? "completed" : "all");
        focusRow(t.Id);
        if (req.popup) setPopupId(t.Id);
      }
    };
    handle();
    return subscribeTaskRequests(handle);
  }, [focusRow, setView, store, view]);

  const toggle = (task: Task) => {
    const done = !task.Completed;
    toggleTask(task);
    if (done && !motionReduced()) {
      setSettling((s) => new Set(s).add(task.Id));
      setTimeout(
        () =>
          setSettling((s) => {
            const next = new Set(s);
            next.delete(task.Id);
            return next;
          }),
        SETTLE_MS,
      );
    }
  };

  const add = () => {
    if (!parsed) return;
    const task = addTask({ ...parsed, how: "Created with quick add" });
    setDraft("");
    setSelectedId(task.Id);
    // Added somewhere this view doesn't show: say where, with a way there.
    if (!inView(task, view, new Date())) {
      const where: ViewId = !task.Due ? "someday" : task.Due > ymd(startOfDay(new Date())) ? "upcoming" : "today";
      toast(`Added “${task.Title}” to ${viewHeading(where)}`, () => setView(where), "Show");
    }
    requestAnimationFrame(() => rowEl(task.Id)?.scrollIntoView({ block: "nearest" }));
  };

  const pickDate = (task: Task, anchor: DOMRect) => setCalendar({ task, anchor });

  const rowMenu = (task: Task, x: number, y: number) =>
    openMenu(
      x,
      y,
      taskMenu(task, {
        open: () => setPopupId(task.Id),
        pickDate: () => pickDate(task, rowEl(task.Id)?.getBoundingClientRect() ?? new DOMRect(x, y, 0, 0)),
        rename: () => requestAnimationFrame(() => titleRef.current?.focus()),
      }),
    );

  const onRowKey = (e: React.KeyboardEvent, task: Task) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.altKey || e.metaKey) return;
    const i = visibleIds.indexOf(task.Id);
    const handled = () => e.preventDefault();
    if (e.key === " ") {
      handled();
      toggle(task);
    } else if (e.key === "Enter") {
      handled();
      setPopupId(task.Id);
    } else if (e.key === "F2") {
      handled();
      titleRef.current?.focus();
    } else if (e.key === "Delete") {
      handled();
      focusRow(visibleIds[i + 1] ?? visibleIds[i - 1]);
      deleteTasks([task]);
    } else if (e.key === "ArrowDown") {
      handled();
      focusRow(visibleIds[i + 1]);
    } else if (e.key === "ArrowUp") {
      handled();
      if (i <= 0) input.current?.focus();
      else focusRow(visibleIds[i - 1]);
    } else if (e.key === "Home") {
      handled();
      focusRow(visibleIds[0]);
    } else if (e.key === "End") {
      handled();
      focusRow(visibleIds[visibleIds.length - 1]);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      handled();
      const r = e.currentTarget.getBoundingClientRect();
      rowMenu(task, r.right - 200, r.bottom);
    }
  };

  const toggleGroup = (id: string) => {
    const next = new Set(folded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ TasksFolded: [...next] });
  };

  const rovingId = selectedId && visibleIds.includes(selectedId) ? selectedId : visibleIds[0];

  return (
    <>
      <TasksSidebar tasks={tasks} lists={lists} now={now} view={view} onView={setView} onPopOut={inTauri ? () => void openTasksWindow() : undefined} openMenu={openMenu} store={store} />

      <section className="flex min-w-0 flex-1 flex-col gap-[18px] px-8 pt-[26px]">
        <header className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-12 tracking-[0.14em] text-muted">{dayLabel(now)}</span>
            <h2 className="m-0 truncate font-head text-40 leading-none font-bold tracking-[-0.02em]">{viewHeading(view)}</h2>
          </div>
          {!listView && (
            <div className="flex items-center gap-2">
              <span className="text-12 text-muted">Group by</span>
              <SegmentedControl
                label="Group by"
                value={groupBy}
                onChange={(g) => update({ TasksGroupBy: g })}
                options={[
                  { value: "date", label: "Date" },
                  { value: "list", label: "List" },
                ]}
              />
            </div>
          )}
        </header>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="pl-task"
            className={clsx("flex h-[54px] items-center gap-3 rounded-[16px] border bg-panel pr-2.5 pl-4 text-muted", parsed ? "border-accent" : "border-line")}
          >
            <Plus size={18} strokeWidth={2} />
            <input
              id="pl-task"
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                } else if (e.key === "Escape" && draft) {
                  e.preventDefault();
                  setDraft("");
                } else if (e.key === "ArrowDown" && !draft && visibleIds.length) {
                  e.preventDefault();
                  focusRow(rovingId);
                }
              }}
              placeholder="Add a task, like: Pay rent fri 5pm !high #personal"
              aria-label="Add a task"
              autoComplete="off"
              className="h-full min-w-0 flex-1 border-0 bg-transparent text-15 text-text outline-none placeholder:text-muted/80"
            />
            <button onClick={add} className="h-[38px] rounded-[11px] bg-accent px-4 text-13 font-semibold text-accent-ink">
              Add
            </button>
          </label>
          {parsed && <Preview parsed={parsed} now={now} />}
        </div>

        {error && <div className="rounded-[12px] border border-danger/40 bg-danger/10 px-4 py-3 text-13 text-danger">{error}</div>}

        <div ref={listBox} className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto pb-[60px]">
          {groups.map((g) => {
            const open = isOpen(g.id);
            return (
              <div key={g.id} className="flex flex-col gap-0.5">
                <button
                  aria-expanded={open}
                  onClick={() => view !== "completed" && toggleGroup(g.id)}
                  className={clsx("flex h-8 items-center gap-2.5 px-1 text-left font-mono text-11 tracking-[0.12em] uppercase", g.danger ? "text-danger" : "text-muted")}
                >
                  <ChevronRight size={11} strokeWidth={2.6} className="transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }} />
                  <span>{g.label}</span>
                  <span className="text-muted">{g.tasks.length}</span>
                  <span className="h-px flex-1 bg-line" />
                </button>
                {open && (
                  <div role="list" aria-label={g.label} className="flex flex-col gap-0.5">
                    {g.tasks.map((t) => (
                      <TaskRow
                        key={t.Id}
                        task={t}
                        kind={g.kind}
                        now={now}
                        selected={t.Id === selectedId}
                        tabbable={t.Id === rovingId}
                        settling={settling.has(t.Id)}
                        showList={groupBy === "date" && !listView}
                        laterOpen={laterFor === t.Id}
                        onToggle={() => toggle(t)}
                        onSelect={() => setSelectedId(t.Id)}
                        onOpen={() => setPopupId(t.Id)}
                        onLater={(o) => {
                          setLaterFor(o ? t.Id : null);
                          if (!o) requestAnimationFrame(() => rowEl(t.Id)?.focus());
                        }}
                        onMenu={(x, y) => rowMenu(t, x, y)}
                        onKeyDown={(e) => onRowKey(e, t)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {groups.length === 0 && <EmptyView view={view} />}
          {view === "completed" && (
            <button onClick={() => setBinOpen(true)} className="flex h-10 w-fit items-center gap-2 rounded-[10px] px-2 text-13 text-muted hover:bg-panel hover:text-text">
              <Trash2 size={14} strokeWidth={1.8} />
              Recycle Bin
              <span className="font-mono text-12">{recycled.length}</span>
            </button>
          )}
        </div>
      </section>

      <TaskDetails
        task={selected}
        now={now}
        openMenu={openMenu}
        onOpen={() => selected && setPopupId(selected.Id)}
        onPickDate={(anchor) => selected && pickDate(selected, anchor)}
        titleRef={titleRef}
      />

      {calendar && (
        <Calendar
          anchor={calendar.anchor}
          value={calendar.task.Due ?? null}
          time={calendar.task.DueTime ?? null}
          onPick={(due, time) => {
            setTaskDue(calendar.task, due, time);
            setCalendar(null);
          }}
          onClear={
            calendar.task.Due
              ? () => {
                  setTaskDue(calendar.task, null, null);
                  setCalendar(null);
                }
              : undefined
          }
          clearLabel="Someday"
          onClose={() => setCalendar(null)}
        />
      )}
      {popupTask && <TaskPopup task={popupTask} onClose={() => setPopupId(null)} openMenu={openMenu} />}
      {binOpen && <RecycleBinPopup onClose={() => setBinOpen(false)} />}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}

// What quick add has read so far: title, when, priority, list and tags.
function Preview({ parsed, now }: { parsed: ReturnType<typeof parseCapture>; now: Date }) {
  const today = startOfDay(now);
  const when = parsed.due
    ? (() => {
        const d = daysBetween(ymd(today), parsed.due);
        const day = d === 0 ? "Today" : d === 1 ? "Tomorrow" : formatDate(parsed.due, today);
        return parsed.time ? `${day} · ${formatTime(parsed.time)}` : day;
      })()
    : "Someday";
  const p = (parsed.priority ?? 0) as PriorityValue;
  const list = listFor(parsed.list);
  const chip = "flex h-[26px] items-center rounded-[8px] px-2.5";
  return (
    <div aria-live="polite" className="flex flex-wrap gap-1.5 px-1 text-12">
      <span className={clsx(chip, "bg-accent-soft font-medium text-accent")}>{parsed.title}</span>
      <span className={clsx(chip, "border border-line bg-panel")}>{when}</span>
      <span className={clsx(chip, "border border-line bg-panel")} style={{ color: priorityColor[p] }}>
        {priorityLabel[p]} priority
      </span>
      <span className={clsx(chip, "gap-1.5 border border-line bg-panel")}>
        <span className="h-2 w-2 rounded-[3px]" style={{ background: list.color }} />
        {list.name}
      </span>
      {parsed.tags?.map((t) => (
        <span key={t} className={clsx(chip, "bg-accent-soft font-medium text-accent")}>
          #{t}
        </span>
      ))}
    </div>
  );
}

function EmptyView({ view }: { view: ViewId }) {
  const text: Record<string, string> = {
    today: "Nothing due today. Add one above, like “Call the bank 3pm”.",
    upcoming: "Nothing coming up. Tasks with a date after today show here.",
    all: "No tasks yet. Add one above, like “Pay rent fri 5pm !high”.",
    someday: "Nothing for someday. Tasks without a date wait here.",
    completed: "Nothing completed yet.",
  };
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-line px-8 text-center text-14 text-muted">
      {text[view] ?? "No tasks on this list yet. Add one above."}
    </div>
  );
}
