import { useEffect, useSyncExternalStore } from "react";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import type { Settings } from "../lib/settings";
import { defaultRules, parseHabits, serializeHabits, type HabitFile, type HabitRules } from "./model";

let store: FileStore<HabitFile> | null = null;

export function habitStore(): FileStore<HabitFile> {
  store ??= new FileStore<HabitFile>(
    {
      read: () => readData("habits.json"),
      write: (json) => writeData("habits.json", json),
      announce: () => announceData("habits.json"),
    },
    { what: "habits", empty: { Habits: [] }, parse: parseHabits, serialize: serializeHabits },
  );
  return store;
}

let watching = false;

export function useHabits() {
  const s = habitStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("habits.json", () => void s.load());
    }
    const retry = window.setInterval(() => {
      if (s.unread()) void s.load();
    }, 4000);
    return () => window.clearInterval(retry);
  }, [s]);
  return { habits: state.file.Habits, loaded: state.loaded, error: state.error, store: s };
}

// Settings → Habits and goals (Phase 7); the mockup's defaults until then.
export function rulesOf(settings: Settings): HabitRules {
  return {
    dayEnds: typeof settings.HabitDayEnds === "number" ? settings.HabitDayEnds : defaultRules.dayEnds,
    streakSaver: settings.StreakSaver !== false,
  };
}
