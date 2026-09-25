import { useEffect, useSyncExternalStore } from "react";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import { defaultAreas, parseGoals, serializeGoals, type GoalFile } from "./model";

let store: FileStore<GoalFile> | null = null;

export function goalStore(): FileStore<GoalFile> {
  store ??= new FileStore<GoalFile>(
    {
      read: () => readData("goals.json"),
      write: (json) => writeData("goals.json", json),
      announce: () => announceData("goals.json"),
    },
    { what: "goals", empty: { Goals: [], Areas: defaultAreas }, parse: parseGoals, serialize: serializeGoals },
  );
  return store;
}

let watching = false;

export function useGoals() {
  const s = goalStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("goals.json", () => void s.load());
    }
    const retry = window.setInterval(() => {
      if (s.unread()) void s.load();
    }, 4000);
    return () => window.clearInterval(retry);
  }, [s]);
  return { goals: state.file.Goals, areas: state.file.Areas, loaded: state.loaded, error: state.error, store: s };
}
