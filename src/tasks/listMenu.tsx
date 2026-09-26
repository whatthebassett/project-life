// Renaming, recoloring and deleting a list, from Tasks' list panel or Home's
// spaces: the right-click menu both use, and the dialogs behind it.
import { useState } from "react";
import { Palette, Pencil, Trash2 } from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import type { MenuItem } from "../components/ContextMenu";
import Dialog, { Button, Field, inputClass } from "../components/Dialog";
import { listColors, type ListColor, type ListRecord } from "./lists";
import type { Task } from "./model";
import { taskStore } from "./useTasks";

export function renameList(id: string, name: string) {
  const text = name.trim();
  if (!text) return;
  taskStore().change((f) => ({ ...f, Lists: f.Lists.map((l) => (l.Id === id ? { ...l, Name: text } : l)) }));
}

export function recolorList(id: string, color: ListColor) {
  taskStore().change((f) => ({ ...f, Lists: f.Lists.map((l) => (l.Id === id ? { ...l, Color: color } : l)) }));
}

// Where a deleted list's tasks go: Personal, or the first list left.
export function listHeir(list: ListRecord, lists: ListRecord[]): ListRecord | undefined {
  const rest = lists.filter((l) => l.Id !== list.Id);
  return rest.find((l) => l.Id === "personal") ?? rest[0];
}

export function deleteList(list: ListRecord) {
  taskStore().change((f) => {
    const to = listHeir(list, f.Lists);
    if (!to) return f;
    return { ...f, Lists: f.Lists.filter((l) => l.Id !== list.Id), Tasks: f.Tasks.map((t) => (t.List === list.Id ? { ...t, List: to.Id } : t)) };
  });
}

// Rename edits the name in place in Tasks; on Home it opens a dialog.
export function listActionsMenu(list: ListRecord, lists: ListRecord[], h: { rename: () => void; remove: () => void; renameDialog?: boolean }): MenuItem[] {
  return [
    { label: h.renameDialog ? "Rename…" : "Rename", icon: <Pencil size={13} />, onSelect: h.rename },
    {
      label: "Color",
      icon: <Palette size={13} />,
      children: listColors.map((c) => ({
        label: c.name,
        checked: list.Color === c.id,
        icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: `var(--${c.id})` }} />,
        onSelect: () => recolorList(list.Id, c.id),
      })),
    },
    { type: "separator" },
    { label: "Delete list…", icon: <Trash2 size={13} />, danger: true, disabled: lists.length <= 1, onSelect: h.remove },
  ];
}

// Asks before deleting, saying where its tasks will go.
export function DeleteListDialog({ list, lists, tasks, onDone }: { list: ListRecord; lists: ListRecord[]; tasks: Task[]; onDone: (deleted: boolean) => void }) {
  const moveTo = listHeir(list, lists);
  if (!moveTo) return null;
  const count = tasks.filter((t) => t.List === list.Id).length;
  return (
    <ConfirmDialog
      title={`Delete “${list.Name}”?`}
      message={count ? `Its ${count} ${count === 1 ? "task moves" : "tasks move"} to ${moveTo.Name}.` : "It has no tasks."}
      okLabel="Delete list"
      cancelLabel="Cancel"
      danger
      onResult={(ok) => {
        if (ok) deleteList(list);
        onDone(ok);
      }}
    />
  );
}

// Renaming where there's no room to do it in place (Home's spaces).
export function RenameListDialog({ list, onClose }: { list: ListRecord; onClose: () => void }) {
  const [name, setName] = useState(list.Name);
  const valid = name.trim().length > 0;
  const save = () => {
    if (!valid) return;
    renameList(list.Id, name);
    onClose();
  };
  return (
    <Dialog
      title="Rename list"
      width={360}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!valid} onClick={save}>
            Rename
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input
          autoFocus
          className={inputClass}
          value={name}
          aria-label="List name"
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Field>
    </Dialog>
  );
}
