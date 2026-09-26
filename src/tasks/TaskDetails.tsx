import clsx from "clsx";
import { ArrowDown, ArrowUp, Check, ExternalLink, FileText, ListPlus, Maximize2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { titleOf } from "../lib/api";
import { priorityColor, type PriorityValue } from "../lib/notebook";
import { useNotes } from "../notes/NotesContext";
import { Checkbox } from "../ui/Checkbox";
import { SectionLabel } from "../ui/bits";
import {
  addSubtask,
  deleteSubtask,
  deleteTasks,
  moveSubtask,
  renameTask,
  repeatLabel,
  setDescription,
  setPriority,
  subtaskToTask,
  toggleSubtask,
  toggleTask,
} from "./actions";
import { listFor } from "./lists";
import { listMenu, repeatMenu } from "./menus";
import { subtaskProgress, type Subtask, type Task } from "./model";
import { dueLabel, dueTone, shortDate } from "./views";

interface Props {
  task: Task | null;
  now: Date;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  onOpen: () => void;
  onPickDate: (anchor: DOMRect) => void;
  titleRef: Ref<HTMLTextAreaElement>;
}

const toneClass = { danger: "text-danger", accent: "text-text", muted: "text-text" };
const priorities: { p: PriorityValue; label: string }[] = [
  { p: 0, label: "None" },
  { p: 1, label: "Low" },
  { p: 2, label: "Med" },
  { p: 3, label: "High" },
];

// The details panel beside the list (Tasks.dc.html): the selected task's
// title, description, due date, repeat, list, priority and subtasks, and the
// note it came from.
export default function TaskDetails({ task, now, openMenu, onOpen, onPickDate, titleRef }: Props) {
  if (!task) {
    return (
      <aside aria-label="Task details" className="flex w-[340px] shrink-0 flex-col items-center justify-center gap-2 border-l border-line bg-side px-8 text-center">
        <span className="text-14 font-medium">No task selected</span>
        <span className="text-13 leading-[1.5] text-muted">Pick a task to see its description, subtasks and details here.</span>
      </aside>
    );
  }
  return <Details key={task.Id} task={task} now={now} openMenu={openMenu} onOpen={onOpen} onPickDate={onPickDate} titleRef={titleRef} />;
}

function Details({ task, now, openMenu, onOpen, onPickDate, titleRef }: Props & { task: Task }) {
  const n = useNotes();
  const done = Boolean(task.Completed);
  const priority = (task.Priority ?? 0) as PriorityValue;
  const list = listFor(task.List);
  const subs = task.Subtasks ?? [];
  const progress = subtaskProgress(task);
  const [adding, setAdding] = useState(false);
  const [subDraft, setSubDraft] = useState("");
  const menuAt = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, items);
  };
  const rightClick = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    e.preventDefault();
    const { x, y } = menuPoint(e);
    openMenu(x, y, items);
  };

  const subtaskMenu = (s: Subtask, i: number): MenuItem[] => [
    s.Done
      ? { label: "Mark not done", icon: <RotateCcw size={13} />, onSelect: () => toggleSubtask(task, s) }
      : { label: "Mark done", icon: <Check size={13} />, onSelect: () => toggleSubtask(task, s) },
    { type: "separator" },
    { label: "Move up", icon: <ArrowUp size={13} />, disabled: i === 0, onSelect: () => moveSubtask(task, s.Id, subs[i - 1].Id) },
    { label: "Move down", icon: <ArrowDown size={13} />, disabled: i === subs.length - 1, onSelect: () => moveSubtask(task, s.Id, subs[i + 2]?.Id ?? null) },
    { label: "Make it a task", icon: <ListPlus size={13} />, onSelect: () => subtaskToTask(task, s) },
    { type: "separator" },
    { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteSubtask(task, s) },
  ];

  return (
    <aside aria-label="Task details" className="flex w-[340px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line bg-side px-[22px] py-6">
      <div className="flex items-start gap-3">
        <Checkbox
          checked={done}
          onChange={() => toggleTask(task)}
          label={`${done ? "Mark not done" : "Mark done"}: ${task.Title}`}
          size={24}
          tone={priority ? priorityColor[priority] : "var(--faint)"}
          className="-my-2 -mr-2 -ml-2.5"
        />
        <TitleField task={task} titleRef={titleRef} />
        <button
          aria-label="Open task details"
          title="Open task"
          onClick={onOpen}
          className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-muted hover:text-text"
        >
          <Maximize2 size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="pl-desc" className="flex justify-between font-mono text-11 tracking-[0.12em] text-muted">
          <span>DESCRIPTION</span>
          <span className="tracking-normal">Markdown</span>
        </label>
        <textarea
          id="pl-desc"
          rows={4}
          value={task.Notes ?? ""}
          onChange={(e) => setDescription(task, e.target.value)}
          placeholder="Add details, links or steps…"
          className="w-full resize-none rounded-[14px] border border-line bg-panel px-3.5 py-3 text-14 leading-[1.55] text-text outline-none placeholder:text-faint focus:border-faint"
        />
      </div>

      <div className="flex flex-col overflow-hidden rounded-[14px] border border-line">
        <PropRow label="Due">
          <button onClick={(e) => onPickDate(e.currentTarget.getBoundingClientRect())} className={clsx("h-[30px] rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2", toneClass[dueTone(task, now)])}>
            {dueLabel(task, now)}
          </button>
        </PropRow>
        <PropRow label="Repeat">
          <button onClick={(e) => menuAt(e, repeatMenu(task))} className="h-[30px] rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2">
            {task.Repeat ? repeatLabel[task.Repeat] : "Never"}
          </button>
        </PropRow>
        <PropRow label="List">
          <button onClick={(e) => menuAt(e, listMenu(task))} className="flex h-[30px] items-center gap-2 rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2">
            <span className="h-2 w-2 rounded-[3px]" style={{ background: list.color }} />
            {list.name}
          </button>
        </PropRow>
        <div className="flex h-[50px] items-center justify-between gap-3 pr-2 pl-3.5 text-13">
          <span className="text-muted">Priority</span>
          <div role="radiogroup" aria-label="Priority" className="flex gap-[3px] rounded-[10px] bg-panel p-[3px]">
            {priorities.map(({ p, label }) => (
              <button
                key={p}
                role="radio"
                aria-checked={priority === p}
                onClick={() => setPriority(task, p)}
                className={clsx("h-[30px] rounded-[8px] px-2.5 text-12 font-medium", priority === p ? (p ? "text-accent-ink" : "bg-panel2 text-text") : "text-muted hover:text-text")}
                style={priority === p && p ? { background: priorityColor[p] } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>SUBTASKS</SectionLabel>
          <span className="font-mono text-11 text-muted">{progress.total ? `${progress.done} of ${progress.total}` : "None yet"}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-[4px] bg-panel2">
          <div className="h-full rounded-[4px] bg-accent2 transition-[width] duration-300" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
        </div>
        {subs.map((s, i) => (
          <button
            key={s.Id}
            role="checkbox"
            aria-checked={s.Done}
            onClick={() => toggleSubtask(task, s)}
            onContextMenu={(e) => rightClick(e, subtaskMenu(s, i))}
            className={clsx("flex min-h-10 items-center gap-3 px-1 text-left text-14", s.Done ? "text-muted line-through" : "text-text")}
          >
            <span
              className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] text-accent-ink"
              style={{ border: `1.5px solid ${s.Done ? "var(--accent2)" : "var(--faint)"}`, background: s.Done ? "var(--accent2)" : "transparent" }}
            >
              {s.Done && (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 12.5 4 4 8-9" />
                </svg>
              )}
            </span>
            {s.Text}
          </button>
        ))}
        {adding ? (
          <label className="flex h-10 items-center gap-3 px-1 text-13 text-muted">
            <Plus size={18} strokeWidth={2} />
            <input
              autoFocus
              value={subDraft}
              onChange={(e) => setSubDraft(e.target.value)}
              onBlur={() => {
                if (subDraft.trim()) addSubtask(task, subDraft);
                setSubDraft("");
                setAdding(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (subDraft.trim()) addSubtask(task, subDraft);
                  setSubDraft("");
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setSubDraft("");
                  setAdding(false);
                }
              }}
              placeholder="Add a subtask and press Enter"
              aria-label="Add a subtask"
              className="min-w-0 flex-1 bg-transparent text-14 text-text outline-none placeholder:text-faint"
            />
          </label>
        ) : (
          <button onClick={() => setAdding(true)} className="flex h-10 items-center gap-3 px-1 text-13 text-muted hover:text-text">
            <Plus size={18} strokeWidth={2} />
            Add a subtask
          </button>
        )}
      </div>

      {task.Note && (
        <button
          onClick={() => void n.activate(task.Note!)}
          onContextMenu={(e) =>
            rightClick(e, [
              { label: "Open note", icon: <FileText size={13} />, onSelect: () => void n.activate(task.Note!) },
              { label: "Open in new tab", icon: <ExternalLink size={13} />, onSelect: () => void n.activate(task.Note!, true) },
            ])
          }
          className="flex items-center gap-3 rounded-[14px] border border-line bg-panel p-3 text-left hover:border-faint"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
            <FileText size={16} strokeWidth={1.9} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-13 font-medium">{titleOf(task.Note)}</span>
            <span className="text-12 text-muted">{task.NoteTodo ? "Came from a to-do in this note" : "Linked note"}</span>
          </span>
        </button>
      )}

      <div className="flex-1" />
      <div className="flex items-center justify-between border-t border-line pt-3.5">
        <span className="text-12 text-muted">Created {shortDate(task.Created)}</span>
        <button
          aria-label="Delete task"
          title="Move to Recycle Bin"
          onClick={() => deleteTasks([task])}
          className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:border-danger hover:text-danger"
        >
          <Trash2 size={16} strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[46px] items-center justify-between border-b border-line px-3.5 text-13">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}

// The title, edited in place: it saves when you leave it or press Enter, and
// Esc puts it back.
export function TitleField({ task, titleRef, className }: { task: Task; titleRef?: Ref<HTMLTextAreaElement>; className?: string }) {
  const [value, setValue] = useState(task.Title);
  const box = useRef<HTMLTextAreaElement | null>(null);
  const done = Boolean(task.Completed);
  useEffect(() => setValue(task.Title), [task.Title]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  const setRefs = (el: HTMLTextAreaElement | null) => {
    box.current = el;
    if (typeof titleRef === "function") titleRef(el);
    else if (titleRef) (titleRef as { current: HTMLTextAreaElement | null }).current = el;
  };
  return (
    <textarea
      ref={setRefs}
      rows={1}
      aria-label="Task title"
      spellCheck={false}
      value={value}
      onChange={(e) => setValue(e.target.value.replace(/[\r\n]+/g, " "))}
      onBlur={() => (value.trim() ? renameTask(task, value) : setValue(task.Title))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setValue(task.Title);
          requestAnimationFrame(() => box.current?.blur());
        }
      }}
      className={
        className ??
        clsx(
          "m-0 block min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 font-head text-22 leading-[1.2] font-bold outline-none",
          done ? "text-muted line-through" : "text-text",
        )
      }
    />
  );
}
