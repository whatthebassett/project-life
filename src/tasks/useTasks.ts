import { useEffect, useSyncExternalStore } from "react";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { TaskStore } from "./store";

let store: TaskStore | null = null;

// One store per window, shared by every view that shows tasks. After each
// save the other window (Tasks popped out) is told to reload.
export function taskStore(): TaskStore {
  store ??= new TaskStore({
    read: () => readData("tasks.json"),
    write: (json) => writeData("tasks.json", json),
    announce: () => announceData("tasks.json"),
  });
  return store;
}

let watching = false;

// The tasks, loaded when a view mounts and reloaded when the other window
// saves. While the file can't be read (locked by a sync tool, or being fixed
// by hand), keep trying every few seconds.
export function useTasks() {
  const s = taskStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("tasks.json", () => void s.load());
    }
    const retry = window.setInterval(() => {
      if (s.unread()) void s.load();
    }, 4000);
    return () => window.clearInterval(retry);
  }, [s]);
  return { tasks: state.file.Tasks, lists: state.file.Lists, recycled: state.file.Recycled, loaded: state.loaded, error: state.error, store: s };
}
