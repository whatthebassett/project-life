// The small menus tasks share: repeat, reminder, estimate, list, priority,
// and the right-click menus for a task, a group's heading and a habit in
// Today.
import {
  AlarmClock,
  CalendarDays,
  CalendarX,
  Check,
  CheckCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  EyeOff,
  Flag,
  FoldVertical,
  LayoutList,
  List,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  UnfoldVertical,
} from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { saveHabit, stepDay, toggleDay } from "../habits/actions";
import { doneOn, type Habit } from "../habits/model";
import { habitStore } from "../habits/useHabits";
import { showHabit } from "../shell/go";
import { toast } from "../ui/Toast";
import { priorityColor, priorityLabel, type PriorityValue } from "../lib/notebook";
import {
  applyLater,
  completeTasks,
  deleteTasks,
  duplicateTask,
  estimateLabel,
  estimates,
  laterChoices,
  moveTasksToTomorrow,
  patch,
  reminderLabel,
  repeatLabel,
  setList,
  setPriority,
  setTaskDue,
  toggleTask,
} from "./actions";
import { taskLists } from "./lists";
import type { ReminderId, RepeatId, Task } from "./model";
import type { Group } from "./views";

const dot = (color: string) => <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />;

export function repeatMenu(task: Task): MenuItem[] {
  return [
    { label: "Never", checked: !task.Repeat, onSelect: () => patch(task, { Repeat: null }, "Stopped repeating") },
    { type: "separator" },
    ...(Object.keys(repeatLabel) as RepeatId[]).map<MenuItem>((r) => ({
      label: repeatLabel[r],
      checked: task.Repeat === r,
      onSelect: () => patch(task, { Repeat: r }, `Repeats ${repeatLabel[r].toLowerCase()}`),
    })),
  ];
}

export function reminderMenu(task: Task): MenuItem[] {
  return [
    { label: "None", checked: !task.Reminder, onSelect: () => patch(task, { Reminder: null, Reminded: null }) },
    { type: "separator" },
    ...(Object.keys(reminderLabel) as ReminderId[]).map<MenuItem>((r) => ({
      label: reminderLabel[r],
      checked: task.Reminder === r,
      // Times before the due time need one to count from.
      disabled: !task.Due || (["at", "10m", "30m", "1h"].includes(r) && !task.DueTime),
      onSelect: () => patch(task, { Reminder: r, Reminded: null }, `Reminder set: ${reminderLabel[r]}`),
    })),
  ];
}

export function estimateMenu(task: Task): MenuItem[] {
  return [
    { label: "None", checked: !task.Estimate, onSelect: () => patch(task, { Estimate: null }) },
    { type: "separator" },
    ...estimates.map<MenuItem>((m) => ({ label: estimateLabel(m), checked: task.Estimate === m, onSelect: () => patch(task, { Estimate: m }, `Estimate set to ${estimateLabel(m)}`) })),
  ];
}

export function listMenu(task: Task): MenuItem[] {
  return taskLists().map<MenuItem>((l) => ({ label: l.name, icon: dot(l.color), checked: task.List === l.id, onSelect: () => setList(task, l.id) }));
}

export function priorityMenu(task: Task): MenuItem[] {
  return ([3, 2, 1, 0] as PriorityValue[]).map<MenuItem>((p) => ({
    label: priorityLabel[p],
    checked: (task.Priority ?? 0) === p,
    icon: p ? <span className="h-[9px] w-[9px] rounded-full" style={{ background: priorityColor[p] }} /> : <span className="h-[9px] w-[9px] rounded-full border border-current opacity-60" />,
    onSelect: () => setPriority(task, p),
  }));
}

export interface RowMenuHandlers {
  open: () => void;
  pickDate: () => void;
  rename: () => void;
}

export function taskMenu(task: Task, h: RowMenuHandlers): MenuItem[] {
  const done = Boolean(task.Completed);
  return [
    done
      ? { label: "Mark not done", icon: <RotateCcw size={13} />, hint: "Space", onSelect: () => toggleTask(task) }
      : { label: "Complete", icon: <Check size={13} />, hint: "Space", onSelect: () => toggleTask(task) },
    { label: "Open", icon: <Maximize2 size={13} />, hint: "Enter", onSelect: h.open },
    { type: "separator" },
    {
      label: "Later",
      icon: <AlarmClock size={13} />,
      disabled: done,
      children: laterChoices(task, new Date()).map<MenuItem>((c) => ({ label: c.label, hint: c.hint, onSelect: () => applyLater(task, c) })),
    },
    { label: "Set due date…", icon: <CalendarDays size={13} />, onSelect: h.pickDate },
    { label: "Remove due date", icon: <CalendarX size={13} />, disabled: !task.Due, onSelect: () => setTaskDue(task, null, null) },
    { type: "separator" },
    { label: "Priority", icon: <Flag size={13} />, children: priorityMenu(task) },
    { label: "List", icon: <List size={13} />, children: listMenu(task) },
    { label: "Rename", hint: "F2", onSelect: h.rename },
    { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => duplicateTask(task) },
    { type: "separator" },
    { label: "Move to Recycle Bin", icon: <Trash2 size={13} />, hint: "Del", danger: true, onSelect: () => deleteTasks([task]) },
  ];
}

export interface GroupMenuHandlers {
  // Left out where groups can't be folded (the Completed view).
  fold?: { open: boolean; toggle: () => void; setAll: (open: boolean) => void; anyOpen: boolean; anyFolded: boolean };
  // Left out where there's only the one way to group.
  groupBy?: { value: "date" | "list"; set: (by: "date" | "list") => void };
}

// A group's heading: fold it or all of them, regroup, and act on every task
// in it at once. Completed tasks can only be cleared away.
export function groupMenu(g: Group, h: GroupMenuHandlers): MenuItem[] {
  const open = g.tasks.filter((t) => !t.Completed);
  const items: MenuItem[] = [];
  if (h.fold) {
    const f = h.fold;
    items.push(
      f.open ? { label: "Collapse", icon: <ChevronsDownUp size={13} />, onSelect: f.toggle } : { label: "Expand", icon: <ChevronsUpDown size={13} />, onSelect: f.toggle },
      { label: "Collapse all", icon: <FoldVertical size={13} />, disabled: !f.anyOpen, onSelect: () => f.setAll(false) },
      { label: "Expand all", icon: <UnfoldVertical size={13} />, disabled: !f.anyFolded, onSelect: () => f.setAll(true) },
    );
  }
  if (h.groupBy) {
    const by = h.groupBy;
    items.push({
      label: "Group by",
      icon: <LayoutList size={13} />,
      children: [
        { label: "Date", checked: by.value === "date", onSelect: () => by.set("date") },
        { label: "List", checked: by.value === "list", onSelect: () => by.set("list") },
      ],
    });
  }
  if (items.length) items.push({ type: "separator" });
  if (g.kind === "completed") {
    items.push({ label: "Clear completed", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteTasks(g.tasks) });
    return items;
  }
  items.push({ label: "Complete all", icon: <CheckCheck size={13} />, disabled: !open.length, onSelect: () => completeTasks(open) });
  if (g.kind === "overdue" || g.kind === "today") {
    items.push({ label: "Move all to tomorrow", icon: <AlarmClock size={13} />, disabled: !open.length, onSelect: () => moveTasksToTomorrow(open) });
  }
  items.push({ type: "separator" }, { label: "Move all to Recycle Bin", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteTasks(g.tasks) });
  return items;
}

const setInTasks = (id: string, on: boolean) => {
  const h = habitStore().getState().file.Habits.find((x) => x.Id === id);
  if (h) saveHabit({ ...h, InTasks: on });
};

// A habit among Today's tasks. Hiding it can't work while Settings shows
// every habit due today anyway.
export function habitTaskMenu(h: Habit, today: string, showsAll: boolean): MenuItem[] {
  const done = doneOn(h, today);
  const step = h.Kind === "time" ? "5 minutes" : "one";
  return [
    done
      ? { label: "Mark not done", icon: <RotateCcw size={13} />, onSelect: () => toggleDay(h, today) }
      : { label: "Mark done", icon: <Check size={13} />, onSelect: () => toggleDay(h, today) },
    ...(h.Kind === "check"
      ? []
      : ([
          { label: `Add ${step}`, icon: <Plus size={13} />, onSelect: () => stepDay(h, today, 1) },
          { label: `Remove ${step}`, icon: <Minus size={13} />, disabled: !(h.Log[today] ?? 0), onSelect: () => stepDay(h, today, -1) },
        ] as MenuItem[])),
    { type: "separator" },
    { label: "Open in Habits", icon: <Maximize2 size={13} />, onSelect: () => showHabit(h.Id) },
    {
      label: "Hide from Today",
      icon: <EyeOff size={13} />,
      disabled: showsAll,
      onSelect: () => {
        setInTasks(h.Id, false);
        toast(`Hid “${h.Name}” from Today`, () => setInTasks(h.Id, true));
      },
    },
  ];
}
