import { getVersion } from "@tauri-apps/api/app";
import { open as openFolder, save as saveFile } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import Dialog, { Button as DialogButton } from "../../components/Dialog";
import { clearNewsCache } from "../../home/news";
import { clearWeatherCache } from "../../home/weather";
import { connectAccount, disconnectAccount, setCalendarOn } from "../../accounts/actions";
import { appName, providerName, type Account as AccountRecord } from "../../accounts/model";
import { errorText, syncAccount } from "../../accounts/sync";
import { useAccounts } from "../../accounts/useAccounts";
import { accountsApi, inTauri, system, type DataInfo, type ProviderId } from "../../lib/api";
import { clockText, dateText } from "../../lib/format";
import { backupNow, flushAll } from "../../lib/jobs";
import { checkForUpdate, installUpdate, useUpdateState } from "../../lib/updates";
import { useSettings } from "../../lib/SettingsContext";
import { fromYmd, ymd } from "../../tasks/dates";
import { parseFile, type Task } from "../../tasks/model";
import { taskStore } from "../../tasks/useTasks";
import { ListGroup } from "../../ui/bits";
import { toast } from "../../ui/Toast";
import { Account, Action, Choice, Info, Note, Path, Toggle } from "../controls";
import ReleaseNotes from "../ReleaseNotes";
import { releases } from "../releases";

// ----- Connected accounts -----

const providerDesc: Record<ProviderId, string> = { microsoft: "Outlook calendar and Teams calls", google: "Google Calendar and Meet calls" };

export function Accounts() {
  const { settings, update } = useSettings();
  const { accounts } = useAccounts();
  const [available, setAvailable] = useState<Record<ProviderId, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<AccountRecord | null>(null);
  useEffect(() => {
    void accountsApi.available().then(setAvailable);
  }, []);

  const connect = async (provider: ProviderId, key: string) => {
    setBusy(key);
    try {
      const a = await connectAccount(provider);
      toast(`Connected ${a.Email || providerName[provider]}`);
    } catch (e) {
      toast(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const row = (provider: ProviderId) => {
    const mine = accounts.filter((a) => a.Provider === provider);
    const ready = available?.[provider] ?? false;
    if (!mine.length)
      return (
        <Account
          key={provider}
          label={providerName[provider]}
          desc={ready || !inTauri ? providerDesc[provider] : `${providerDesc[provider]}. This build doesn't have its ${providerName[provider]} app registration yet (docs/ACCOUNTS.md).`}
          connected={false}
          status={ready ? undefined : "Needs setup"}
          action={busy === provider ? "Waiting for the browser…" : undefined}
          disabled={!ready || busy !== null}
          onToggle={() => void connect(provider, provider)}
        />
      );
    return mine.map((a) => (
      <Account
        key={a.Id}
        label={providerName[provider]}
        desc={`${a.Email}${provider === "microsoft" ? (a.Work ? " · Work or school, with Teams meetings" : " · Personal: paste Teams links") : ""}`}
        connected
        warn={a.NeedsSignIn}
        status={a.NeedsSignIn ? "Sign in again" : undefined}
        action={busy === a.Id ? "Waiting for the browser…" : a.NeedsSignIn ? "Reconnect" : undefined}
        disabled={busy !== null}
        onToggle={() => (a.NeedsSignIn ? void connect(provider, a.Id) : setLeaving(a))}
      />
    ));
  };

  return (
    <>
      <ListGroup>
        {row("microsoft")}
        {row("google")}
        <Info label="Zoom" desc="Paste a zoom.us link into an event and its Join button opens it" value="Links only" />
        <Choice
          label="Sync calendars"
          value={settings.SyncEvery ?? "5"}
          onChange={(v) => update({ SyncEvery: v })}
          options={[
            { value: "5", label: "Every 5 minutes" },
            { value: "15", label: "Every 15 minutes" },
            { value: "open", label: "Only when open" },
          ]}
        />
        <Toggle label="Show declined events" desc="Invitations you said no to" value={settings.ShowDeclined === true} onChange={(v) => update({ ShowDeclined: v })} />
      </ListGroup>
      {accounts.map((a) => (
        <ListGroup key={a.Id} title={`${appName[a.Provider].toUpperCase()} · ${a.Email.toUpperCase()}`}>
          {a.Calendars.map((c) => (
            <Toggle
              key={c.Id}
              label={c.Name}
              desc={c.Primary ? "Your main calendar" : c.CanEdit ? undefined : "Read only"}
              value={c.On}
              onChange={(on) => setCalendarOn(a, c.Id, on)}
            />
          ))}
          {!a.Calendars.length && <Info label="Calendars" desc={a.Error ?? "They show up after the first sync"} />}
          <Action
            label={a.Error ? "Didn't sync" : "Last synced"}
            desc={a.Error ?? (a.LastSync ? dateText(new Date(a.LastSync), new Date()) + " at " + clockText(new Date(a.LastSync)) : "Not yet")}
            action="Sync now"
            disabled={a.NeedsSignIn}
            onClick={() => void syncAccount(a.Id)}
          />
        </ListGroup>
      ))}
      <Note>
        Sign-in happens in your browser, and Project Life keeps it in Windows Credential Manager, never in its files. Synced events can be changed here and the change goes to {accounts.length ? [...new Set(accounts.map((a) => appName[a.Provider]))].join(" and ") : "Outlook or Google Calendar"}; a whole repeating series is changed there.
      </Note>
      {leaving && (
        <Dialog
          title={`Disconnect ${providerName[leaving.Provider]}?`}
          width={440}
          onClose={() => setLeaving(null)}
          footer={
            <>
              <DialogButton onClick={() => setLeaving(null)}>Cancel</DialogButton>
              <DialogButton
                danger
                onClick={() => {
                  void disconnectAccount(leaving);
                  setLeaving(null);
                }}
              >
                Disconnect
              </DialogButton>
            </>
          }
        >
          <p className="m-0 leading-[1.6]">
            {leaving.Email}'s calendars leave Project Life. Nothing changes in {appName[leaving.Provider]}, and you can connect again any time.
          </p>
        </Dialog>
      )}
    </>
  );
}

// ----- Storage and backup -----

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function Storage() {
  const { settings, update } = useSettings();
  const [info, setInfo] = useState<DataInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [report, setReport] = useState<{ text: string; reload: boolean } | null>(null);

  useEffect(() => {
    void system.dataInfo().then(setInfo);
  }, []);

  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what);
    try {
      await job();
    } catch (e) {
      toast(String(e));
    } finally {
      setBusy(null);
    }
  };

  const chooseBackupFolder = async () => {
    const picked = await openFolder({ directory: true, multiple: false, title: "Choose a folder for backups", defaultPath: settings.BackupFolder ?? info?.defaultBackups });
    if (typeof picked === "string") update({ BackupFolder: picked });
  };

  const exportAll = () =>
    run("export", async () => {
      const target = await saveFile({ title: "Export everything", defaultPath: `Project Life export ${ymd(new Date())}.zip`, filters: [{ name: "Zip file", extensions: ["zip"] }] });
      if (!target) return;
      await flushAll();
      await system.exportEverything(target);
      toast("Exported everything");
    });

  const importCheckpoint = () =>
    run("import", async () => {
      const picked = await openFolder({ directory: true, multiple: false, title: "Choose Checkpoint's folder, its Data folder, or its notes folder" });
      if (typeof picked !== "string") return;
      await flushAll();
      const got = await system.importCheckpoint(picked);
      const tasks = got.tasks ? addCheckpointTasks(got.tasks) : { added: 0, same: 0 };
      const n = got.notes;
      const parts: string[] = [];
      if (n.copied) parts.push(`Added ${n.copied} note${n.copied === 1 ? "" : "s"} from ${got.from}.`);
      if (n.renamed) parts.push(`${n.renamed} had the same name as a note already here, so ${n.renamed === 1 ? "it was" : "they were"} saved with a number on the end.`);
      if (n.same) parts.push(`${n.same} ${n.same === 1 ? "was" : "were"} already here, word for word.`);
      if (!n.copied && !n.same) parts.push(`The notes in ${got.from} are already the ones Project Life uses.`);
      if (tasks.added) parts.push(`Added ${tasks.added} task${tasks.added === 1 ? "" : "s"}.`);
      if (tasks.same) parts.push(`${tasks.same} task${tasks.same === 1 ? " was" : "s were"} already here.`);
      if (!got.tasks) parts.push("Checkpoint had no tasks there.");
      parts.push("Nothing in Checkpoint changed.");
      setReport({ text: parts.join("\n\n"), reload: n.copied > 0 });
    });

  const lastBackup = settings.LastBackup ? `Last one ${dateText(fromYmd(settings.LastBackup), new Date()).toLowerCase()}` : "None yet";
  return (
    <>
      <ListGroup>
        <Path label="Data folder" desc="Settings, tasks, habits and goals" value={info?.data ?? "…"} actions={[{ label: "Open", onClick: () => void system.openDataFolder(), disabled: !inTauri }]} />
        <Toggle label="Daily backup" desc="Keeps the last 14 days" value={settings.Backup !== false} onChange={(v) => update({ Backup: v })} />
        <Path
          label="Backup folder"
          desc="Point this at OneDrive to back up off this PC"
          value={settings.BackupFolder ?? info?.defaultBackups ?? "…"}
          actions={[
            { label: "Change", onClick: () => void chooseBackupFolder(), disabled: !inTauri },
            ...(settings.BackupFolder ? [{ label: "Use the default", onClick: () => update({ BackupFolder: null }) }] : []),
            { label: "Open", onClick: () => void system.openBackupFolder(settings.BackupFolder ?? null), disabled: !inTauri },
          ]}
        />
        <Action
          label="Back up now"
          desc={lastBackup}
          action={busy === "backup" ? "Backing up…" : "Back up"}
          disabled={!inTauri || busy !== null}
          onClick={() =>
            void run("backup", async () => {
              await backupNow(update);
              toast("Backed up");
            })
          }
        />
        <Info label="Space used" desc={info && !info.notesInside ? "Includes the notes folder" : undefined} value={info ? size(info.bytes) : "…"} />
      </ListGroup>
      <ListGroup title="MOVE DATA">
        <Action
          label="Import from Checkpoint"
          desc="Brings in notes, tags, notebooks and tasks. Nothing in Checkpoint changes."
          action={busy === "import" ? "Importing…" : "Import"}
          tone="primary"
          disabled={!inTauri || busy !== null}
          onClick={() => void importCheckpoint()}
        />
        <Action label="Export everything" desc="A zip of Markdown and JSON files" action={busy === "export" ? "Exporting…" : "Export"} disabled={!inTauri || busy !== null} onClick={() => void exportAll()} />
      </ListGroup>
      {report && (
        <Dialog
          title="Imported from Checkpoint"
          width={460}
          onClose={() => (report.reload ? window.location.reload() : setReport(null))}
          footer={
            <DialogButton primary onClick={() => (report.reload ? window.location.reload() : setReport(null))}>
              OK
            </DialogButton>
          }
        >
          <p className="m-0 leading-[1.6] whitespace-pre-wrap">{report.text}</p>
        </Dialog>
      )}
    </>
  );
}

// Checkpoint's tasks use the same keys; the ones already here are skipped.
function addCheckpointTasks(text: string): { added: number; same: number } {
  let incoming: Task[];
  try {
    incoming = parseFile(text).Tasks;
  } catch {
    return { added: 0, same: 0 };
  }
  const store = taskStore();
  const file = store.getState().file;
  const have = new Set([...file.Tasks, ...file.Recycled].map((t) => t.Id));
  const fresh = incoming.filter((t) => !have.has(t.Id));
  if (fresh.length) {
    const at = new Date().toISOString();
    store.change((f) => ({ ...f, Tasks: [...f.Tasks, ...fresh.map((t) => ({ ...t, Activity: [...(t.Activity ?? []), { At: at, Text: "Imported from Checkpoint", Kind: "create" as const }] }))] }));
  }
  return { added: fresh.length, same: incoming.length - fresh.length };
}

// ----- Privacy -----

export function Privacy() {
  const { settings, update } = useSettings();
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  return (
    <>
      <ListGroup>
        <Info label="What goes online" desc="Only what you ask for: weather, news feeds, link previews, fonts, connected calendars, and a daily look for updates on GitHub" />
        <Toggle
          label="Save crash reports"
          desc="Kept on this PC in Data\Logs, never sent anywhere. Includes no note or task content."
          value={Boolean(settings.SaveCrashReports)}
          onChange={(v) => update({ SaveCrashReports: v })}
        />
        <Action label="Crash reports" desc="Open the folder to look at them or share one" action="Open logs" disabled={!inTauri} onClick={() => void system.openDataFolder("Logs")} />
        <Action
          label="Clear cached previews and news"
          action="Clear"
          onClick={() =>
            void system.clearCaches().then(() => {
              clearNewsCache();
              clearWeatherCache();
              toast("Cleared link previews, news and weather");
            })
          }
        />
        <Action label="Delete all data on this PC" desc="Can’t be undone. Export first." action="Delete" tone="danger" danger disabled={!inTauri} onClick={() => setConfirm(true)} />
      </ListGroup>
      {confirm && (
        <Dialog
          title="Delete all data?"
          width={460}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <DialogButton onClick={() => setConfirm(false)}>Cancel</DialogButton>
              <DialogButton danger disabled={typed !== "DELETE"} onClick={() => void system.deleteAllData().catch((e) => toast(String(e)))}>
                Delete everything
              </DialogButton>
            </>
          }
        >
          <div className="flex flex-col gap-3 leading-[1.6]">
            <p className="m-0">
              This deletes your settings, tasks, schedule, habits, goals, backups kept in the Data folder, and the notes kept there. A notes folder you chose somewhere else is left alone. Project Life then
              starts fresh.
            </p>
            <label className="flex flex-col gap-1.5 text-13 text-muted">
              Type DELETE to confirm
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                aria-label="Type DELETE to confirm"
                className="h-10 rounded-[11px] border border-line bg-panel px-3 font-mono text-14 text-text outline-none focus:border-danger"
              />
            </label>
          </div>
        </Dialog>
      )}
    </>
  );
}

// ----- About -----

const licenses: [string, string][] = [
  ["Tauri", "MIT or Apache-2.0"],
  ["React", "MIT"],
  ["TipTap and ProseMirror", "MIT"],
  ["CodeMirror", "MIT"],
  ["Tailwind CSS", "MIT"],
  ["Lucide icons", "ISC"],
  ["ical.js", "MPL-2.0"],
  ["React Grid Layout", "MIT"],
  ["Atkinson Hyperlegible", "SIL Open Font License 1.1"],
  ["Geist and Geist Mono", "SIL Open Font License 1.1"],
  ["Weather by Open-Meteo", "CC BY 4.0"],
  ["Place names from OpenStreetMap", "ODbL"],
];

export function About() {
  const { settings, update } = useSettings();
  const updates = useUpdateState();
  const [version, setVersion] = useState("0.1.0");
  const [open, setOpen] = useState<"notes" | "licenses" | null>(null);
  useEffect(() => {
    if (inTauri) void getVersion().then(setVersion);
  }, []);
  // The release's name, like Hyrule.
  const name = releases.find((r) => r.version.split(" ")[0] === version)?.name;
  return (
    <>
      <ListGroup>
        <Info label="Version" value={`${version} beta${name ? ` · ${name}` : ""}`} />
        {updates.kind === "ready" ? (
          <Action label={`Project Life ${updates.release.version} is ready`} desc="Restart to finish updating. Your data stays as it is." action="Restart now" tone="primary" onClick={() => void installUpdate()} />
        ) : (
          <Action
            label="Check for updates"
            desc={
              updates.kind === "checking"
                ? "Checking…"
                : updates.kind === "downloading"
                  ? `Downloading ${updates.release.version}…`
                  : updates.kind === "error"
                    ? updates.message
                    : updates.kind === "current"
                      ? "You have the newest version"
                      : settings.LastUpdateCheck
                        ? `Last checked ${dateText(new Date(settings.LastUpdateCheck), new Date()).toLowerCase()}`
                        : "Not checked yet"
            }
            action="Check now"
            disabled={!inTauri || updates.kind === "checking" || updates.kind === "downloading"}
            onClick={() => void checkForUpdate(update)}
          />
        )}
        <Action label="What’s new" action="Release notes" onClick={() => setOpen("notes")} />
        <Info label="Made by" value="Ultima, with Checkpoint at its heart" />
        <Action label="Open-source licenses" action="View" onClick={() => setOpen("licenses")} />
      </ListGroup>
      {open === "notes" && <ReleaseNotes onClose={() => setOpen(null)} />}
      {open === "licenses" && (
        <Dialog title="Open-source licenses" width={520} onClose={() => setOpen(null)}>
          <p className="mt-0 leading-[1.5] text-muted">Project Life is built on these, with thanks.</p>
          <div className="flex flex-col">
            {licenses.map(([name, license]) => (
              <div key={name} className="flex items-center justify-between gap-4 border-b border-line py-2.5 last:border-0">
                <span className="font-medium">{name}</span>
                <span className="text-13 text-muted">{license}</span>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}
