import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import Dialog, { Button } from "./Dialog";
import { api, titleOf, type NoteInfo } from "../lib/api";
import type { ConfirmOptions } from "./ConfirmDialog";

interface Props {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  onRestored: (name: string) => void;
  onClose: () => void;
}

// Recycled files are "Title-yyyyMMdd-HHmmss-id.md"; show the title.
function recycledTitle(name: string) {
  const m = /^(.*)-\d{8}-\d{6}-[0-9a-f]+$/i.exec(titleOf(name));
  return m ? m[1] : titleOf(name);
}

export default function RecycleBin({ confirm, onRestored, onClose }: Props) {
  const [items, setItems] = useState<NoteInfo[]>([]);
  const refresh = useCallback(async () => setItems((await api.listTrash()).sort((a, b) => b.modified - a.modified)), []);
  useEffect(() => void refresh(), [refresh]);

  const restore = async (name: string) => {
    const restored = await api.restoreNote(name);
    onRestored(restored);
    await refresh();
  };
  const remove = async (name: string) => {
    if (!(await confirm({ title: "Delete permanently", message: `Permanently delete "${recycledTitle(name)}"? This can't be undone.`, okLabel: "Delete", cancelLabel: "Cancel", danger: true }))) return;
    await api.deleteTrash(name);
    await refresh();
  };
  const empty = async () => {
    if (!(await confirm({ title: "Empty Recycle Bin", message: `Permanently delete all ${items.length} recycled notes? This can't be undone.`, okLabel: "Delete all", cancelLabel: "Cancel", danger: true }))) return;
    for (const item of items) await api.deleteTrash(item.name);
    await refresh();
  };

  return (
    <Dialog
      title="Recycle Bin"
      width={460}
      onClose={onClose}
      footer={
        <>
          <Button danger disabled={!items.length} onClick={() => void empty()}>
            Empty Recycle Bin
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="flex flex-col gap-0.5">
        {items.map((item) => (
          <div key={item.name} className="group flex h-8 items-center gap-2 rounded-md px-2 hover:bg-hover">
            <span className="flex-1 truncate">{recycledTitle(item.name)}</span>
            <span className="text-[11px] text-muted">{new Date(item.modified).toLocaleDateString()}</span>
            <button className="invisible rounded p-1 text-muted hover:text-fg group-hover:visible" title="Restore" onClick={() => void restore(item.name)}>
              <RotateCcw size={13} />
            </button>
            <button className="invisible rounded p-1 text-muted hover:text-[#e5484d] group-hover:visible" title="Delete permanently" onClick={() => void remove(item.name)}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {items.length === 0 && <div className="px-2 py-3 text-muted">The Recycle Bin is empty.</div>}
      </div>
    </Dialog>
  );
}
