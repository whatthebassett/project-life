import clsx from "clsx";
import { ExternalLink, Maximize2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { ProgressRing } from "../ui/Progress";
import { SectionLabel } from "../ui/bits";
import { deleteTasks } from "./actions";
import { DeleteListDialog, listActionsMenu, renameList } from "./listMenu";
import { listColors, newListId, type ListRecord } from "./lists";
import { isOverdue, todaysTasks, type Task } from "./model";
import { requestTasks } from "./nav";
import type { TaskStore } from "./store";
import { baseViews, viewCount, type BaseView, type ViewId } from "./views";

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
// rename, recolor or delete it, or right-click a view to start a task there.
export default function TasksSidebar({ tasks, lists, now, view, onView, onPopOut, openMenu, store }: Props) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [confirm, setConfirm] = useState<ListRecord | null>(null);
  const [clearing, setClearing] = useState(false);

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
      renameList(id, text);
    }
  };

  const listMenu = (list: ListRecord): MenuItem[] => listActionsMenu(list, lists, { rename: () => setEditing(list.Id), remove: () => setConfirm(list) });

  const completed = tasks.filter((t) => t.Completed);
  // A view: open it, or open it and start a task there (quick add fills in
  // the view's date). Completed has nothing to add, but can be cleared.
  const viewMenu = (id: BaseView): MenuItem[] => [
    { label: "Open", icon: <Maximize2 size={13} />, onSelect: () => onView(id) },
    id === "completed"
      ? { label: "Clear completed…", icon: <Trash2 size={13} />, danger: true, disabled: !completed.length, onSelect: () => setClearing(true) }
      : {
          label: "New task",
          icon: <Plus size={13} />,
          onSelect: () => {
            onView(id);
            requestTasks({ kind: "new" });
          },
        },
  ];

  const dayNumber = String(now.getDate());

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
              onContextMenu={(e) => {
                e.preventDefault();
                const { x, y } = menuPoint(e);
                openMenu(x, y, viewMenu(v.id));
              }}
              data-row="nav"
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
                const { x, y } = menuPoint(e);
                openMenu(x, y, listMenu(l));
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

      {confirm && (
        <DeleteListDialog
          list={confirm}
          lists={lists}
          tasks={tasks}
          onDone={(deleted) => {
            if (deleted && view === `list:${confirm.Id}`) onView("today");
            setConfirm(null);
          }}
        />
      )}
      {clearing && (
        <ConfirmDialog
          title="Clear completed tasks?"
          message={`${completed.length} completed ${completed.length === 1 ? "task moves" : "tasks move"} to the Recycle Bin.`}
          okLabel="Clear completed"
          cancelLabel="Cancel"
          danger
          onResult={(ok) => {
            if (ok) deleteTasks(completed);
            setClearing(false);
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
