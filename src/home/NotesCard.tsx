import type { Screen } from "../shell/nav";
import { Card, CardHeader, CardLink, Empty } from "./parts";
import { ago } from "./time";
import type { HomeData } from "./useHome";

// The last few notes edited.
export default function NotesCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const notes = [...home.notes].sort((a, b) => b.edited - a.edited).slice(0, 3);
  return (
    <Card label="Recent notes" className="flex-1 gap-3 overflow-hidden px-6 py-[22px]">
      <CardHeader title="Recent notes">
        <CardLink onClick={() => onNavigate("notes")}>All notes</CardLink>
      </CardHeader>
      {notes.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onNavigate("notes")}
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
