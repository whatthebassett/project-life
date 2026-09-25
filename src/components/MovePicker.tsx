import { useMemo, useState } from "react";
import { Book, CornerLeftUp } from "lucide-react";
import Dialog, { inputClass } from "./Dialog";
import { titleOf, type NoteInfo } from "../lib/api";
import { buildRows, isWithin, parentOf, type Notebook } from "../lib/notebook";

interface Props {
  name: string;
  notes: NoteInfo[];
  notebook: Notebook;
  onMove: (parent: string | null) => void;
  onClose: () => void;
}

// "Move to…": pick the note this one goes inside, or the top level. A note
// can't move into itself or one of its own pages.
export default function MovePicker({ name, notes, notebook, onMove, onClose }: Props) {
  const [query, setQuery] = useState("");
  const current = parentOf(notebook, name) ?? null;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return buildRows(
      notes,
      { ...notebook, pages: { ...notebook.pages, Collapsed: [] } },
      (n) => !isWithin(notebook, n.name, name) && (!q || titleOf(n.name).toLowerCase().includes(q)),
      false,
    );
  }, [notes, notebook, name, query]);

  return (
    <Dialog title={`Move "${titleOf(name)}" to…`} width={400} onClose={onClose}>
      <input autoFocus className={`${inputClass} mb-2`} placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="max-h-[50vh] overflow-y-auto">
        <Row label="Top level" icon={<CornerLeftUp size={13} />} depth={0} active={current === null} onClick={() => onMove(null)} />
        {rows.map(({ note, depth, hasChildren }) => (
          <Row
            key={note.name}
            label={titleOf(note.name)}
            icon={hasChildren ? <Book size={13} /> : null}
            depth={depth + 1}
            active={current?.toLowerCase() === note.name.toLowerCase()}
            onClick={() => onMove(note.name)}
          />
        ))}
      </div>
    </Dialog>
  );
}

function Row({ label, icon, depth, active, onClick }: { label: string; icon: React.ReactNode; depth: number; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex h-[26px] w-full items-center gap-2 rounded-md pr-2 text-left hover:bg-hover ${active ? "text-muted" : ""}`}
      style={{ paddingLeft: 8 + depth * 14 }}
      disabled={active}
      onClick={onClick}
    >
      <span className="flex w-4 justify-center text-muted">{icon}</span>
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto text-[11px]">current</span>}
    </button>
  );
}
