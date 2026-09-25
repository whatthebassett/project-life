import { useMemo, useSyncExternalStore } from "react";
import { titleOf } from "../lib/api";
import { joinUrlOf, occurrences, type Occurrence } from "../schedule/events";
import { startOfDay } from "../tasks/dates";
import { useEvents } from "../schedule/useEvents";
import { useNow } from "../lib/dates";
import type { Task } from "../tasks/model";
import { openCount, todaysTasks } from "../tasks/model";
import { useTasks } from "../tasks/useTasks";
import { useRecentNotes } from "./recentNotes";
import { sample, type Sample } from "./sample";
import type { HomeEvent, HomeHabit, HomeNote } from "./sources";

export interface HomeData {
  // Sample mode's data, when it's on (development builds).
  sample: Sample | null;
  now: Date;
  tasks: Task[];
  updateTasks: (change: (tasks: Task[]) => Task[]) => void;
  events: HomeEvent[];
  habits: HomeHabit[];
  toggleHabit: (id: string) => void;
  notes: HomeNote[];
}

const none: never[] = [];

// Everything Home shows, from the real stores or, in sample mode, from the
// mockup's data with the clock pinned to its 4:18 PM.
export function useHome(): HomeData {
  const s = useSyncExternalStore(sample.subscribe, sample.get);
  const now = useNow();
  const real = useTasks();
  const recentNotes = useRecentNotes();
  const { events } = useEvents();
  // Today and the week ahead, repeating events included.
  const day = startOfDay(now).getTime();
  const homeEvents = useMemo(() => occurrences(events, new Date(day), new Date(day + 8 * 86_400_000)).filter((o) => !o.event.AllDay).map(toHome), [events, day]);
  if (s) {
    return {
      sample: s,
      now: s.now,
      tasks: s.tasks,
      updateTasks: sample.updateTasks,
      events: s.events,
      habits: s.habits,
      toggleHabit: sample.toggleHabit,
      notes: s.notes,
    };
  }
  return {
    sample: null,
    now,
    tasks: real.tasks,
    updateTasks: (change) => real.store.update(change),
    events: homeEvents,
    habits: none,
    toggleHabit: () => {},
    notes: recentNotes,
  };
}

function toHome(o: Occurrence): HomeEvent {
  const e = o.event;
  const mins = Math.round((o.end.getTime() - o.start.getTime()) / 60_000);
  const length = mins < 60 ? `${mins} min` : `${Math.round((mins / 60) * 10) / 10} hr`;
  return {
    id: o.key,
    title: e.Title,
    start: o.start,
    end: o.end,
    calendar: e.Calendar,
    meta: [length, e.Kind === "focus" ? "Focus time" : e.Place].filter(Boolean).join(" · "),
    call: e.Call ?? undefined,
    joinUrl: joinUrlOf(e) ?? undefined,
    note: e.Note ? titleOf(e.Note) : undefined,
    noteName: e.Note ?? undefined,
  };
}

// Today's open tasks, for the badge beside Tasks in Home's sidebar.
export function useTodayOpenCount(): number {
  const { tasks, now } = useHome();
  return openCount(todaysTasks(tasks, now));
}
