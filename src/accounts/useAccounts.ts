import { useEffect, useSyncExternalStore } from "react";
import { announceData, onDataChanged, readData, writeData } from "../lib/api";
import { FileStore } from "../lib/fileStore";
import { setSyncedCalendars } from "../tasks/lists";
import { calendarLists, parseAccounts, serializeAccounts, type AccountFile } from "./model";

let store: FileStore<AccountFile> | null = null;

// Connected accounts and their synced events (Data\accounts.json). The
// calendars that are on are handed to the lists module, so events on them
// get a name and color wherever lists are looked up.
export function accountStore(): FileStore<AccountFile> {
  store ??= new FileStore<AccountFile>(
    {
      read: () => readData("accounts.json"),
      write: (json) => writeData("accounts.json", json),
      announce: () => announceData("accounts.json"),
    },
    {
      what: "connected accounts",
      empty: { Accounts: [], Events: [] },
      parse: parseAccounts,
      serialize: serializeAccounts,
      onChange: (f) => setSyncedCalendars(calendarLists(f.Accounts)),
    },
  );
  return store;
}

let watching = false;

export function useAccounts() {
  const s = accountStore();
  const state = useSyncExternalStore(s.subscribe, s.getState);
  useEffect(() => {
    if (s.unread()) void s.load();
    if (!watching) {
      watching = true;
      onDataChanged("accounts.json", () => void s.load());
    }
  }, [s]);
  return { accounts: state.file.Accounts, synced: state.file.Events, loaded: state.loaded, store: s };
}
