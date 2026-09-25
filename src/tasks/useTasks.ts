import { useEffect, useSyncExternalStore } from "react";
import { readData, writeData } from "../lib/api";
import { TaskStore } from "./store";

let store: TaskStore | null = null;

// One store for the app, shared by every view that shows tasks.
export function taskStore(): TaskStore {
  store ??= new TaskStore({
    read: () => readData("tasks.json"),
    write: (json) => writeData("tasks.json", json),
    announce: () => {},
  });
  return store;
}

// The tasks, loaded when a view mounts. While the file can't be read (locked
// by a sync tool, or being fixed by hand), keep trying every few seconds.
export function useTasks() {
  const s = taskStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    const retry = window.setInterval(() => {
      if (s.unread()) void s.load();
    }, 4000);
    return () => window.clearInterval(retry);
  }, [s]);
  return { ...state, store: s };
}
