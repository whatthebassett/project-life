import { useEffect, useMemo, useState } from "react";
import { useNow } from "../lib/dates";
import { useNotes } from "../notes/NotesContext";
import { addDays, fromYmd } from "../tasks/dates";
import { deleteOccurrence, saveEvent, type Scope } from "./actions";
import EventPopup from "./EventPopup";
import { occurrences } from "./events";
import { useAllEvents } from "./useEvents";

// The event pop-up away from the Schedule screen (Home's Schedule card): the
// same editor, opened over whatever screen is showing. Given an occurrence
// key ("eventId@yyyy-mm-dd"), so a repeating event opens on the right day.
let listener: ((key: string) => void) | null = null;

export function openEventEditor(key: string) {
  listener?.(key);
}

export default function EventEditorHost() {
  const [key, setKey] = useState<string | null>(null);
  const { events } = useAllEvents();
  const { openMenu } = useNotes();
  const now = useNow();

  useEffect(() => {
    const l = (k: string) => setKey(k);
    listener = l;
    return () => {
      if (listener === l) listener = null;
    };
  }, []);

  // The showing asked for, as the Schedule would find it.
  const occ = useMemo(() => {
    if (!key) return null;
    const day = key.slice(key.lastIndexOf("@") + 1);
    const from = fromYmd(day);
    return occurrences(events, addDays(from, -1), addDays(from, 2)).find((o) => o.key === key) ?? null;
  }, [key, events]);

  // Gone (deleted elsewhere, or a subscription refreshed it away): nothing to show.
  useEffect(() => {
    if (key && !occ) setKey(null);
  }, [key, occ]);

  if (!key || !occ) return null;
  return (
    <EventPopup
      event={occ.event}
      occ={occ}
      isNew={false}
      events={events}
      now={now}
      openMenu={openMenu}
      onClose={() => setKey(null)}
      onSave={(e, scope: Scope) => {
        saveEvent(e, occ, scope);
        setKey(null);
      }}
      onDelete={(scope) => {
        deleteOccurrence(occ, scope);
        setKey(null);
      }}
    />
  );
}
