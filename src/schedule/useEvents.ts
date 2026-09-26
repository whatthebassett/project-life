import { useEffect, useMemo, useSyncExternalStore } from "react";
import { accountStore, useAccounts } from "../accounts/useAccounts";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { parseEvents, serializeEvents, type CalEvent, type EventFile } from "./events";

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

// Project Life's own events and the ones synced from connected calendars,
// for everything that shows events. Declined invitations stay out unless
// Settings → Connected accounts says otherwise.
export function useAllEvents() {
  const own = useEvents();
  const { synced } = useAccounts();
  const { settings } = useSettings();
  const showDeclined = settings.ShowDeclined === true;
  const events = useMemo(() => (synced.length ? [...own.events, ...synced.filter((e) => showDeclined || !e.Remote?.Declined)] : own.events), [own.events, synced, showDeclined]);
  return { ...own, events };
}

// The same, outside React (reminders).
export function allEvents(): CalEvent[] {
  const synced = accountStore().getState().file.Events;
  const showDeclined = currentSettings().ShowDeclined === true;
  return [...eventStore().getState().file.Events, ...synced.filter((e) => showDeclined || !e.Remote?.Declined)];
}
