// The right-click menus for habits: a habit, an archived one, and a day in
// its last 12 weeks. They need no screen state, so Tasks can use them too.
import { Archive, ArchiveRestore, CalendarCheck, Check, Clock, Copy, House, ListChecks, Minus, Palette, Pause, Pencil, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { ConfirmOptions } from "../components/ConfirmDialog";
import type { MenuItem } from "../components/ContextMenu";
import { locale } from "../lib/format";
import { currentSettings } from "../lib/settings";
import { addDays, fromYmd, ymd } from "../tasks/dates";
import { newId } from "../tasks/model";
import { archiveHabit, fillDay, saveHabit, startTimer, stepDay, stopTimer, toggleDay } from "./actions";
import { doneOn, hueColor, hueNames, todLabel, valueOn, type Habit, type TimeOfDay } from "./model";

export interface HabitMenuHandlers {
  edit: () => void;
  // Asks first (deleteConfirm below), then deleteHabit.
  remove: () => void;
  // The copy Duplicate made, to pick it.
  select?: (id: string) => void;
}

const dot = (color: string) => <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />;
const stepText = (h: Habit) => (h.Kind === "time" ? "5 minutes" : "one");

// The same question the edit pop-up asks before deleting.
export const deleteConfirm = (h: Habit): ConfirmOptions => ({
  title: `Delete “${h.Name}”?`,
  message: "Its streak and every check-in go with it. Archive it instead to keep the history.",
  okLabel: "Delete",
  cancelLabel: "Cancel",
  danger: true,
});

// Up or down a step on a day, as the stepper does (stepDay caps at four
// times the target).
function stepItems(h: Habit, day: string, when: string): MenuItem[] {
  const v = valueOn(h, day);
  return [
    { label: `Add ${stepText(h)}${when}`, icon: <Plus size={13} />, disabled: v >= h.Target * 4, onSelect: () => stepDay(h, day, 1) },
    { label: `Remove ${stepText(h)}${when}`, icon: <Minus size={13} />, disabled: !v, onSelect: () => stepDay(h, day, -1) },
  ];
}

// A habit in a list. `today` is the habit day (habitDay), not the calendar date.
const yesterdayOf = (today: string) => ymd(addDays(fromYmd(today), -1));

export function habitMenu(h: Habit, today: string, on: HabitMenuHandlers): MenuItem[] {
  // Settings → Habits → Show habits in Tasks puts every habit there already.
  const allInTasks = Boolean(currentSettings().HabitsInTasks);
  return [
    ...(h.Kind === "check"
      ? [
          doneOn(h, today)
            ? { label: "Not done today", icon: <RotateCcw size={13} />, onSelect: () => toggleDay(h, today) }
            : { label: "Mark done today", icon: <Check size={13} />, onSelect: () => toggleDay(h, today) },
        ]
      : stepItems(h, today, "")),
    // Done yesterday but not ticked: the quickest way to fill it in.
    doneOn(h, yesterdayOf(today))
      ? { label: "Yesterday: not done", icon: <RotateCcw size={13} />, onSelect: () => fillDay(h, yesterdayOf(today), today) }
      : { label: "Mark yesterday done", icon: <CalendarCheck size={13} />, onSelect: () => fillDay(h, yesterdayOf(today), today) },
    ...(h.Kind === "time"
      ? [
          h.Timer
            ? { label: "Stop timer", icon: <Pause size={13} />, onSelect: () => stopTimer(h, today) }
            : { label: "Start timer", icon: <Play size={13} />, onSelect: () => startTimer(h) },
        ]
      : []),
    { type: "separator" },
    { label: "Edit…", icon: <Pencil size={13} />, onSelect: on.edit },
    {
      label: "Time of day",
      icon: <Clock size={13} />,
      children: (Object.keys(todLabel) as TimeOfDay[]).map<MenuItem>((t) => ({ label: todLabel[t], checked: h.TimeOfDay === t, onSelect: () => saveHabit({ ...h, TimeOfDay: t }) })),
    },
    {
      label: "Color",
      icon: <Palette size={13} />,
      children: hueNames.map<MenuItem>((name, i) => ({ label: name, icon: dot(hueColor(i)), checked: h.Hue === i, onSelect: () => saveHabit({ ...h, Hue: i }) })),
    },
    { label: "Show on Home", icon: <House size={13} />, checked: h.ShowOnHome, onSelect: () => saveHabit({ ...h, ShowOnHome: !h.ShowOnHome }) },
    {
      label: "Show in Tasks",
      icon: <ListChecks size={13} />,
      checked: allInTasks || h.InTasks,
      disabled: allInTasks,
      hint: allInTasks ? "On for all" : undefined,
      onSelect: () => saveHabit({ ...h, InTasks: !h.InTasks }),
    },
    { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => on.select?.(duplicateHabit(h).Id) },
    { type: "separator" },
    { label: "Archive", icon: <Archive size={13} />, onSelect: () => archiveHabit(h, true) },
    { label: "Delete…", icon: <Trash2 size={13} />, danger: true, onSelect: on.remove },
  ];
}

// An archived habit: it can come back, be edited, or go for good.
export function archivedMenu(h: Habit, on: Pick<HabitMenuHandlers, "edit" | "remove">): MenuItem[] {
  return [
    { label: "Bring back", icon: <ArchiveRestore size={13} />, onSelect: () => archiveHabit(h, false) },
    { label: "Edit…", icon: <Pencil size={13} />, onSelect: on.edit },
    { type: "separator" },
    { label: "Delete…", icon: <Trash2 size={13} />, danger: true, onSelect: on.remove },
  ];
}

// A day in the 12-week grid. Days still to come have nothing to set.
export function dayMenu(h: Habit, day: string, today: string): MenuItem[] | null {
  if (day > today) return null;
  const short = fromYmd(day).toLocaleDateString(locale(), { month: "short", day: "numeric" });
  const when = day === today ? " today" : ` on ${short}`;
  if (h.Kind !== "check") return stepItems(h, day, when);
  return [
    doneOn(h, day)
      ? { label: day === today ? "Not done today" : `Clear ${short}`, icon: <RotateCcw size={13} />, onSelect: () => toggleDay(h, day) }
      : { label: `Mark done${when}`, icon: <Check size={13} />, onSelect: () => toggleDay(h, day) },
  ];
}

// A fresh copy: same settings, no history, streak or running timer.
function duplicateHabit(h: Habit): Habit {
  const copy: Habit = { ...h, Id: newId(), Name: `${h.Name} (copy)`, Log: {}, Timer: null, Reminded: null, Archived: null, Created: new Date().toISOString() };
  saveHabit(copy);
  return copy;
}
