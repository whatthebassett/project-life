import { Copy, ExternalLink, FileText, Maximize2, Pin, PinOff, Trash2 } from "lucide-react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { isPinned } from "../lib/notebook";
import { useNotes } from "../notes/NotesContext";
import type { Screen } from "../shell/nav";
import { Card, CardHeader, CardLink, Empty } from "./parts";
import { ago } from "./time";
import type { HomeData } from "./useHome";

// The last few notes edited.
export default function NotesCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const { activate, actions, notebook, openMenu } = useNotes();
  const notes = [...home.notes].sort((a, b) => b.edited - a.edited).slice(0, 3);

  const noteMenu = (name: string): MenuItem[] => [
    { label: "Open", icon: <Maximize2 size={13} />, onSelect: () => void activate(name) },
    { label: "Open in new tab", icon: <ExternalLink size={13} />, onSelect: () => actions.openInTab(name) },
    notebook && isPinned(notebook, name)
      ? { label: "Unpin", icon: <PinOff size={13} />, onSelect: () => actions.setPinned(name, false) }
      : { label: "Pin to top", icon: <Pin size={13} />, disabled: !notebook, onSelect: () => actions.setPinned(name, true) },
    { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => actions.duplicate(name) },
    { type: "separator" },
    { label: "Recycle", icon: <Trash2 size={13} />, danger: true, onSelect: () => actions.recycle(name) },
  ];

  return (
    <Card
      id="notes"
      menu={[{ label: "Open Notes", icon: <FileText size={13} />, onSelect: () => onNavigate("notes") }]}
      label="Recent notes"
      className="flex-1 gap-3 overflow-hidden px-6 py-[22px]"
    >
      <CardHeader title="Recent notes">
        <CardLink onClick={() => onNavigate("notes")}>All notes</CardLink>
      </CardHeader>
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => (home.sample ? onNavigate("notes") : void activate(n.id))}
          onContextMenu={(e) => {
            // Sample notes aren't real files: they get the card's menu.
            if (home.sample) return;
            e.preventDefault();
            e.stopPropagation();
            const { x, y } = menuPoint(e);
            openMenu(x, y, noteMenu(n.id));
          }}
          className="-mx-3 flex w-[calc(100%+24px)] flex-col gap-1 rounded-[12px] px-3 py-[10px] text-left transition-colors hover:bg-panel2"
        >
          <span className="flex w-full justify-between gap-2">
            <span className="truncate text-14 font-medium">{n.title}</span>
            <span className="font-mono text-11 whitespace-nowrap text-muted">{ago(n.edited, home.now.getTime())}</span>
          </span>
          <span className="w-full truncate text-13 text-muted">{n.snippet}</span>
        </button>
      ))}
      {notes.length === 0 && <Empty>The notes you edit most recently will show up here.</Empty>}
    </Card>
  );
}
