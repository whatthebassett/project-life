import { useEffect, useSyncExternalStore } from "react";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import { parseEvents, serializeEvents, type EventFile } from "./events";

let store: FileStore<EventFile> | null = null;

export function eventStore(): FileStore<EventFile> {
  store ??= new FileStore<EventFile>(
    {
      read: () => readData("events.json"),
      write: (json) => writeData("events.json", json),
      announce: () => announceData("events.json"),
    },
    { what: "events", empty: { Events: [] }, parse: parseEvents, serialize: serializeEvents },
  );
  return store;
}

let watching = false;

export function useEvents() {
  const s = eventStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("events.json", () => void s.load());
    }
    const retry = window.setInterval(() => {
      if (s.unread()) void s.load();
    }, 4000);
    return () => window.clearInterval(retry);
  }, [s]);
  return { events: state.file.Events, loaded: state.loaded, error: state.error, store: s };
}
