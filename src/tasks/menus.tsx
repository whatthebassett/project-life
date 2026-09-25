// The small menus tasks share: repeat, reminder, estimate, list, priority,
// and the right-click menu for a task.
import { AlarmClock, CalendarDays, CalendarX, Check, Copy, Flag, List, Maximize2, RotateCcw, Trash2 } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { priorityColor, priorityLabel, type PriorityValue } from "../lib/notebook";
import {
  applyLater,
  deleteTasks,
  duplicateTask,
  estimateLabel,
  estimates,
  laterChoices,
  patch,
  reminderLabel,
  repeatLabel,
  setList,
  setPriority,
  setTaskDue,
  toggleTask,
} from "./actions";
import { currentLists } from "./lists";
import type { ReminderId, RepeatId, Task } from "./model";

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
  return currentLists().map<MenuItem>((l) => ({ label: l.name, icon: dot(l.color), checked: task.List === l.id, onSelect: () => setList(task, l.id) }));
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
