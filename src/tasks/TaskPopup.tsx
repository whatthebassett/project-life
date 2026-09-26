import clsx from "clsx";
import type { Editor } from "@tiptap/react";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import {
  Bold,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock3,
  Code,
  Ellipsis,
  FileText,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListChecks,
  MessageSquareQuote,
  Paperclip,
  Plus,
  Trash2,
  Underline,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MenuItem } from "../components/ContextMenu";
import NotePicker from "../components/NotePicker";
import VisualEditor, { type EditorCommands } from "../components/VisualEditor";
import type { CaretConfig } from "../editor/caret";
import { attachFile, inTauri, openAttachment, removeAttachment, titleOf } from "../lib/api";
import { useNow } from "../lib/dates";
import { priorityColor, priorityLabel, type PriorityValue } from "../lib/notebook";
import { useSettings } from "../lib/SettingsContext";
import { useNotes } from "../notes/NotesContext";
import { requestSchedule } from "../schedule/nav";
import { useAllEvents } from "../schedule/useEvents";
import { Popup } from "../ui/Popup";
import { SectionLabel } from "../ui/bits";
import { toast } from "../ui/Toast";
import {
  addSubtask,
  blockedEvents,
  blockTime,
  deleteTasks,
  duplicateTask,
  estimateLabel,
  eventLabel,
  moveSubtask,
  patch,
  reminderLabel,
  removeSubtask,
  renameSubtask,
  repeatLabel,
  setDescription,
  setPriority,
  setStatus,
  setTags,
  setTaskDue,
  statusLabel,
  toggleSubtask,
  toggleTask,
  unblock,
} from "./actions";
import Calendar from "./Calendar";
import { formatDate, formatDue, formatTime, parseTime, startOfDay } from "./dates";
import LaterMenu from "./LaterMenu";
import { listFor } from "./lists";
import { estimateMenu, listMenu, reminderMenu, repeatMenu } from "./menus";
import { subtaskProgress, type Activity, type Attachment, type Subtask, type Task } from "./model";
import { TitleField } from "./TaskDetails";
import { shortDate } from "./views";
import { ago } from "../home/time";

interface Props {
  task: Task;
  onClose: () => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
}

const caret: CaretConfig = { width: 2, rainbow: false, blinkMs: 530 };
const statuses = ["todo", "doing", "done"] as const;
const priorities: { p: PriorityValue; label: string }[] = [
  { p: 0, label: "None" },
  { p: 1, label: "Low" },
  { p: 2, label: "Med" },
  { p: 3, label: "High" },
];
const activityDot: Record<Activity["Kind"], string> = {
  create: "var(--faint)",
  priority: "var(--warn)",
  subtask: "var(--accent2)",
  status: "var(--accent)",
  done: "var(--accent)",
  edit: "var(--muted)",
};

// The task details pop-up (TaskFull.dc.html): everything about one task, with
// the description in the notes editor, subtasks you can drag, attachments,
// activity, and the when, priority, list, tags and links on the right.
export default function TaskPopup({ task, onClose, openMenu }: Props) {
  const titleId = useId();
  const n = useNotes();
  const { settings } = useSettings();
  const { events } = useAllEvents();
  const now = useNow();
  const [later, setLater] = useState(false);
  const [calendar, setCalendar] = useState<DOMRect | null>(null);
  const [actOpen, setActOpen] = useState(false);
  const [picking, setPicking] = useState<"attach" | "link" | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const commands = useRef<EditorCommands | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  const done = Boolean(task.Completed);
  const status = done ? "done" : (task.Status ?? "todo");
  const priority = (task.Priority ?? 0) as PriorityValue;
  const list = listFor(task.List);
  const today = startOfDay(now);
  const words = (task.Notes ?? "").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  const blocked = blockedEvents(task, events);
  const activity = task.Activity ?? [];
  const shownActivity = actOpen ? [...activity].reverse() : activity.slice(-1);
  const dueText = task.Due ? formatDate(task.Due, today) : "Someday";

  const onDesc = useCallback((md: string) => setDescription(taskRef.current, md), []);
  const menuAt = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, items);
  };

  const moreMenu = (): MenuItem[] => [
    { label: "Duplicate", onSelect: () => duplicateTask(task) },
    { label: "Copy as text", onSelect: () => void navigator.clipboard?.writeText(`${task.Title}${task.Notes ? `\n\n${task.Notes}` : ""}`) },
    { type: "separator" },
    {
      label: "Move to Recycle Bin",
      danger: true,
      icon: <Trash2 size={13} />,
      onSelect: () => {
        onClose();
        deleteTasks([task]);
      },
    },
  ];

  const attachFromPc = async () => {
    if (!inTauri) return toast("Attachments work in the Project Life app.");
    const picked = await openFile({ multiple: true });
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : [];
    const added: Attachment[] = [];
    for (const p of paths) {
      try {
        const a = await attachFile(task.Id, p);
        added.push({ Id: crypto.randomUUID().replace(/-/g, ""), Kind: "file", Name: a.name, Path: a.path, Size: a.size });
      } catch (e) {
        toast(`Couldn't attach that file: ${String(e)}`);
      }
    }
    if (added.length) {
      const t = taskRef.current;
      patch(t, { Attachments: [...(t.Attachments ?? []), ...added] }, added.length === 1 ? `Attached ${added[0].Name}` : `Attached ${added.length} files`);
    }
  };

  const attachNote = (name: string) => {
    const t = taskRef.current;
    if ((t.Attachments ?? []).some((a) => a.Kind === "note" && a.Path === name)) return;
    patch(t, { Attachments: [...(t.Attachments ?? []), { Id: crypto.randomUUID().replace(/-/g, ""), Kind: "note", Name: titleOf(name), Path: name }] }, `Attached the note “${titleOf(name)}”`);
  };

  const removeAttached = (a: Attachment) => {
    const t = taskRef.current;
    patch(t, { Attachments: (t.Attachments ?? []).filter((x) => x.Id !== a.Id) }, `Removed ${a.Name}`);
    if (a.Kind === "file") void removeAttachment(a.Path);
  };

  const openAttached = (a: Attachment) => {
    if (a.Kind === "note") {
      onClose();
      void n.activate(a.Path);
    } else void openAttachment(a.Path).catch((e) => toast(String(e)));
  };

  const toolbar: { label: string; icon: ReactNode; run: (e: Editor) => void; sep?: boolean }[] = [
    { label: "Bold", icon: <Bold size={16} />, run: (e) => e.chain().focus().toggleBold().run() },
    { label: "Italic", icon: <Italic size={16} />, run: (e) => e.chain().focus().toggleItalic().run() },
    { label: "Underline", icon: <Underline size={16} />, run: (e) => e.chain().focus().toggleUnderline().run(), sep: true },
    { label: "Heading", icon: <Heading size={16} />, run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bulleted list", icon: <List size={16} />, run: (e) => e.chain().focus().toggleBulletList().run() },
    { label: "Checklist", icon: <ListChecks size={16} />, run: (e) => e.chain().focus().toggleTaskList().run() },
    { label: "Quote", icon: <MessageSquareQuote size={16} />, run: (e) => e.chain().focus().toggleBlockquote().run(), sep: true },
    { label: "Link", icon: <Link2 size={16} />, run: () => commands.current?.link() },
    { label: "Code", icon: <Code size={16} />, run: (e) => e.chain().focus().toggleCode().run() },
    { label: "Attach image", icon: <ImageIcon size={16} />, run: () => commands.current?.image() },
  ];

  return (
    <Popup onClose={onClose} width={1140} height={920} labelledBy={titleId}>
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-side pr-4 pl-6">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-[30px] items-center rounded-[9px] border border-line bg-panel px-2.5 font-mono text-11 tracking-[0.08em] text-muted">TASK</span>
          <div className="flex min-w-0 items-center gap-2 text-13 text-muted">
            <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: list.color }} />
            <span className="shrink-0">{list.name}</span>
            <span aria-hidden="true">/</span>
            <span id={titleId} className="truncate font-medium text-text">
              {task.Title}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="mr-1.5 flex items-center gap-2 font-mono text-11 text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent2" />
            Saved
          </span>
          {!done && (
            <div className="relative">
              <button
                data-later-button
                aria-haspopup="menu"
                aria-expanded={later}
                onClick={() => setLater((o) => !o)}
                className="flex h-10 items-center gap-2 rounded-[12px] border border-line px-3.5 text-13 font-medium hover:bg-panel"
              >
                <Clock3 size={15} strokeWidth={2} />
                Later
              </button>
              {later && <LaterMenu task={task} onClose={() => setLater(false)} />}
            </div>
          )}
          <button
            onClick={() => toggleTask(task)}
            className={clsx("flex h-10 items-center gap-2 rounded-[12px] border border-accent px-4 text-13 font-semibold", done ? "bg-accent text-accent-ink" : "text-text hover:bg-panel")}
          >
            <Check size={15} strokeWidth={2.6} />
            {done ? "Completed" : "Mark complete"}
          </button>
          <button aria-label="More" onClick={(e) => menuAt(e, moreMenu())} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
            <Ellipsis size={17} />
          </button>
          <button aria-label="Close" title="Close (Esc)" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
            <X size={16} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto" style={{ background: "radial-gradient(900px 480px at 0% -10%, var(--glow), transparent 60%), var(--bg)" }}>
          <div className="flex flex-col gap-5 px-9 pt-[26px] pb-7">
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3.5">
                <button
                  role="checkbox"
                  aria-checked={done}
                  aria-label={done ? "Mark not done" : "Mark done"}
                  onClick={() => toggleTask(task)}
                  className="-mt-0.5 -mr-1.5 -ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center"
                >
                  <span
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-accent-ink"
                    style={{ border: `2px solid ${done ? "var(--accent)" : priority ? priorityColor[priority] : "var(--faint)"}`, background: done ? "var(--accent)" : "transparent" }}
                  >
                    {done && <Check size={16} strokeWidth={3.2} />}
                  </span>
                </button>
                <TitleField
                  task={task}
                  className={clsx(
                    "m-0 block min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 font-head text-30 leading-[1.2] font-bold tracking-[-0.02em] outline-none",
                    done ? "text-muted line-through" : "text-text",
                  )}
                />
              </div>
              <div className="flex flex-wrap gap-2 pl-[34px] text-13">
                <button onClick={(e) => setCalendar(e.currentTarget.getBoundingClientRect())} className="flex h-8 items-center gap-2 rounded-[10px] border border-line bg-panel px-3 hover:border-faint">
                  <CalendarDays size={14} strokeWidth={2} />
                  {task.Due ? `${dueText}${task.DueTime ? `, ${formatTime(task.DueTime)}` : ""}` : "No date"}
                </button>
                <span className="flex h-8 items-center gap-2 rounded-[10px] border border-line bg-panel px-3" style={{ color: priorityColor[priority] }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 21V4h12l-2.5 4L17 12H5" />
                  </svg>
                  {priorityLabel[priority]} priority
                </span>
                <span className="flex h-8 items-center rounded-[10px] border border-line bg-panel px-3">{statusLabel[status]}</span>
                {(task.Tags ?? []).map((t) => (
                  <span key={t} className="flex h-8 items-center rounded-[10px] bg-accent-soft px-3 font-medium text-accent">
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <SectionLabel>DESCRIPTION</SectionLabel>
                <span className="font-mono text-11 text-muted">
                  {words} {words === 1 ? "word" : "words"} · Markdown
                </span>
              </div>
              <div className="overflow-hidden rounded-[20px] border border-line bg-panel">
                <div role="toolbar" aria-label="Formatting" className="flex h-11 items-center gap-0.5 border-b border-line px-2.5 text-muted">
                  {toolbar.map((b) => (
                    <span key={b.label} className="flex items-center">
                      <button
                        aria-label={b.label}
                        title={b.label}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => editor && b.run(editor)}
                        className="flex h-9 w-9 items-center justify-center rounded-[9px] hover:bg-panel2 hover:text-text"
                      >
                        {b.icon}
                      </button>
                      {b.sep && <span className="mx-1.5 h-5 w-px bg-line" />}
                    </span>
                  ))}
                  <div className="flex-1" />
                  <span className="px-2 font-mono text-11">Type / for blocks</span>
                </div>
                <div className="task-desc">
                  <VisualEditor
                    key={task.Id}
                    initial={task.Notes ?? ""}
                    readable={false}
                    caret={caret}
                    keys={n.keys}
                    keyFor={n.keyFor}
                    onChange={onDesc}
                    openMenu={openMenu}
                    onEmoji={() => editor?.chain().focus().insertContent(":").run()}
                    onEditor={setEditor}
                    linkPreviews={settings.LinkPreviews !== false}
                    commands={commands}
                  />
                </div>
              </div>
            </section>

            <Subtasks task={task} today={today} />

            <section className="flex flex-col gap-2.5">
              <SectionLabel>ATTACHMENTS</SectionLabel>
              <div className="flex flex-wrap gap-2.5">
                {(task.Attachments ?? []).map((a) => (
                  <AttachmentCard key={a.Id} a={a} onOpen={() => openAttached(a)} onRemove={() => removeAttached(a)} modified={n.notes.find((x) => x.name === a.Path)?.modified} />
                ))}
                <button
                  onClick={(e) =>
                    menuAt(e, [
                      { label: "A file from this PC…", icon: <Paperclip size={13} />, onSelect: () => void attachFromPc() },
                      { label: "A note…", icon: <FileText size={13} />, onSelect: () => setPicking("attach") },
                    ])
                  }
                  className="flex h-[52px] w-[150px] shrink-0 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-line text-13 text-muted hover:border-faint hover:text-text"
                >
                  <Plus size={16} strokeWidth={2} />
                  Add file
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <SectionLabel>ACTIVITY</SectionLabel>
                {activity.length > 1 && (
                  <button aria-expanded={actOpen} onClick={() => setActOpen((o) => !o)} className="h-7 rounded-[8px] px-2 text-12 text-muted hover:bg-panel hover:text-text">
                    {actOpen ? "Show less" : `Show all ${activity.length}`}
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3 pl-1.5">
                {shownActivity.map((a, i) => (
                  <div key={`${a.At}-${i}`} className="flex items-center gap-3.5 text-13">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: activityDot[a.Kind] }} />
                    <span className="flex-1">{a.Text}</span>
                    <span className="font-mono text-11 text-muted">{activityWhen(a.At, now)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>

        <aside className="flex w-[340px] shrink-0 flex-col gap-[18px] overflow-y-auto border-l border-line bg-side p-[22px]">
          <div className="flex flex-col gap-2.5">
            <SectionLabel>STATUS</SectionLabel>
            <div role="radiogroup" aria-label="Status" className="grid grid-cols-3 gap-1 rounded-[13px] border border-line bg-panel p-1">
              {statuses.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={status === s}
                  onClick={() => setStatus(task, s)}
                  className={clsx(
                    "h-9 rounded-[10px] text-13 font-medium",
                    status === s ? (s === "done" ? "bg-accent text-accent-ink" : "bg-panel2 text-text") : "text-muted hover:text-text",
                  )}
                >
                  {statusLabel[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>WHEN</SectionLabel>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1.5 text-12 text-muted">
                Due date
                <button
                  aria-label="Due date"
                  onClick={(e) => setCalendar(e.currentTarget.getBoundingClientRect())}
                  className="h-[42px] rounded-[12px] border border-line bg-panel px-3 text-left text-14 text-text hover:border-faint"
                >
                  {task.Due ? dueText : <span className="text-muted">Someday</span>}
                </button>
              </div>
              <TimeField task={task} />
            </div>
            <div className="flex flex-col overflow-hidden rounded-[14px] border border-line text-13">
              <PropRow label="Reminder" border>
                <button onClick={(e) => menuAt(e, reminderMenu(task))} className="h-[30px] rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2">
                  {task.Reminder ? reminderLabel[task.Reminder] : "None"}
                </button>
              </PropRow>
              <PropRow label="Repeat" border>
                <button onClick={(e) => menuAt(e, repeatMenu(task))} className="h-[30px] rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2">
                  {task.Repeat ? repeatLabel[task.Repeat] : "Never"}
                </button>
              </PropRow>
              <PropRow label="Estimate">
                <button onClick={(e) => menuAt(e, estimateMenu(task))} className="h-[30px] rounded-[8px] bg-panel px-2.5 font-medium hover:bg-panel2">
                  {task.Estimate ? estimateLabel(task.Estimate) : "None"}
                </button>
              </PropRow>
            </div>
            <button
              onClick={() => blockTime(task)}
              className="flex h-[42px] items-center justify-center gap-2 rounded-[12px] border border-accent text-13 font-semibold text-text hover:bg-panel"
            >
              <CalendarPlus size={15} strokeWidth={2} />
              Block time on my schedule
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>PRIORITY</SectionLabel>
            <div role="radiogroup" aria-label="Priority" className="grid grid-cols-4 gap-1 rounded-[13px] border border-line bg-panel p-1">
              {priorities.map(({ p, label }) => (
                <button
                  key={p}
                  role="radio"
                  aria-checked={priority === p}
                  onClick={() => setPriority(task, p)}
                  className={clsx("h-[34px] rounded-[10px] text-12 font-medium", priority === p ? (p ? "text-accent-ink" : "bg-panel2 text-text") : "text-muted hover:text-text")}
                  style={priority === p && p ? { background: priorityColor[p] } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>LIST AND TAGS</SectionLabel>
            <button
              onClick={(e) => menuAt(e, listMenu(task))}
              className="flex h-[42px] items-center gap-2.5 rounded-[12px] border border-line bg-panel px-3.5 text-left text-14 hover:border-faint"
            >
              <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: list.color }} />
              <span className="flex-1">{list.name}</span>
              <ChevronDown size={14} strokeWidth={2} className="text-muted" />
            </button>
            <Tags task={task} />
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>LINKED</SectionLabel>
            {task.Note && (
              <LinkCard
                icon={<FileText size={16} strokeWidth={1.9} />}
                tone="accent"
                title={titleOf(task.Note)}
                sub={task.NoteTodo ? "Note · came from a to-do here" : "Note"}
                onOpen={() => {
                  onClose();
                  void n.activate(task.Note!);
                }}
                onRemove={task.NoteTodo ? undefined : () => patch(task, { Note: null }, "Unlinked the note")}
              />
            )}
            {blocked.map((e) => (
              <LinkCard
                key={e.Id}
                icon={<CalendarDays size={16} strokeWidth={2} />}
                tone="accent2"
                title={e.Title}
                sub={`Focus time · ${eventLabel(e, now)}`}
                onOpen={() => {
                  onClose();
                  requestSchedule({ kind: "open", id: e.Id });
                }}
                onRemove={() => unblock(e.Id)}
                removeLabel="Remove from the schedule"
              />
            ))}
            {!task.Note && (
              <button
                onClick={() => setPicking("link")}
                className="flex h-[42px] items-center justify-center gap-2 rounded-[12px] border border-dashed border-line text-13 text-muted hover:border-faint hover:text-text"
              >
                <Plus size={14} strokeWidth={2} />
                Link a note
              </button>
            )}
          </div>

          <div className="flex-1" />
          <div className="flex items-center justify-between border-t border-line pt-4">
            <span className="text-12 text-muted">
              Created {shortDate(task.Created)}
              {task.Edited ? ` · Edited ${ago(Date.parse(task.Edited), now.getTime()).toLowerCase()}` : ""}
            </span>
            <button
              aria-label="Delete task"
              title="Move to Recycle Bin"
              onClick={() => {
                onClose();
                deleteTasks([task]);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:border-danger hover:text-danger"
            >
              <Trash2 size={16} strokeWidth={1.8} />
            </button>
          </div>
        </aside>
      </div>

      {calendar && (
        <Calendar
          anchor={calendar}
          value={task.Due ?? null}
          time={task.DueTime ?? null}
          onPick={(due, time) => {
            setTaskDue(task, due, time);
            setCalendar(null);
          }}
          onClear={
            task.Due
              ? () => {
                  setTaskDue(task, null, null);
                  setCalendar(null);
                }
              : undefined
          }
          clearLabel="Someday"
          onClose={() => setCalendar(null)}
        />
      )}
      {picking && n.notebook && (
        <NotePicker
          notes={n.notes}
          notebook={n.notebook}
          newTab={false}
          onPick={(name) => {
            if (picking === "attach") attachNote(name);
            else patch(taskRef.current, { Note: name }, `Linked the note “${titleOf(name)}”`);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Popup>
  );
}

function activityWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000);
  if (days === 0) return now.getTime() - d.getTime() < 60_000 ? "Just now" : "Today";
  if (days === 1) return "Yesterday";
  return shortDate(iso);
}

function PropRow({ label, border, children }: { label: string; border?: boolean; children: ReactNode }) {
  return (
    <div className={clsx("flex h-11 items-center justify-between px-3.5", border && "border-b border-line")}>
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}

// The due time, typed: "5pm", "17:30", "noon". Empty is any time that day.
function TimeField({ task }: { task: Task }) {
  const [value, setValue] = useState(task.DueTime ? formatTime(task.DueTime) : "");
  useEffect(() => setValue(task.DueTime ? formatTime(task.DueTime) : ""), [task.DueTime]);
  const commit = () => {
    const text = value.trim();
    if (!text) return task.DueTime && setTaskDue(task, task.Due ?? null, null);
    const t = parseTime(text);
    if (!t) return setValue(task.DueTime ? formatTime(task.DueTime) : "");
    // A time with no day means today.
    setTaskDue(task, task.Due ?? new Date().toISOString().slice(0, 10), t);
  };
  return (
    <label className="flex flex-col gap-1.5 text-12 text-muted">
      Time
      <input
        value={value}
        placeholder="Any time"
        aria-label="Due time"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-[42px] rounded-[12px] border border-line bg-panel px-3 text-14 text-text outline-none placeholder:text-muted focus:border-faint"
      />
    </label>
  );
}

function Tags({ task }: { task: Task }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const tags = task.Tags ?? [];
  const add = () => {
    const t = draft.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t)) setTags(task, [...tags, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span key={t} className="group flex h-[30px] items-center gap-1 rounded-[9px] bg-accent-soft pr-1.5 pl-2.5 text-12 font-medium text-accent">
          #{t}
          <button aria-label={`Remove tag ${t}`} onClick={() => setTags(task, tags.filter((x) => x !== t))} className="flex h-5 w-5 items-center justify-center rounded-[6px] opacity-60 hover:opacity-100">
            <X size={12} strokeWidth={2.4} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          aria-label="New tag"
          placeholder="tag"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            add();
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setDraft("");
              setAdding(false);
            }
          }}
          className="h-[30px] w-28 rounded-[9px] border border-line bg-panel px-2.5 text-12 text-text outline-none"
        />
      ) : (
        <button onClick={() => setAdding(true)} className="h-[30px] rounded-[9px] border border-dashed border-line px-2.5 text-12 text-muted hover:border-faint hover:text-text">
          + Tag
        </button>
      )}
    </div>
  );
}

function LinkCard({ icon, tone, title, sub, onOpen, onRemove, removeLabel = "Unlink" }: { icon: ReactNode; tone: "accent" | "accent2"; title: string; sub: string; onOpen?: () => void; onRemove?: () => void; removeLabel?: string }) {
  return (
    <div className="group relative flex items-center gap-3 rounded-[14px] border border-line bg-panel p-3">
      <span className={clsx("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]", tone === "accent" ? "bg-accent-soft text-accent" : "bg-panel2 text-accent2")}>{icon}</span>
      <button onClick={onOpen} disabled={!onOpen} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="truncate text-13 font-medium">{title}</span>
        <span className="truncate text-12 text-muted">{sub}</span>
      </button>
      {onRemove && (
        <button aria-label={removeLabel} title={removeLabel} onClick={onRemove} className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted opacity-0 group-hover:opacity-100 hover:text-text focus:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

const imageExt = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentCard({ a, onOpen, onRemove, modified }: { a: Attachment; onOpen: () => void; onRemove: () => void; modified?: number }) {
  const image = a.Kind === "file" && imageExt.test(a.Name);
  const kind = a.Kind === "note" ? "Note" : image ? "Image" : (a.Name.split(".").pop()?.toUpperCase() ?? "File");
  const sub = a.Kind === "note" ? `Note${modified ? ` · edited ${ago(modified, Date.now()).toLowerCase()}` : ""}` : `${kind}${a.Size ? ` · ${sizeLabel(a.Size)}` : ""}`;
  return (
    <div className="group relative flex h-[52px] min-w-[200px] flex-1 items-center gap-3 rounded-[14px] border border-line bg-panel pr-3 pl-2">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" title={`Open ${a.Name}`}>
        <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]", a.Kind === "note" ? "bg-panel2 text-accent2" : "bg-accent-soft text-accent")}>
          {a.Kind === "note" ? <FileText size={16} strokeWidth={2} /> : image ? <ImageIcon size={16} strokeWidth={2} /> : <Paperclip size={16} strokeWidth={2} />}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-13 font-medium">{a.Name}</span>
          <span className="truncate font-mono text-11 text-muted">{sub}</span>
        </span>
      </button>
      <button aria-label={`Remove ${a.Name}`} onClick={onRemove} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted opacity-0 group-hover:opacity-100 hover:text-text focus:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}

// Subtasks with drag handles; Enter adds one; the list scrolls past about
// five. Double-click one to rename it.
function Subtasks({ task, today }: { task: Task; today: Date }) {
  const subs = task.Subtasks ?? [];
  const { done, total } = subtaskProgress(task);
  const [draft, setDraft] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string | null; before: boolean } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const drop = () => {
    if (dragging && over) {
      const i = subs.findIndex((s) => s.Id === over.id);
      const target = over.id === null ? null : over.before ? over.id : (subs[i + 1]?.Id ?? null);
      if (target !== dragging) moveSubtask(task, dragging, target);
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3.5">
        <SectionLabel>SUBTASKS</SectionLabel>
        <div className="h-[5px] flex-1 overflow-hidden rounded-[5px] bg-panel2">
          <div className="h-full rounded-[5px] bg-accent2 transition-[width] duration-300" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
        </div>
        <span className="font-mono text-11 text-muted">
          {done} of {total} done
        </span>
      </div>
      <div className="flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel">
        <div className="flex max-h-[220px] flex-col overflow-y-auto" onDragOver={(e) => dragging && e.preventDefault()} onDrop={drop}>
          {subs.map((s) => (
            <SubRow
              key={s.Id}
              task={task}
              sub={s}
              today={today}
              renaming={renaming === s.Id}
              onRename={(on) => setRenaming(on ? s.Id : null)}
              dragging={dragging === s.Id}
              line={over?.id === s.Id ? (over.before ? "before" : "after") : null}
              onDragStart={() => setDragging(s.Id)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(before) => setOver({ id: s.Id, before })}
            />
          ))}
        </div>
        <label className={clsx("flex h-[46px] items-center gap-3 pr-4 pl-[22px] text-muted", subs.length > 0 && "border-t border-line")}>
          <Plus size={18} strokeWidth={2} />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                e.preventDefault();
                addSubtask(task, draft);
                setDraft("");
              }
            }}
            placeholder="Add a subtask and press Enter"
            aria-label="Add a subtask"
            className="min-w-0 flex-1 bg-transparent text-14 text-text outline-none placeholder:text-muted"
          />
        </label>
      </div>
    </section>
  );
}

function SubRow({
  task,
  sub,
  today,
  renaming,
  onRename,
  dragging,
  line,
  onDragStart,
  onDragEnd,
  onDragOver,
}: {
  task: Task;
  sub: Subtask;
  today: Date;
  renaming: boolean;
  onRename: (on: boolean) => void;
  dragging: boolean;
  line: "before" | "after" | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (before: boolean) => void;
}) {
  const [value, setValue] = useState(sub.Text);
  const row = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={row}
      onDragOver={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onDragOver(e.clientY < r.top + r.height / 2);
      }}
      className={clsx(
        "group relative flex min-h-11 shrink-0 items-center gap-1 border-b border-line pr-3.5 pl-1.5 last:border-b-0",
        dragging && "opacity-40",
        line === "before" && "shadow-[inset_0_2px_0_var(--accent)]",
        line === "after" && "shadow-[inset_0_-2px_0_var(--accent)]",
      )}
    >
      <span
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", sub.Text);
          if (row.current) e.dataTransfer.setDragImage(row.current, 12, 20);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        title="Drag to reorder"
        className="flex h-8 w-5 cursor-grab items-center justify-center text-faint hover:text-muted"
      >
        <svg width="10" height="14" viewBox="0 0 12 14" fill="currentColor" aria-hidden="true">
          <circle cx="3.5" cy="2.5" r="1.3" />
          <circle cx="8.5" cy="2.5" r="1.3" />
          <circle cx="3.5" cy="7" r="1.3" />
          <circle cx="8.5" cy="7" r="1.3" />
          <circle cx="3.5" cy="11.5" r="1.3" />
          <circle cx="8.5" cy="11.5" r="1.3" />
        </svg>
      </span>
      <button role="checkbox" aria-checked={sub.Done} aria-label={sub.Text} onClick={() => toggleSubtask(task, sub)} className="flex h-11 w-11 items-center justify-center">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-[6px] text-accent-ink"
          style={{ border: `1.5px solid ${sub.Done ? "var(--accent2)" : "var(--faint)"}`, background: sub.Done ? "var(--accent2)" : "transparent" }}
        >
          {sub.Done && <Check size={12} strokeWidth={3.4} />}
        </span>
      </button>
      {renaming ? (
        <input
          autoFocus
          value={value}
          aria-label="Subtask"
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            renameSubtask(task, sub, value);
            onRename(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setValue(sub.Text);
              onRename(false);
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-14 text-text outline-none"
        />
      ) : (
        <span onDoubleClick={() => onRename(true)} className={clsx("min-w-0 flex-1 text-14", sub.Done ? "text-muted line-through" : "text-text")}>
          {sub.Text}
        </span>
      )}
      {sub.Due && !sub.Done && <span className="text-12 text-muted">{formatDue(sub.Due, null, today)}</span>}
      <button aria-label={`Remove ${sub.Text}`} onClick={() => removeSubtask(task, sub)} className="ml-1 flex h-7 w-7 items-center justify-center rounded-[8px] text-muted opacity-0 group-hover:opacity-100 hover:text-text focus:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
