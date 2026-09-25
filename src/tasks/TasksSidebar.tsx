import clsx from "clsx";
import { ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import type { MenuItem } from "../components/ContextMenu";
import { ProgressRing } from "../ui/Progress";
import { SectionLabel } from "../ui/bits";
import { listColors, newListId, type ListColor, type ListRecord } from "./lists";
import { isOverdue, todaysTasks, type Task } from "./model";
import type { TaskStore } from "./store";
import { baseViews, viewCount, type ViewId } from "./views";

interface Props {
  tasks: Task[];
  lists: ListRecord[];
  now: Date;
  view: ViewId;
  onView: (v: ViewId) => void;
  onPopOut?: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  store: TaskStore;
}

// Tasks' list panel (Tasks.dc.html): the views with their counts, your lists,
// and the Today ring. Lists open as views of their own; right-click one to
// rename, recolor or delete it.
export default function TasksSidebar({ tasks, lists, now, view, onView, onPopOut, openMenu, store }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirm, setConfirm] = useState<ListRecord | null>(null);

  const todays = todaysTasks(tasks, now);
  const done = todays.filter((t) => t.Completed).length;
  const overdue = tasks.filter((t) => isOverdue(t, now) && t.Due! < todayYmd(now)).length;
  const left = todays.length - done;

  const saveName = (id: string | "new", name: string) => {
    setEditing(null);
    const text = name.trim();
    if (!text) return;
    if (id === "new") {
      const used = new Set(lists.map((l) => l.Color));
      const color = listColors.find((c) => !used.has(c.id))?.id ?? "muted";
      const record: ListRecord = { Id: newListId(text, lists.map((l) => l.Id)), Name: text, Color: color };
      store.change((f) => ({ ...f, Lists: [...f.Lists, record] }));
      onView(`list:${record.Id}`);
    } else {
      store.change((f) => ({ ...f, Lists: f.Lists.map((l) => (l.Id === id ? { ...l, Name: text } : l)) }));
    }
  };

  const recolor = (id: string, color: ListColor) => store.change((f) => ({ ...f, Lists: f.Lists.map((l) => (l.Id === id ? { ...l, Color: color } : l)) }));

  const remove = (list: ListRecord) => {
    const rest = lists.filter((l) => l.Id !== list.Id);
    const to = rest.find((l) => l.Id === "personal") ?? rest[0];
    store.change((f) => ({ ...f, Lists: f.Lists.filter((l) => l.Id !== list.Id), Tasks: f.Tasks.map((t) => (t.List === list.Id ? { ...t, List: to.Id } : t)) }));
    if (view === `list:${list.Id}`) onView("today");
  };

  const listMenu = (list: ListRecord): MenuItem[] => [
    { label: "Rename", onSelect: () => setEditing(list.Id) },
    {
      label: "Color",
      children: listColors.map((c) => ({
        label: c.name,
        checked: list.Color === c.id,
        icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: `var(--${c.id})` }} />,
        onSelect: () => recolor(list.Id, c.id),
      })),
    },
    { type: "separator" },
    { label: "Delete list…", danger: true, disabled: lists.length <= 1, onSelect: () => setConfirm(list) },
  ];

  const dayNumber = String(now.getDate());
  const confirmCount = confirm ? tasks.filter((t) => t.List === confirm.Id).length : 0;
  const moveTo = confirm ? (lists.filter((l) => l.Id !== confirm.Id).find((l) => l.Id === "personal") ?? lists.find((l) => l.Id !== confirm.Id)) : null;

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line bg-side px-4 pt-[22px] pb-[18px]">
      <div className="flex items-center justify-between px-1.5">
        <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">Tasks</h1>
        {onPopOut && (
          <button
            aria-label="Open tasks in their own window"
            title="Pop out"
            onClick={onPopOut}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text"
          >
            <ExternalLink size={16} strokeWidth={1.9} />
          </button>
        )}
      </div>

      <nav aria-label="Task views" className="flex flex-col gap-0.5">
        {baseViews.map((v) => {
          const cur = view === v.id;
          return (
            <button
              key={v.id}
              aria-current={cur ? "page" : undefined}
              onClick={() => onView(v.id)}
              className={clsx("flex h-[42px] items-center gap-3 rounded-[12px] px-2.5 text-left text-14 font-medium", cur ? "bg-panel text-text" : "text-muted hover:text-text")}
            >
              <span className={clsx("flex h-[22px] w-[22px] items-center justify-center rounded-[7px] font-mono text-11 font-medium", cur ? "bg-accent text-accent-ink" : "bg-panel2 text-muted")}>
                {v.id === "today" ? dayNumber : v.glyph}
              </span>
              <span className="flex-1">{v.label}</span>
              <span className="font-mono text-12 text-muted">{viewCount(tasks, v.id, now)}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-0.5">
        <SectionLabel className="px-2.5 pb-1.5">LISTS</SectionLabel>
        {lists.map((l) =>
          editing === l.Id ? (
            <NameField key={l.Id} color={`var(--${l.Color})`} initial={l.Name} onDone={(name) => saveName(l.Id, name ?? "")} />
          ) : (
            <button
              key={l.Id}
              aria-current={view === `list:${l.Id}` ? "page" : undefined}
              onClick={() => onView(`list:${l.Id}`)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenu(e.clientX, e.clientY, listMenu(l));
              }}
              onDoubleClick={() => setEditing(l.Id)}
              className={clsx("flex h-[38px] items-center gap-3 rounded-[10px] px-2.5 text-left text-14", view === `list:${l.Id}` ? "bg-panel text-text" : "text-muted hover:text-text")}
            >
              <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: `var(--${l.Color})` }} />
              <span className="min-w-0 flex-1 truncate">{l.Name}</span>
              <span className="font-mono text-12">{viewCount(tasks, `list:${l.Id}`, now)}</span>
            </button>
          ),
        )}
        {editing === "new" ? (
          <NameField color="var(--faint)" initial="" onDone={(name) => saveName("new", name ?? "")} />
        ) : (
          <button onClick={() => setEditing("new")} className="flex h-[38px] items-center gap-3 rounded-[10px] px-2.5 text-left text-13 text-muted hover:text-text">
            <Plus size={14} strokeWidth={2} className="-mx-[2px]" />
            New list
          </button>
        )}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-4 rounded-[18px] border border-line bg-panel p-4">
        <ProgressRing value={todays.length ? done / todays.length : 0} size={60} radius={24} stroke={7} />
        <div className="flex flex-col gap-[3px]">
          <SectionLabel>TODAY</SectionLabel>
          <span className="text-15 font-semibold">
            {done} of {todays.length} done
          </span>
          <span className="text-12 text-muted">
            {left} left{overdue ? `, ${overdue} overdue` : ""}
          </span>
        </div>
      </div>

      {confirm && moveTo && (
        <ConfirmDialog
          title={`Delete “${confirm.Name}”?`}
          message={confirmCount ? `Its ${confirmCount} ${confirmCount === 1 ? "task moves" : "tasks move"} to ${moveTo.Name}.` : "It has no tasks."}
          okLabel="Delete list"
          cancelLabel="Cancel"
          danger
          onResult={(ok) => {
            if (ok) remove(confirm);
            setConfirm(null);
          }}
        />
      )}
    </aside>
  );
}

const todayYmd = (now: Date) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function NameField({ color, initial, onDone }: { color: string; initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="flex h-[38px] items-center gap-3 rounded-[10px] bg-panel px-2.5 text-14">
      <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: color }} />
      <input
        autoFocus
        value={value}
        aria-label="List name"
        placeholder="List name"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => onDone(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setValue(initial);
            onDone(null);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-faint"
      />
    </label>
  );
}
