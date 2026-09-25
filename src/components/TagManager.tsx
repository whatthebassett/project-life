import { Pencil, Plus, Trash2 } from "lucide-react";
import Dialog, { Button } from "./Dialog";
import type { Notebook, Tag } from "../lib/notebook";

interface Props {
  notebook: Notebook;
  onNew: () => void;
  onEdit: (tag: Tag) => void;
  onDelete: (tag: Tag) => void;
  onClose: () => void;
}

export default function TagManager({ notebook, onNew, onEdit, onDelete, onClose }: Props) {
  const counts = new Map<string, number>();
  for (const ids of Object.values(notebook.tags.Notes)) for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  return (
    <Dialog title="Manage tags" width={400} onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className="flex flex-col gap-0.5">
        {notebook.tags.Tags.map((tag) => (
          <div key={tag.Id} className="group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
            <span className="h-3 w-3 rounded-full" style={{ background: tag.Color }} />
            <span className="flex-1 truncate">{tag.Name}</span>
            <span className="text-[11px] text-muted">{counts.get(tag.Id) ?? 0}</span>
            <button className="invisible rounded p-1 text-muted hover:text-fg group-hover:visible" title="Edit" onClick={() => onEdit(tag)}>
              <Pencil size={13} />
            </button>
            <button className="invisible rounded p-1 text-muted hover:text-[#e5484d] group-hover:visible" title="Delete" onClick={() => onDelete(tag)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {notebook.tags.Tags.length === 0 && <div className="px-2 py-3 text-muted">No tags yet.</div>}
      </div>
      <button className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-accent-text hover:bg-hover" onClick={onNew}>
        <Plus size={14} /> New tag
      </button>
      <p className="mt-3 text-[11.5px] text-muted">Deleting a tag never deletes notes.</p>
    </Dialog>
  );
}
