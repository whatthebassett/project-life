import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { listFor } from "../tasks/lists";
import { Popup } from "../ui/Popup";
import { occurrences, repeatLabels } from "./events";
import { shortTime } from "./look";
import { useEvents } from "./useEvents";

// Link an event: what's coming up (a repeating event once), with a search box.
export default function EventPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { events } = useEvents();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const shown = useMemo(() => {
    const seen = new Set<string>();
    const now = new Date();
    return occurrences(events, new Date(now.getTime() - 7 * 86_400_000), new Date(now.getTime() + 180 * 86_400_000))
      .filter((o) => !seen.has(o.event.Of ?? o.event.Id) && Boolean(seen.add(o.event.Of ?? o.event.Id)))
      .filter((o) => o.event.Title.toLowerCase().includes(q.trim().toLowerCase()))
      .slice(0, 8);
  }, [events, q]);
  return (
    <Popup onClose={onClose} width={520} label="Link an event">
      <label className="flex h-14 items-center gap-3 border-b border-line px-5 text-muted">
        <Search size={16} />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setAt((i) => Math.min(shown.length - 1, i + 1));
            else if (e.key === "ArrowUp") setAt((i) => Math.max(0, i - 1));
            else if (e.key === "Enter" && shown[at]) onPick(shown[at].event.Of ?? shown[at].event.Id);
            else return;
            e.preventDefault();
          }}
          placeholder="Find an event…"
          aria-label="Find an event"
          className="min-w-0 flex-1 bg-transparent text-15 text-text outline-none placeholder:text-muted"
        />
      </label>
      <div role="listbox" aria-label="Events" className="flex max-h-[380px] flex-col overflow-y-auto p-2">
        {shown.map((o, i) => (
          <button
            key={o.key}
            role="option"
            aria-selected={i === at}
            onMouseEnter={() => setAt(i)}
            onClick={() => onPick(o.event.Of ?? o.event.Id)}
            className={`flex h-12 items-center gap-3 rounded-[12px] px-3 text-left ${i === at ? "bg-panel" : ""}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: listFor(o.event.Calendar).color }} />
            <span className="min-w-0 flex-1 truncate text-14">{o.event.Title}</span>
            <span className="text-12 text-muted">
              {o.event.Repeat ? repeatLabels[o.event.Repeat] : o.start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {o.event.AllDay ? "" : `, ${shortTime(o.start)}`}
            </span>
          </button>
        ))}
        {shown.length === 0 && <div className="px-3 py-6 text-center text-13 text-muted">No events match.</div>}
      </div>
    </Popup>
  );
}
