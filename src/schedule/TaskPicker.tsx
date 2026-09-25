import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { formatDue, startOfDay } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { byDue } from "../tasks/model";
import { useTasks } from "../tasks/useTasks";
import { Popup } from "../ui/Popup";

// Link a task: the open tasks, soonest first, with a search box.
export default function TaskPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { tasks } = useTasks();
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const today = startOfDay(new Date());
  const shown = useMemo(
    () =>
      tasks
        .filter((t) => !t.Completed && t.Title.toLowerCase().includes(q.trim().toLowerCase()))
        .sort(byDue)
        .slice(0, 8),
    [tasks, q],
  );
  return (
    <Popup onClose={onClose} width={520} label="Link a task">
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
            else if (e.key === "Enter" && shown[at]) onPick(shown[at].Id);
            else return;
            e.preventDefault();
          }}
          placeholder="Find a task…"
          aria-label="Find a task"
          className="min-w-0 flex-1 bg-transparent text-15 text-text outline-none placeholder:text-muted"
        />
      </label>
      <div role="listbox" aria-label="Tasks" className="flex max-h-[380px] flex-col overflow-y-auto p-2">
        {shown.map((t, i) => {
          const list = listFor(t.List);
          return (
            <button
              key={t.Id}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setAt(i)}
              onClick={() => onPick(t.Id)}
              className={`flex h-12 items-center gap-3 rounded-[12px] px-3 text-left ${i === at ? "bg-panel" : ""}`}
            >
              <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: list.color }} />
              <span className="min-w-0 flex-1 truncate text-14">{t.Title}</span>
              {t.Due && <span className="text-12 text-muted">{formatDue(t.Due, t.DueTime, today)}</span>}
            </button>
          );
        })}
        {shown.length === 0 && <div className="px-3 py-6 text-center text-13 text-muted">No open tasks match.</div>}
      </div>
    </Popup>
  );
}
