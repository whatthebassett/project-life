import clsx from "clsx";
import { AlignLeft, Clock3, FileText } from "lucide-react";
import { priorityColor, priorityLabel, type PriorityValue } from "../lib/notebook";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/icons";
import LaterMenu from "./LaterMenu";
import { listFor } from "./lists";
import { subtaskProgress, type Task } from "./model";
import { dueTone, rowDue, type Group } from "./views";

interface Props {
  task: Task;
  kind: Group["kind"];
  now: Date;
  selected: boolean;
  // In the Tab order (one row at a time; arrows move between them).
  tabbable: boolean;
  // Just checked off: stays put for a moment, struck through.
  settling: boolean;
  showList: boolean;
  laterOpen: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onOpen: () => void;
  onLater: (open: boolean) => void;
  onMenu: (x: number, y: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  // The compact rows of the popped-out window.
  compact?: boolean;
}

const toneClass = { danger: "text-danger", accent: "text-accent", muted: "text-muted" };

// One task in the list (Tasks.dc.html): checkbox in its priority color, the
// title and the first line of its description, then where it came from, its
// subtasks, list, due date, priority flag and, when selected, Later.
export default function TaskRow({ task, kind, now, selected, tabbable, settling, showList, laterOpen, onToggle, onSelect, onOpen, onLater, onMenu, onKeyDown, compact }: Props) {
  const done = Boolean(task.Completed) && !settling;
  const checked = Boolean(task.Completed);
  const priority = (task.Priority ?? 0) as PriorityValue;
  const due = rowDue(task, kind, now);
  const subs = subtaskProgress(task);
  const list = listFor(task.List);
  const firstLine = (task.Notes ?? "").split("\n").find((l) => l.trim())?.replace(/^[#>*\-\s[\]x]+/i, "") ?? "";
  const showLater = !checked && (selected || laterOpen);

  return (
    <div
      role="listitem"
      data-row="task"
      data-task-id={task.Id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${task.Title}${due ? `, due ${due}` : ""}${checked ? ", completed" : ""}`}
      aria-current={selected ? "true" : undefined}
      onFocus={(e) => e.target === e.currentTarget && onSelect()}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect();
        onMenu(e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button[data-check], [role=menu], [data-later-button]")) return;
        onOpen();
      }}
      className={clsx(
        "relative flex items-center gap-3 rounded-[14px] border outline-none focus-visible:ring-2 focus-visible:ring-accent",
        compact ? "min-h-[48px] py-1 pr-2 pl-0.5" : "min-h-[58px] py-1.5 pr-2.5 pl-1",
        selected ? "border-line bg-panel" : "border-transparent hover:bg-panel/60",
        settling && "task-settling",
      )}
    >
      <span data-check>
        <Checkbox
          checked={checked}
          onChange={onToggle}
          label={`${checked ? "Mark not done" : "Mark done"}: ${task.Title}`}
          tone={priority ? priorityColor[priority] : "var(--faint)"}
        />
      </span>
      <button tabIndex={-1} onClick={onSelect} className="flex min-w-0 flex-1 flex-col gap-[3px] py-1 text-left">
        <span className={clsx("w-full truncate font-medium", compact ? "text-14" : "text-15", done ? "text-muted line-through" : "text-text")}>{task.Title}</span>
        {firstLine && !compact && (
          <span className="flex w-full items-center gap-1.5 overflow-hidden text-12 whitespace-nowrap text-muted">
            <AlignLeft size={12} strokeWidth={2} className="shrink-0" />
            <span className="truncate">{firstLine}</span>
          </span>
        )}
        {!firstLine && selected && !checked && !compact && <span className="text-12 text-muted">+ Add a description</span>}
      </button>
      <div className="flex shrink-0 items-center gap-2 text-12">
        {task.Note && (
          <span title="From a note" className="flex text-muted">
            <FileText size={14} strokeWidth={1.9} />
          </span>
        )}
        {subs.total > 0 && (
          <span className="font-mono text-11 text-muted">
            {subs.done}/{subs.total}
          </span>
        )}
        {showList && !compact && (
          <span className="flex h-6 items-center gap-1.5 rounded-[7px] bg-panel2 px-2 text-muted">
            <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: list.color }} />
            {list.name}
          </span>
        )}
        {due && <span className={clsx("min-w-16 text-right font-medium", toneClass[dueTone(task, now)])}>{due}</span>}
        <span className="flex w-4 justify-center" style={{ color: priority ? priorityColor[priority] : undefined }}>
          {priority > 0 && (
            <span role="img" aria-label={`${priorityLabel[priority]} priority`} className="flex">
              <Icon name="flag" size={14} stroke={1.5} fill="currentColor" />
            </span>
          )}
        </span>
        {showLater && (
          <button
            data-later-button
            aria-haspopup="menu"
            aria-expanded={laterOpen}
            onClick={(e) => {
              e.stopPropagation();
              onLater(!laterOpen);
            }}
            className="flex h-8 items-center gap-1.5 rounded-[9px] border border-line bg-bg px-2.5 text-12 font-medium hover:border-faint"
          >
            <Clock3 size={13} strokeWidth={2} />
            Later
          </button>
        )}
      </div>
      {laterOpen && <LaterMenu task={task} onClose={() => onLater(false)} />}
    </div>
  );
}
