// Adding calendars from the Schedule: a new one of your own, one subscribed
// to by link, or a file of events imported once. Plus renaming, which
// calendars of every kind share.
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import Dialog, { Button, Field, inputClass } from "../components/Dialog";
import { listColors, newListId, type ListColor, type ListRecord } from "../tasks/lists";
import { newId } from "../tasks/model";
import { taskStore } from "../tasks/useTasks";
import { Switch } from "../ui/Switch";
import { toast } from "../ui/Toast";
import { dateText } from "../lib/format";
import { fromYmd } from "../tasks/dates";
import type { CalEvent } from "./events";
import { subscribe } from "./feeds";
import { readIcs, spanOf, toCalEvents, type IcsCalendar } from "./ics";
import { eventStore } from "./useEvents";

// The color swatches every calendar dialog uses.
function ColorPicker({ value, onChange }: { value: ListColor; onChange: (c: ListColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2">
      {listColors.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(c.id)}
          className="flex h-8 w-8 items-center justify-center rounded-full text-accent-ink"
          style={{ background: `var(--${c.id})`, boxShadow: value === c.id ? `0 0 0 2px var(--panel), 0 0 0 4px var(--${c.id})` : undefined }}
        >
          {value === c.id && <Check size={14} strokeWidth={3} />}
        </button>
      ))}
    </div>
  );
}

// A color not in use yet, so a new calendar stands out from the rest.
function freshColor(taken: string[]): ListColor {
  return listColors.find((c) => !taken.includes(c.id))?.id ?? "hue-4";
}

// Adds a calendar as a list record, and gives back its id.
function addCalendar(name: string, color: ListColor, inTasks: boolean): ListRecord {
  const lists = taskStore().getState().file.Lists;
  const record: ListRecord = { Id: newListId(name, lists.map((l) => l.Id)), Name: name.trim(), Color: color, InTasks: inTasks };
  taskStore().change((f) => ({ ...f, Lists: [...f.Lists, record] }));
  return record;
}

function removeCalendar(id: string) {
  taskStore().change((f) => ({ ...f, Lists: f.Lists.filter((l) => l.Id !== id) }));
}

export function NewCalendarDialog({ onClose }: { onClose: () => void }) {
  const lists = taskStore().getState().file.Lists;
  const [name, setName] = useState("");
  const [color, setColor] = useState<ListColor>(() => freshColor(lists.map((l) => l.Color)));
  const [inTasks, setInTasks] = useState(false);
  const valid = name.trim().length > 0;
  const create = () => {
    if (!valid) return;
    const record = addCalendar(name, color, inTasks);
    toast(`Added the “${record.Name}” calendar`, () => removeCalendar(record.Id));
    onClose();
  };
  return (
    <Dialog
      title="New calendar"
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!valid} onClick={create}>
            Add calendar
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input
          autoFocus
          className={inputClass}
          value={name}
          placeholder="Birthdays"
          aria-label="Calendar name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </Field>
      <div className="mb-4">
        <div className="mb-1.5 text-12 text-muted">Color</div>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <label className="flex items-center justify-between gap-4 rounded-[12px] border border-line bg-panel px-3.5 py-3">
        <span className="flex flex-col gap-0.5">
          <span className="text-14">Also a list in Tasks</span>
          <span className="text-12 text-muted">Tasks can go on it, and it shows in Tasks and on Home.</span>
        </span>
        <Switch label="Also a list in Tasks" checked={inTasks} onChange={setInTasks} />
      </label>
    </Dialog>
  );
}

// Where each calendar app keeps the link to share.
const whereToFind: { app: string; steps: string }[] = [
  { app: "Google Calendar", steps: "On the web: Settings → click the calendar on the left → Integrate calendar → “Secret address in iCal format”." },
  { app: "Outlook", steps: "On the web: Settings → Calendar → Shared calendars → Publish a calendar → pick it, “Can view all details”, Publish → copy the ICS link." },
  { app: "iCloud", steps: "In Calendar, share the calendar as a Public Calendar and copy its webcal:// link." },
  { app: "Anything else", steps: "Look for “Subscribe”, “iCal” or “.ics”: holidays, sports teams and school calendars usually offer one." },
];

export function SubscribeDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<ListColor>("hue-4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const valid = /^(https?|webcals?):\/\/\S+$/i.test(url.trim());
  const go = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await subscribe(url, name, color);
      onClose();
    } catch (e) {
      setError(typeof e === "string" ? e : e instanceof Error ? e.message : "That calendar couldn't be read.");
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Subscribe to a calendar"
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!valid || busy} onClick={() => void go()}>
            {busy ? "Reading the calendar…" : "Subscribe"}
          </Button>
        </>
      }
    >
      <p className="mt-0 mb-4 leading-[1.5] text-muted">It stays up to date on its own, checking every hour. Its events are read-only here: change them where they come from.</p>
      <Field label="Calendar link">
        <input
          autoFocus
          className={inputClass}
          value={url}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          aria-label="Calendar link"
          onChange={(e) => (setUrl(e.target.value), setError(null))}
          onKeyDown={(e) => e.key === "Enter" && void go()}
        />
      </Field>
      <button
        type="button"
        aria-expanded={help}
        onClick={() => setHelp(!help)}
        className="-mt-2 mb-3 flex items-center gap-1 text-13 font-medium text-accent-text hover:underline"
      >
        Where do I find the link?
        <ChevronDown size={14} className={clsx("transition-transform", help && "rotate-180")} />
      </button>
      {help && (
        <div className="mb-4 flex flex-col gap-2.5 rounded-[12px] border border-line bg-panel px-3.5 py-3 text-13 leading-[1.5]">
          {whereToFind.map((w) => (
            <div key={w.app}>
              <span className="font-semibold">{w.app}. </span>
              <span className="text-muted">{w.steps}</span>
            </div>
          ))}
          <div className="text-12 text-muted">A secret address lets anyone who has it see the calendar, so keep it to yourself.</div>
        </div>
      )}
      <Field label="Name (optional)">
        <input className={inputClass} value={name} placeholder="The calendar's own name" aria-label="Calendar name" onChange={(e) => setName(e.target.value)} />
      </Field>
      <div>
        <div className="mb-1.5 text-12 text-muted">Color</div>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && (
        <div role="alert" className="mt-4 rounded-[12px] border border-line bg-panel px-3.5 py-2.5 text-13 text-danger">
          {error}
        </div>
      )}
    </Dialog>
  );
}

type Target = { kind: "new"; name: string; color: ListColor } | { kind: "existing"; id: string };

// Imports a .ics file once: its events become ordinary events here.
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const lists = taskStore().getState().file.Lists;
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; cal: IcsCalendar } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>({ kind: "new", name: "", color: freshColor(lists.map((l) => l.Color)) });
  const span = useMemo(() => (file ? spanOf(file.cal.events) : null), [file]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const cal = readIcs(await f.text(), new Date(), true);
      if (!cal.events.length) throw "There are no events in that file.";
      setFile({ name: f.name, cal });
      setTarget((t) => (t.kind === "new" ? { ...t, name: cal.name || f.name.replace(/\.ics$/i, "") } : t));
    } catch (e) {
      setFile(null);
      setError(typeof e === "string" ? e : "That file couldn't be read as a calendar.");
    }
  };

  const valid = Boolean(file) && (target.kind === "existing" || target.name.trim().length > 0);
  const run = () => {
    if (!file || !valid) return;
    const created = target.kind === "new" ? addCalendar(target.name, target.color, false) : null;
    const calendarId = created?.Id ?? (target as { id: string }).id;
    const calendarName = created?.Name ?? lists.find((l) => l.Id === calendarId)?.Name ?? "the calendar";
    // Importing the same file twice doesn't double anything up.
    const have = new Set(
      eventStore()
        .getState()
        .file.Events.filter((e) => e.Calendar === calendarId && e.Uid)
        .map((e) => `${e.Uid}|${e.Start}`),
    );
    const events: CalEvent[] = toCalEvents(file.cal.events, calendarId, () => newId()).filter((e) => !have.has(`${e.Uid}|${e.Start}`));
    const ids = new Set(events.map((e) => e.Id));
    eventStore().change((f) => ({ ...f, Events: [...f.Events, ...events] }));
    const skipped = file.cal.events.length - events.length;
    toast(
      `Imported ${events.length} ${events.length === 1 ? "event" : "events"} into ${calendarName}${skipped ? ` (${skipped} already there)` : ""}`,
      () => {
        eventStore().change((f) => ({ ...f, Events: f.Events.filter((e) => !ids.has(e.Id)) }));
        if (created) removeCalendar(created.Id);
      },
    );
    onClose();
  };

  return (
    <Dialog
      title="Import a calendar file"
      width={500}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!valid} onClick={run}>
            {file ? `Import ${file.cal.events.length} ${file.cal.events.length === 1 ? "event" : "events"}` : "Import"}
          </Button>
        </>
      }
    >
      <p className="mt-0 mb-4 leading-[1.5] text-muted">
        A one-time copy of an .ics file, from Google Calendar (Settings → Import &amp; export → Export), Outlook (Save calendar) or any calendar app. The events become yours to edit.
      </p>
      <input ref={input} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-line bg-panel px-3.5 py-3">
        <div className="min-w-0 flex-1">
          {file ? (
            <>
              <div className="truncate text-14 font-medium">{file.name}</div>
              <div className="text-12 text-muted">
                {file.cal.events.length} {file.cal.events.length === 1 ? "event" : "events"}
                {span && span.first !== span.last ? `, ${dateText(fromYmd(span.first), new Date())} to ${dateText(fromYmd(span.last), new Date())}` : ""}
              </div>
            </>
          ) : (
            <div className="text-14 text-muted">No file chosen</div>
          )}
        </div>
        <Button onClick={() => input.current?.click()}>{file ? "Choose another…" : "Choose file…"}</Button>
      </div>
      {error && (
        <div role="alert" className="mb-4 rounded-[12px] border border-line bg-panel px-3.5 py-2.5 text-13 text-danger">
          {error}
        </div>
      )}
      {file && (
        <>
          <Field label="Put them on">
            <select
              className={inputClass}
              aria-label="Put them on"
              value={target.kind === "new" ? "__new" : target.id}
              onChange={(e) =>
                setTarget(e.target.value === "__new" ? { kind: "new", name: file.cal.name || file.name.replace(/\.ics$/i, ""), color: freshColor(lists.map((l) => l.Color)) } : { kind: "existing", id: e.target.value })
              }
            >
              <option value="__new">A new calendar</option>
              {lists.map((l) => (
                <option key={l.Id} value={l.Id}>
                  {l.Name}
                </option>
              ))}
            </select>
          </Field>
          {target.kind === "new" && (
            <>
              <Field label="New calendar's name">
                <input className={inputClass} value={target.name} aria-label="New calendar's name" onChange={(e) => setTarget({ ...target, name: e.target.value })} />
              </Field>
              <div className="mb-1.5 text-12 text-muted">Color</div>
              <ColorPicker value={target.color} onChange={(color) => setTarget({ ...target, color })} />
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

// Renaming any calendar: a list's, or a subscribed one's.
export function RenameCalendarDialog({ name: initial, onRename, onClose }: { name: string; onRename: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0;
  const save = () => {
    if (!valid) return;
    onRename(name.trim());
    onClose();
  };
  return (
    <Dialog
      title="Rename calendar"
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
          aria-label="Calendar name"
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Field>
    </Dialog>
  );
}
