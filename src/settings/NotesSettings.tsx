import { useEffect, useState } from "react";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import { api, inTauri, type FolderSwitch, type NotesFolderInfo } from "../lib/api";
import { runBeforeClose } from "../lib/closing";
import { saveSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import Dialog, { Button as DialogButton } from "../components/Dialog";
import { Button } from "../ui/Button";
import { ListGroup, ListRow } from "../ui/bits";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Switch } from "../ui/Switch";
import { Seg, Toggle } from "./controls";

// Settings → Notes: the editor, and where notes are kept. The folder part is
// Checkpoint's (including 1.1.2's fix): copying into a folder that already
// has notes adds yours alongside, and nothing there is replaced.
export default function NotesSettings() {
  const { settings, update } = useSettings();
  const [info, setInfo] = useState<NotesFolderInfo | null>(null);
  const [copy, setCopy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);

  useEffect(() => {
    void api
      .notesFolderInfo()
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  const change = async (path: string | null) => {
    setBusy(true);
    setError(null);
    try {
      // Everything being typed is written before the folder changes under it.
      await runBeforeClose();
      const result: FolderSwitch = await api.setNotesFolder(path, copy);
      const next = { ...settings, NotesFolder: path && result.path };
      update({ NotesFolder: next.NotesFolder });
      await saveSettings(next);
      if (copy && result.merged) {
        const parts = [`Added ${result.copied} note${result.copied === 1 ? "" : "s"} to the notes already in ${result.path}.`];
        if (result.renamed)
          parts.push(`${result.renamed} had the same name as a note already there, so ${result.renamed === 1 ? "it was" : "they were"} saved with a number on the end, like “Plans 2”.`);
        if (result.same) parts.push(`${result.same} ${result.same === 1 ? "was" : "were"} already there, word for word, so ${result.same === 1 ? "it was" : "they were"} left alone.`);
        parts.push("Your tags, pins and notebooks were combined with the folder's own. Nothing that was already there was replaced.");
        setReport(parts.join("\n\n"));
      } else window.location.reload();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const choose = async () => {
    const picked = await openFile({ directory: true, multiple: false, title: "Choose a folder for your notes", defaultPath: info?.path });
    if (typeof picked === "string") await change(picked);
  };

  return (
    <>
      <ListGroup title="EDITOR">
        <ListRow label="Open notes in" description="Switch any time with Ctrl /">
          <SegmentedControl
            label="Open notes in"
            surface="panel"
            size="sm"
            value={settings.EditorMode === "Markdown" ? "Markdown" : "Visual"}
            onChange={(v) => update({ EditorMode: v })}
            options={[
              { value: "Visual", label: "Visual" },
              { value: "Markdown", label: "Markdown" },
            ]}
          />
        </ListRow>
        <ListRow label="Link previews" description="Point at a link to see the page's title and description">
          <Switch label="Link previews" checked={settings.LinkPreviews !== false} onChange={(v) => update({ LinkPreviews: v })} />
        </ListRow>
        <ListRow label="Link titles" description="A pasted web address turns into its page's title">
          <Switch label="Link titles" checked={settings.LinkTitles !== false} onChange={(v) => update({ LinkTitles: v })} />
        </ListRow>
        <ListRow label="YouTube videos" description="A YouTube link on a line of its own plays in the note">
          <Switch label="YouTube videos" checked={settings.VideoEmbeds !== false} onChange={(v) => update({ VideoEmbeds: v })} />
        </ListRow>
        <Toggle label="Spell check" value={settings.SpellCheck !== false} onChange={(v) => update({ SpellCheck: v })} />
        <Seg
          label="Cursor"
          value={settings.Cursor ?? "line"}
          onChange={(v) => update({ Cursor: v })}
          options={[
            { value: "line", label: "Line" },
            { value: "block", label: "Block" },
            { value: "underline", label: "Underline" },
          ]}
        />
        <Toggle label="Open notes in a new tab" desc="Instead of replacing the note in the current tab" value={Boolean(settings.OpenInNewTab)} onChange={(v) => update({ OpenInNewTab: v })} />
        <ListRow label="Word wrap in Markdown">
          <Switch label="Word wrap in Markdown" checked={settings.WordWrap !== false} onChange={(v) => update({ WordWrap: v })} />
        </ListRow>
        <ListRow label="Line numbers in Markdown">
          <Switch label="Line numbers in Markdown" checked={Boolean(settings.LineNumbers)} onChange={(v) => update({ LineNumbers: v })} />
        </ListRow>
      </ListGroup>

      <ListGroup title="FILES">
        {info?.unavailable && (
          <ListRow
            label="Your folder can't be reached"
            description={`${info.chosen} isn't available right now, so Project Life is using the default folder. Reconnect the drive and restart Project Life, or choose another folder.`}
            danger
          />
        )}
        <ListRow label="Notes folder" description="Plain .md files you can open anywhere. A Checkpoint notes folder works here too.">
          <span className="flex shrink-0 items-center gap-2">
            <span className="max-w-[260px] truncate rounded-[9px] border border-dashed border-line px-[10px] py-2 font-mono text-11 text-muted" title={info?.path}>
              {info?.path ?? "…"}
            </span>
            <Button size="sm" disabled={busy || !info || !inTauri} onClick={() => void choose()}>
              Change
            </Button>
          </span>
        </ListRow>
        <ListRow
          label="Copy my notes to the new folder"
          description="Copies notes, pictures, tags, pins and the Recycle Bin, and leaves the originals where they are. If the folder already has notes, yours are added alongside them and nothing there is replaced. Off, Project Life just opens whatever notes are already there."
        >
          <Switch label="Copy my notes to the new folder" checked={copy} onChange={setCopy} />
        </ListRow>
        <ListRow label="Open the notes folder" description={info?.chosen ? "Or go back to the default folder, next to Project Life" : "In File Explorer"}>
          <span className="flex shrink-0 gap-2">
            {info?.chosen && (
              <Button size="sm" disabled={busy} onClick={() => void change(null)}>
                Use the default
              </Button>
            )}
            <Button size="sm" disabled={!inTauri} onClick={() => void api.openNotesFolder()}>
              Open
            </Button>
          </span>
        </ListRow>
      </ListGroup>
      {(busy || error) && <p className={error ? "m-0 text-12 leading-[1.5] text-danger" : "m-0 text-12 text-muted"}>{error ?? (copy ? "Copying your notes…" : "Switching folders…")}</p>}
      <p className="m-0 text-12 leading-[1.5] text-muted">Changing folders saves your settings and reloads Project Life from the new folder.</p>

      {report && (
        <Dialog
          title="Notes folder"
          width={440}
          onClose={() => window.location.reload()}
          footer={
            <DialogButton primary onClick={() => window.location.reload()}>
              OK
            </DialogButton>
          }
        >
          <p className="m-0 leading-[1.6] whitespace-pre-wrap">{report}</p>
        </Dialog>
      )}
    </>
  );
}
