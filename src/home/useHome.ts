import { useSyncExternalStore } from "react";
import { useNow } from "../lib/dates";
import type { Task } from "../tasks/model";
import { openCount, todaysTasks } from "../tasks/model";
import { useTasks } from "../tasks/useTasks";
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
    events: none,
    habits: none,
    toggleHabit: () => {},
    notes: none,
  };
}

// Today's open tasks, for the badge beside Tasks in Home's sidebar.
export function useTodayOpenCount(): number {
  const { tasks, now } = useHome();
  return openCount(todaysTasks(tasks, now));
}
