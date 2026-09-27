import { Icon } from "../ui/icons";
import { useNotes } from "../notes/NotesContext";
import { openPalette } from "../palette/open";

// Home's capture box: it looks like a search field and opens the command
// palette (Ctrl+K from anywhere), where a task, note or event is added, or a
// command or note picked.
export default function Capture() {
  const { keyFor } = useNotes();
  const keys = keyFor("app.capture") || "Ctrl+K";
  return (
    <div className="flex shrink items-center gap-[10px]">
      <button
        type="button"
        onClick={() => openPalette()}
        aria-label={`Capture a task, note or event (${keys})`}
        className="flex h-[50px] w-[420px] min-w-[220px] shrink items-center gap-[10px] rounded-[16px] border border-line bg-panel pr-2 pl-4 text-left text-14 text-muted transition-colors hover:border-faint"
      >
        <Icon name="search" size={18} />
        <span className="min-w-0 flex-1 truncate">Capture a task, note or event…</span>
        <span className="shrink-0 rounded-[7px] border border-line px-[7px] py-1 font-mono text-11 text-muted">{keys.replace("+", " ")}</span>
      </button>
      <button
        type="button"
        onClick={() => openPalette()}
        className="flex h-[50px] shrink-0 items-center gap-2 rounded-[16px] bg-accent px-5 text-14 font-semibold text-accent-ink transition-[filter] hover:brightness-110"
      >
        <Icon name="plus" size={16} stroke={2.2} />
        Add
      </button>
    </div>
  );
}
