import { X } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { removeAttachment } from "../lib/api";
import { Button } from "../ui/Button";
import { Popup, PopupHeader } from "../ui/Popup";
import { listFor } from "./lists";
import { KEEP_DELETED_DAYS, purge, restore } from "./model";
import { useTasks } from "./useTasks";
import { shortDate } from "./views";

// Deleted tasks, kept for 30 days: restore one, delete one for good, or
// empty the bin.
export default function RecycleBinPopup({ onClose }: { onClose: () => void }) {
  const { recycled, store } = useTasks();
  const [confirm, setConfirm] = useState<"empty" | string | null>(null);
  const one = (id: string) => new Set([id]);

  return (
    <Popup onClose={onClose} width={620} height={640} label="Tasks Recycle Bin">
      <PopupHeader tag="RECYCLE BIN" onClose={onClose}>
        {`Deleted tasks stay here for ${KEEP_DELETED_DAYS} days`}
      </PopupHeader>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3">
        {recycled.length === 0 && <div className="flex flex-1 items-center justify-center text-14 text-muted">The Recycle Bin is empty.</div>}
        {recycled.map((t) => {
          const list = listFor(t.List);
          return (
            <div key={t.Id} className="flex min-h-[58px] items-center gap-3 border-b border-line px-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate text-14 font-medium">{t.Title}</span>
                <span className="flex items-center gap-2 text-12 text-muted">
                  <span className="h-[7px] w-[7px] rounded-[2px]" style={{ background: list.color }} />
                  {list.name} · Deleted {t.Deleted ? shortDate(t.Deleted) : ""}
                </span>
              </div>
              <Button size="md" onClick={() => store.change((f) => restore(f, one(t.Id)))}>
                Restore
              </Button>
              <button
                aria-label={`Delete “${t.Title}” for good`}
                title="Delete for good"
                onClick={() => setConfirm(t.Id)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-muted hover:bg-panel hover:text-danger"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
      <footer className="flex h-[68px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6">
        <span className="text-13 text-muted">
          {recycled.length} {recycled.length === 1 ? "task" : "tasks"}
        </span>
        <div className="flex gap-2.5">
          <Button disabled={!recycled.length} onClick={() => store.change((f) => restore(f, new Set(f.Recycled.map((t) => t.Id))))}>
            Restore all
          </Button>
          <Button variant="danger" disabled={!recycled.length} onClick={() => setConfirm("empty")}>
            Empty Recycle Bin
          </Button>
        </div>
      </footer>
      {confirm && (
        <ConfirmDialog
          title={confirm === "empty" ? "Empty the Recycle Bin?" : "Delete this task for good?"}
          message={confirm === "empty" ? `All ${recycled.length} tasks will be gone for good. This can't be undone.` : "It can't be restored after this."}
          okLabel={confirm === "empty" ? "Empty" : "Delete"}
          cancelLabel="Cancel"
          danger
          onResult={(ok) => {
            if (ok) {
              const ids = confirm === "empty" ? new Set(recycled.map((t) => t.Id)) : one(confirm);
              // Project Life's copies of their attached files go too.
              for (const t of recycled) if (ids.has(t.Id)) for (const a of t.Attachments ?? []) if (a.Kind === "file") void removeAttachment(a.Path);
              store.change((f) => purge(f, ids));
            }
            setConfirm(null);
          }}
        />
      )}
    </Popup>
  );
}
