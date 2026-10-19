import { clockShort, hour12, ordinal } from "../lib/format";
import { locale } from "../lib/format";
import clsx from "clsx";
import { AlignLeft, ArrowRight, Bell, CalendarDays, CheckSquare, ChevronDown, Clock, FileText, FolderClosed, Globe, Link2, MapPin, Plus, Repeat, TriangleAlert, Video, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem } from "../components/ContextMenu";
import NotePicker from "../components/NotePicker";
import { meetingPlan, patchSynced } from "../accounts/actions";
import { patchFeedEvent } from "./feeds";
import { isHoliday } from "./holidays";
import { appName, calendarKey, providerName, splitKey } from "../accounts/model";
import { useAccounts } from "../accounts/useAccounts";
import { openUrl, titleOf } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import Calendar from "../tasks/Calendar";
import { addDays, fromYmd, startOfDay, ymd } from "../tasks/dates";
import { currentLists, listFor } from "../tasks/lists";
import { useTasks } from "../tasks/useTasks";
import { Button } from "../ui/Button";
import { Popup } from "../ui/Popup";
import { allDayRange, type Scope } from "./actions";
import {
  callNames,
  clashWith,
  commonZones,
  dayOccurrences,
  findJoinLink,
  fromStamp,
  fromZone,
  isReadOnly,
  localStamp,
  localZone,
  nextFree,
  reminderChoices,
  toZone,
  zoneCity,
  zoneName,
  type CalEvent,
  type CallKind,
  type EventKind,
  type EventRepeat,
  type Occurrence,
} from "./events";
import { shortTime, softOf } from "./look";
import ScopeDialog from "./ScopeDialog";
import TaskPicker from "./TaskPicker";

interface Props {
  // The event being edited (or a new one), and the day it was opened from.
  event: CalEvent;
  occ: Occurrence | null;
  isNew: boolean;
  events: CalEvent[];
  now: Date;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  onSave: (event: CalEvent, scope: Scope) => void;
  onDelete: (scope: Scope) => void;
  onClose: () => void;
}

// The editor's view of an event: the day and times as they read in the
// event's own time zone.
interface Form {
  kind: EventKind;
  title: string;
  day: string;
  start: string;
  end: string;
  allDay: boolean;
  calendar: string;
  repeat: EventRepeat | "never";
  zone: string | null;
  call: CallKind | null;
  joinUrl: string;
  place: string;
  reminders: number[];
  description: string;
  note: string | null;
  task: string | null;
}

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMinutes = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeLabel = (t: string) => (t === "24:00" ? (hour12() ? "12 AM" : "24:00") : clockShort(new Date(`2000-01-01T${t}`)));
// The day preview: a whole day, this tall per hour.
const PREVIEW_HOUR = 44;

// A control inside a row, and a quieter one beside it.
const field = "flex h-9 min-w-0 items-center rounded-[10px] bg-panel2 px-3 text-14 text-text hover:bg-[color-mix(in_srgb,var(--panel2)_80%,var(--text))]";
const quiet = "flex h-8 min-w-0 items-center rounded-[9px] px-2.5 text-12 font-medium text-muted hover:bg-panel2 hover:text-text";

function formOf(e: CalEvent, occ: Occurrence | null): Form {
  const zone = e.TimeZone && e.TimeZone !== localZone() ? e.TimeZone : null;
  const start = occ?.start ?? fromStamp(e.Start);
  const end = occ?.end ?? fromStamp(e.End);
  const wallStart = toZone(start, zone);
  const wallEnd = toZone(end, zone);
  const endTime = wallEnd.slice(0, 10) > wallStart.slice(0, 10) && wallEnd.slice(11) === "00:00" ? "24:00" : wallEnd.slice(11);
  return {
    kind: e.Kind,
    title: e.Title,
    day: wallStart.slice(0, 10),
    start: wallStart.slice(11),
    end: e.AllDay ? "24:00" : endTime,
    allDay: Boolean(e.AllDay),
    calendar: e.Calendar,
    repeat: e.Repeat ?? "never",
    zone,
    call: e.Call ?? null,
    joinUrl: e.JoinUrl ?? "",
    place: e.Place ?? "",
    reminders: e.Reminders ?? [],
    description: e.Description ?? "",
    note: e.Note ?? null,
    task: e.Task ?? null,
  };
}

// The moments the form stands for, on this PC's clock.
function momentsOf(f: Form): { start: Date; end: Date } {
  if (f.allDay) return { start: fromYmd(f.day), end: addDays(fromYmd(f.day), 1) };
  const start = fromZone(`${f.day}T${f.start}`, f.zone);
  if (f.kind === "reminder") return { start, end: start };
  const end = f.end === "24:00" ? fromZone(`${ymd(addDays(fromYmd(f.day), 1))}T00:00`, f.zone) : fromZone(`${f.day}T${f.end}`, f.zone);
  return { start, end: end > start ? end : new Date(start.getTime() + 15 * 60_000) };
}

function eventOf(f: Form, base: CalEvent): CalEvent {
  const { start, end } = momentsOf(f);
  const found = findJoinLink(f.joinUrl, f.place, f.description);
  return {
    ...base,
    Kind: f.kind,
    Title: f.title.trim() || (f.kind === "focus" ? "Focus time" : f.kind === "reminder" ? "Reminder" : "Untitled event"),
    ...(f.allDay ? allDayRange(f.day) : { Start: localStamp(start), End: localStamp(end), AllDay: false }),
    Calendar: f.calendar,
    Repeat: f.repeat === "never" ? null : f.repeat,
    TimeZone: f.zone,
    Call: f.kind === "reminder" ? null : f.call,
    JoinUrl: f.call ? (f.joinUrl.trim() || found?.url || null) : null,
    Place: f.place.trim(),
    Reminders: [...f.reminders].sort((a, b) => a - b),
    Description: f.description,
    Note: f.note,
    Task: f.task,
    // Reminders whose time has already gone by stay quiet.
    Reminded: new Date().toISOString(),
  };
}

// The new event pop-up, also used to edit one. The title with a one-line
// summary, then two groups of rows (When: date, time with a clash warning,
// repeat and time zone; Details: calendar, place and video call, reminders),
// a description with links, and that day on the right, scrolled to the event.
export default function EventPopup({ event, occ, isNew, events, now, openMenu, onSave, onDelete, onClose }: Props) {
  const n = useNotes();
  const { tasks } = useTasks();
  const [f, setF] = useState<Form>(() => formOf(event, occ));
  const [calendarAt, setCalendarAt] = useState<DOMRect | null>(null);
  const [picking, setPicking] = useState<"note" | "task" | null>(null);
  const [asking, setAsking] = useState<"Change" | "Delete" | null>(null);
  const [pasteLink, setPasteLink] = useState(false);
  const set = (fields: Partial<Form>) => setF((cur) => ({ ...cur, ...fields }));
  const { accounts } = useAccounts();

  // From a connected calendar: Outlook or Google Calendar has it.
  const remote = event.Remote ?? null;
  const remoteAccount = remote ? accounts.find((a) => a.Id === remote.Account) : null;
  const readOnly = isReadOnly(event);
  const feed = event.Feed ? listFor(event.Calendar).name : null;
  const onSynced = Boolean(splitKey(f.calendar));
  // Connected calendars that can take this event (not while it repeats here).
  const syncedChoices = accounts
    .filter((a) => !a.NeedsSignIn)
    .map((a) => ({ account: a, calendars: a.Calendars.filter((c) => c.On && c.CanEdit) }))
    .filter((g) => g.calendars.length);
  // Saving makes the Teams or Meet link (DESIGN.md: video calls).
  const maker = meetingPlan({ Kind: f.kind, Call: f.call, JoinUrl: f.joinUrl.trim() || null, Place: f.place, Description: f.description, Calendar: f.calendar });

  const repeating = Boolean(occ?.event.Repeat) && !isNew;
  const self = event.Of ?? event.Id;
  const { start, end } = momentsOf(f);
  const len = minutesOf(f.end === "24:00" ? "24:00" : f.end) - minutesOf(f.start);
  const cal = listFor(f.calendar);
  const zone = f.zone ?? localZone();
  const timed = !f.allDay;

  const clash = timed && f.kind !== "reminder" ? clashWith(events, start, end, self) : null;
  const suggest = clash ? nextFree(events, start, end, now, self) : null;

  const todayKey = ymd(startOfDay(now));

  const timeOpts = useMemo(() => Array.from({ length: 96 }, (_, i) => fromMinutes(i * 15)), []);
  const endOpts = Array.from({ length: 96 }, (_, i) => (i + 1) * 15)
    .filter((m) => m > minutesOf(f.start))
    .map((m) => {
      const mins = m - minutesOf(f.start);
      const dur = mins < 60 ? `${mins}m` : mins % 60 ? `${(mins / 60).toFixed(1).replace(".0", "")}h` : `${mins / 60}h`;
      return { v: fromMinutes(m), label: `${timeLabel(fromMinutes(m))}  (${dur})` };
    });

  const setStart = (t: string) => {
    const keep = Math.max(15, len);
    const endM = Math.min(24 * 60, minutesOf(t) + keep);
    set({ start: t, end: fromMinutes(endM > minutesOf(t) ? endM : minutesOf(t) + 15) });
  };

  const preview = dayOccurrences(events, ymd(start)).filter((o) => o.event.Id !== self && o.event.Of !== self);
  const dayTitle = ymd(start) === todayKey ? "Today" : start.toLocaleDateString(locale(), { weekday: "long", month: "short", day: "numeric" });
  const dateLabel = fromYmd(f.day).toLocaleDateString(locale(), {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: f.day.slice(0, 4) === todayKey.slice(0, 4) ? undefined : "numeric",
  });
  const wallRange = f.kind === "reminder" ? timeLabel(f.start) : `${timeLabel(f.start)} – ${timeLabel(f.end)}`;
  const summary = [
    f.allDay ? `${dateLabel} · All day` : `${dateLabel} · ${wallRange}${f.zone ? ` ${zoneName(zone).replace(/.*\((.*)\)$/, "$1")}` : ""}`,
    cal.name,
    f.call && f.kind !== "reminder" ? callNames[f.call] : null,
    `${f.reminders.length} ${f.reminders.length === 1 ? "reminder" : "reminders"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const save = () => {
    // Someone else's event: only Cura's own links to it change.
    if (readOnly) {
      if (event.Feed) patchFeedEvent(event.Id, { Note: f.note, Task: f.task });
      else patchSynced(event.Id, { Note: f.note, Task: f.task });
      onClose();
      return;
    }
    if (repeating) setAsking("Change");
    else onSave(eventOf(f, event), "all");
  };

  const zoneMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const here = localZone();
    const zones = [here, ...commonZones.filter((z) => z !== here)];
    openMenu(
      r.left,
      r.bottom + 4,
      zones.map((z, i) => ({
        label: `${zoneName(z)} · ${i === 0 ? "this PC" : zoneCity(z)}`,
        checked: zone === z,
        // The times stay as typed; they now mean that zone's time.
        onSelect: () => set({ zone: z === here ? null : z }),
      })),
    );
  };

  const under = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, items);
  };
  const dot = (color: string) => <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />;

  // Cura's calendars, then each connected account's.
  const calendarMenu = (e: React.MouseEvent<HTMLElement>) =>
    under(e, [
      ...currentLists().map<MenuItem>((l) => ({ label: l.name, icon: dot(l.color), checked: l.id === f.calendar, onSelect: () => set({ calendar: l.id }) })),
      ...syncedChoices.flatMap<MenuItem>(({ account, calendars }) => [
        { type: "separator" },
        ...calendars.map<MenuItem>((c) => {
          const key = calendarKey(account.Id, c.Id);
          return {
            label: `${c.Name} · ${appName[account.Provider]}`,
            icon: dot(listFor(key).color),
            checked: key === f.calendar,
            // Repeating events stay on Cura's own calendars.
            disabled: f.repeat !== "never" && !onSynced,
            onSelect: () => set({ calendar: key }),
          };
        }),
      ]),
    ]);
  const calAccount = (() => {
    const account = accounts.find((a) => a.Id === splitKey(f.calendar)?.account);
    return account ? `${appName[account.Provider]} · ${account.Email}` : null;
  })();

  const callMenu = (e: React.MouseEvent<HTMLElement>) =>
    under(e, [
      ...(["teams", "meet", "zoom"] as const).map<MenuItem>((c) => ({ label: callNames[c], icon: <Video size={13} />, checked: f.call === c, onSelect: () => set({ call: c }) })),
      { type: "separator" },
      { label: "No video call", icon: <X size={13} />, disabled: !f.call, onSelect: () => set({ call: null }) },
    ]);

  const reminderMenu = (e: React.MouseEvent<HTMLElement>) =>
    under(
      e,
      reminderChoices.map<MenuItem>((r) => {
        const on = f.reminders.includes(r.minutes);
        return { label: r.label, checked: on, onSelect: () => set({ reminders: on ? f.reminders.filter((m) => m !== r.minutes) : [...f.reminders, r.minutes] }) };
      }),
    );

  // Why it can't all be changed here, said once, in the footer.
  const holiday = isHoliday(event);
  const provider = appName[remoteAccount?.Provider ?? "microsoft"];
  const notice = holiday
    ? `On “${feed}”, the calendar that comes with Cura, so it can't be changed here.`
    : feed
      ? `On “${feed}”, a calendar you subscribe to, so it's changed where it comes from. You can still link a note or task to it here.`
      : remote && readOnly
        ? `Someone else organized this, so it can only be changed in ${provider}. You can still link a note or task to it here.`
        : remote?.Series
          ? `One day of a repeating event. Changes here are for this day; change the whole series in ${provider}.`
          : null;

  // The day preview opens on the event, an hour and a half above it.
  const timeline = useRef<HTMLDivElement>(null);
  const previewHour = f.allDay ? 8 : start.getHours() + start.getMinutes() / 60;
  useEffect(() => {
    timeline.current?.scrollTo({ top: Math.max(0, (previewHour - 1.5) * PREVIEW_HOUR) });
  }, [previewHour, f.day]);

  const linkedTask = f.task ? tasks.find((t) => t.Id === f.task) : null;
  const kinds: { id: EventKind; label: string }[] = [
    { id: "event", label: "Event" },
    { id: "focus", label: "Focus time" },
    { id: "reminder", label: "Reminder" },
  ];

  return (
    <Popup onClose={onClose} onSubmit={save} width={1040} height={800} labelledBy="pl-ev-title">
      <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-side pr-4 pl-6">
        <div className="flex items-center gap-3">
          <span className="flex h-[30px] items-center rounded-[9px] border border-line bg-panel px-2.5 font-mono text-11 tracking-[0.08em] text-muted">{isNew ? "NEW" : "EDIT"}</span>
          <div role="tablist" aria-label="Item type" className="flex rounded-[12px] border border-line bg-panel p-[3px]">
            {kinds.map((k) => (
              <button
                key={k.id}
                role="tab"
                aria-selected={f.kind === k.id}
                disabled={readOnly || (onSynced && k.id !== "event")}
                onClick={() => set({ kind: k.id, ...(k.id === "reminder" && !f.reminders.length ? { reminders: [0] } : {}) })}
                className={clsx("h-8 rounded-[9px] px-3.5 text-13 font-medium", f.kind === k.id ? "bg-panel2 text-text" : "text-muted hover:text-text")}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <button aria-label="Close" title="Close (Esc)" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
          <X size={16} strokeWidth={2.2} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-8 py-7">
          {/* Someone else's event: its details are theirs to change. */}
          <fieldset disabled={readOnly} className="contents">
            <div className="flex shrink-0 flex-col gap-1.5">
              <div className="flex items-center gap-3.5">
                <span className="h-3.5 w-3.5 shrink-0 rounded-[5px]" style={{ background: cal.color }} />
                <label htmlFor="pl-ev-title" className="sr-only">
                  Event title
                </label>
                <input
                  id="pl-ev-title"
                  autoFocus={isNew}
                  value={f.title}
                  onChange={(e) => set({ title: e.target.value })}
                  placeholder={f.kind === "focus" ? "Focus time" : f.kind === "reminder" ? "Remind me to…" : "Add a title"}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 font-head text-32 font-bold tracking-[-0.02em] text-text outline-none placeholder:text-faint"
                />
              </div>
              <div className="truncate pl-7 text-13 text-muted">{summary}</div>
            </div>

            <RowGroup label="When">
              <Row icon={<CalendarDays size={16} />} label="Date">
                <button
                  aria-label={`Date: ${dateLabel}. Pick another`}
                  onClick={(e) => setCalendarAt(e.currentTarget.getBoundingClientRect())}
                  className={clsx(field, "gap-2 font-medium")}
                >
                  {dateLabel}
                  <ChevronDown size={14} className="text-muted" />
                </button>
                {[
                  [todayKey, "Today"],
                  [ymd(addDays(fromYmd(todayKey), 1)), "Tomorrow"],
                ]
                  .filter(([day]) => day !== f.day)
                  .map(([day, label]) => (
                    <button key={label} onClick={() => set({ day })} className={quiet}>
                      {label}
                    </button>
                  ))}
                <button role="switch" aria-checked={f.allDay} onClick={() => set({ allDay: !f.allDay })} className="ml-auto flex h-9 items-center gap-2.5 text-13 text-muted">
                  All day
                  <span className={clsx("flex h-[22px] w-[38px] rounded-full p-[3px]", f.allDay ? "justify-end bg-accent" : "justify-start bg-panel2")}>
                    <span className={clsx("h-4 w-4 rounded-full", f.allDay ? "bg-accent-ink" : "bg-muted")} />
                  </span>
                </button>
              </Row>
              {timed && (
                <Row icon={<Clock size={16} />} label="Time">
                  <TimeSelect label="Starts" value={f.start} onChange={setStart} options={timeOpts.map((v) => ({ v, label: timeLabel(v) }))} />
                  {f.kind !== "reminder" && (
                    <>
                      <ArrowRight size={15} className="shrink-0 text-muted" />
                      <TimeSelect label="Ends" value={f.end} onChange={(v) => set({ end: v })} options={endOpts} />
                      <div role="group" aria-label="Length" className="ml-auto flex rounded-[11px] bg-panel2 p-[3px]">
                        {[
                          [15, "15m"],
                          [30, "30m"],
                          [60, "1h"],
                          [120, "2h"],
                        ].map(([m, label]) => {
                          const on = len === m;
                          return (
                            <button
                              key={label}
                              aria-pressed={on}
                              onClick={() => set({ end: fromMinutes(Math.min(24 * 60, minutesOf(f.start) + Number(m))) })}
                              className={clsx("h-[30px] rounded-[8px] px-2.5 text-12 font-medium transition-colors", on ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text")}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {f.zone && (
                    <div className="basis-full text-12 text-muted">
                      That's {shortTime(start)}
                      {f.kind !== "reminder" ? ` – ${shortTime(end)}` : ""} your time
                      {ymd(start) !== f.day ? `, ${start.toLocaleDateString(locale(), { weekday: "long" })}` : ""}.
                    </div>
                  )}
                </Row>
              )}
              {clash && (
                <div role="status" className="flex items-center gap-3 bg-warn-soft py-2.5 pr-3 pl-[18px] text-13">
                  <TriangleAlert size={16} className="shrink-0 text-warn" />
                  <span className="flex-1">
                    Overlaps with <b className="font-semibold">{clash.event.Title}</b> ({shortTime(clash.start)})
                  </span>
                  {suggest && (
                    <button
                      onClick={() => {
                        const wall = toZone(suggest, f.zone);
                        const s = minutesOf(wall.slice(11));
                        set({ day: wall.slice(0, 10), start: wall.slice(11), end: fromMinutes(Math.min(24 * 60, s + len)) });
                      }}
                      className="h-8 rounded-[10px] border border-line bg-bg px-3 text-12 font-semibold hover:border-faint"
                    >
                      Move to {shortTime(suggest)}
                    </button>
                  )}
                </div>
              )}
              <Row icon={<Repeat size={16} />} label="Repeat">
                <span className="relative flex">
                  <select
                    aria-label="Repeat"
                    disabled={onSynced}
                    title={onSynced ? `Repeating events are set up in ${remoteAccount ? appName[remoteAccount.Provider] : "Outlook or Google Calendar"}` : undefined}
                    value={onSynced ? "never" : f.repeat}
                    onChange={(e) => set({ repeat: e.target.value as Form["repeat"] })}
                    className={clsx(field, "appearance-none pr-9 outline-none disabled:text-muted")}
                  >
                    <option value="never">Doesn't repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Every weekday</option>
                    <option value="weekly">Every {fromYmd(f.day).toLocaleDateString(locale(), { weekday: "long" })}</option>
                    <option value="monthly">Every month on the {ordinal(fromYmd(f.day).getDate())}</option>
                    <option value="yearly">Every year on {fromYmd(f.day).toLocaleDateString(locale(), { month: "long", day: "numeric" })}</option>
                  </select>
                  <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
                </span>
                <button aria-label={`Time zone: ${zoneName(zone)}`} title="Change the time zone" onClick={zoneMenu} className={clsx(quiet, "ml-auto max-w-[240px] gap-1.5", f.zone && "text-text")}>
                  <Globe size={14} className="shrink-0" />
                  <span className="truncate">{zoneName(zone)}</span>
                </button>
              </Row>
            </RowGroup>

            <RowGroup label="Details">
              <Row icon={<FolderClosed size={16} />} label="Calendar">
                <button aria-label={`Calendar: ${cal.name}. Change`} aria-haspopup="menu" onClick={calendarMenu} className={clsx(field, "gap-2.5 font-medium")}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: cal.color }} />
                  <span className="truncate">{cal.name}</span>
                  <ChevronDown size={14} className="shrink-0 text-muted" />
                </button>
                {calAccount && <span className="truncate text-12 text-muted">{calAccount}</span>}
              </Row>
              {f.kind !== "reminder" && (
                <Row icon={<MapPin size={16} />} label="Where">
                  <input
                    value={f.place}
                    onChange={(e) => set({ place: e.target.value })}
                    placeholder="Add a place"
                    aria-label="Location"
                    className="h-9 min-w-0 flex-1 rounded-[10px] bg-transparent px-3 text-14 text-text outline-none placeholder:text-muted hover:bg-panel2 focus:bg-panel2"
                  />
                  <button
                    aria-label={f.call ? `Video call: ${callNames[f.call]}. Change` : "Add a video call"}
                    aria-haspopup="menu"
                    onClick={callMenu}
                    className={clsx("flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-3 text-13 font-medium", f.call ? "bg-accent2-soft text-accent2" : "border border-dashed border-line text-muted hover:text-text")}
                  >
                    <Video size={15} />
                    {f.call ? callNames[f.call] : "Add a call"}
                    {f.call && <ChevronDown size={13} />}
                  </button>
                  {f.call && maker && !pasteLink && (
                    <div className="flex basis-full items-center gap-2 pl-3 text-12 text-muted">
                      <span className="min-w-0 truncate">
                        A {callNames[f.call]} link is created when you save, using your {providerName[maker.Provider]} account{accounts.filter((a) => a.Provider === maker.Provider).length > 1 ? ` (${maker.Email})` : ""}.
                      </span>
                      <button onClick={() => setPasteLink(true)} className="shrink-0 text-text underline decoration-line underline-offset-2 hover:decoration-current">
                        Paste one instead
                      </button>
                    </div>
                  )}
                  {f.call && (!maker || pasteLink) && (
                    <label className="flex h-9 basis-full items-center gap-2.5 rounded-[10px] bg-panel2 px-3 text-12 text-muted">
                      <Link2 size={14} className="shrink-0" />
                      <input
                        value={f.joinUrl}
                        onChange={(e) => set({ joinUrl: e.target.value })}
                        placeholder={findJoinLink(f.place, f.description)?.url ?? `Paste the ${callNames[f.call]} link`}
                        aria-label={`${callNames[f.call]} link`}
                        className="min-w-0 flex-1 bg-transparent font-mono text-12 text-text outline-none placeholder:font-sans placeholder:text-muted"
                      />
                      {!f.joinUrl && findJoinLink(f.place, f.description) && <span className="shrink-0">Found in the {findJoinLink(f.place) ? "place" : "description"}</span>}
                    </label>
                  )}
                </Row>
              )}
              <Row icon={<Bell size={16} />} label="Remind me">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {[...f.reminders]
                    .sort((a, b) => a - b)
                    .map((m) => {
                      const label = reminderChoices.find((r) => r.minutes === m)?.label ?? `${m} min before`;
                      return (
                        <span key={m} className="flex h-8 items-center rounded-[9px] bg-accent-soft pl-3 text-13 font-medium text-accent">
                          {label}
                          <button aria-label={`Remove reminder: ${label}`} onClick={() => set({ reminders: f.reminders.filter((x) => x !== m) })} className="flex h-8 w-7 items-center justify-center opacity-70 hover:opacity-100">
                            <X size={12} strokeWidth={2.4} />
                          </button>
                        </span>
                      );
                    })}
                  <button aria-haspopup="menu" onClick={reminderMenu} className={clsx(quiet, "gap-1.5 border border-dashed border-line")}>
                    <Plus size={13} />
                    {f.reminders.length ? "Add" : "Add a reminder"}
                  </button>
                </div>
              </Row>
            </RowGroup>
          </fieldset>

          <section aria-label="Description" className="flex shrink-0 flex-col rounded-[18px] border border-line bg-panel focus-within:border-faint">
            <div className="flex min-h-[52px] items-center gap-3 pr-3 pl-[18px]">
              <span className="text-muted">
                <AlignLeft size={16} />
              </span>
              <label htmlFor="pl-ev-notes" className="flex-1 text-13 text-muted">
                Description
              </label>
              {/* Holidays aren't kept in a file, so there's nowhere to keep a link. */}
              {!holiday && (
                <>
                  <LinkButton icon={<FileText size={13} />} label={f.note ? titleOf(f.note) : "Link a note"} linked={Boolean(f.note)} onClick={() => setPicking("note")} onClear={() => set({ note: null })} />
                  <LinkButton
                    icon={<CheckSquare size={13} />}
                    label={linkedTask ? linkedTask.Title : f.task ? "Linked task" : "Link a task"}
                    linked={Boolean(f.task)}
                    onClick={() => setPicking("task")}
                    onClear={() => set({ task: null })}
                  />
                </>
              )}
            </div>
            <textarea
              id="pl-ev-notes"
              rows={4}
              value={f.description}
              readOnly={readOnly}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Agenda, links, anything to remember…"
              className="w-full resize-none rounded-b-[18px] border-0 bg-transparent px-[18px] pt-0 pb-4 text-14 leading-[1.55] text-text outline-none placeholder:text-muted"
            />
          </section>
        </div>

        <aside className="flex w-[290px] shrink-0 flex-col gap-3.5 border-l border-line bg-side py-6 pr-3 pl-5">
          <div className="flex items-baseline justify-between pr-2">
            <span className="text-15 font-semibold">{dayTitle}</span>
            <span className="font-mono text-11 text-muted">
              {preview.length} {preview.length === 1 ? "event" : "events"}
            </span>
          </div>
          {f.allDay && (
            <div className="mr-2 flex h-[30px] items-center gap-2 rounded-[9px] px-2.5 text-12 font-semibold text-accent-ink" style={{ background: cal.color }}>
              <span className="truncate">{f.title.trim() || "New event"}</span>
            </div>
          )}
          {/* The whole day, scrolled to the event. */}
          <div ref={timeline} className="relative min-h-0 flex-1 overflow-y-auto pr-2">
            <div className="relative flex" style={{ height: 24 * PREVIEW_HOUR }}>
              <div className="relative w-[46px] shrink-0">
                {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-10 text-muted" style={{ top: h * PREVIEW_HOUR }}>
                    {shortTime(new Date(2000, 0, 1, h)).replace(" ", "")}
                  </span>
                ))}
              </div>
              <div
                className="relative flex-1 border-l border-line"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${PREVIEW_HOUR}px)` }}
              >
                {preview
                  .filter((o) => !o.event.AllDay)
                  .map((o) => {
                    const top = (o.start.getHours() + o.start.getMinutes() / 60) * PREVIEW_HOUR + 1;
                    const h = Math.max(18, ((o.end.getTime() - o.start.getTime()) / 3_600_000) * PREVIEW_HOUR - 2);
                    return (
                      <div
                        key={o.key}
                        className="absolute inset-x-1.5 truncate rounded-[8px] px-2 py-1 text-11 font-medium text-muted"
                        style={{ top, height: h, background: softOf(listFor(o.event.Calendar).tone) }}
                      >
                        {o.event.Title}
                      </div>
                    );
                  })}
                {timed && (
                  <div
                    className="absolute right-0.5 left-[18px] flex flex-col gap-0.5 overflow-hidden rounded-[10px] px-2.5 py-1.5 text-accent-ink"
                    style={{
                      top: (start.getHours() + start.getMinutes() / 60) * PREVIEW_HOUR + 1,
                      height: Math.max(26, ((end.getTime() - start.getTime()) / 3_600_000) * PREVIEW_HOUR - 2),
                      background: cal.color,
                      boxShadow: "0 0 0 2px var(--side), 0 12px 30px rgba(0,0,0,0.4)",
                    }}
                  >
                    <span className="truncate text-12 font-bold">{f.title.trim() || "New event"}</span>
                    <span className="font-mono text-10">{f.kind === "reminder" ? shortTime(start) : `${shortTime(start)} – ${shortTime(end)}`}</span>
                  </div>
                )}
                {ymd(start) === todayKey && <span className="absolute inset-x-0 h-0.5 bg-accent2" style={{ top: (now.getHours() + now.getMinutes() / 60) * PREVIEW_HOUR }} />}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex min-h-[68px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6 py-3">
        {notice ? (
          <span role="note" className="flex min-w-0 items-center gap-2.5 text-12 leading-[1.45] text-muted">
            {readOnly ? <TriangleAlert size={15} className="shrink-0 text-warn" /> : <Repeat size={15} className="shrink-0 text-accent2" />}
            <span className="line-clamp-2">{notice}</span>
          </span>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2.5">
          {remote?.Link && (
            <Button onClick={() => void openUrl(remote.Link!)}>
              Open in {appName[remoteAccount?.Provider ?? "microsoft"]}
            </Button>
          )}
          {!isNew && !event.Feed && (
            <Button variant="danger" onClick={() => (repeating ? setAsking("Delete") : onDelete("all"))}>
              Delete
            </Button>
          )}
          <Button onClick={onClose}>{holiday ? "Close" : "Cancel"}</Button>
          {!holiday && (
            <Button variant="primary" hint="Ctrl Enter" onClick={save}>
              {readOnly ? "Save links" : "Save event"}
            </Button>
          )}
        </div>
      </footer>

      {calendarAt && (
        <Calendar
          anchor={calendarAt}
          value={f.day}
          time={null}
          onPick={(day) => {
            set({ day });
            setCalendarAt(null);
          }}
          onClose={() => setCalendarAt(null)}
        />
      )}
      {picking === "note" && n.notebook && (
        <NotePicker
          notes={n.notes}
          notebook={n.notebook}
          newTab={false}
          onPick={(name) => {
            set({ note: name });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {picking === "task" && (
        <TaskPicker
          onPick={(id) => {
            set({ task: id });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {asking && (
        <ScopeDialog
          verb={asking}
          onResult={(scope) => {
            const verb = asking;
            setAsking(null);
            if (!scope) return;
            if (verb === "Delete") onDelete(scope);
            else onSave(eventOf(f, event), scope);
          }}
        />
      )}
    </Popup>
  );
}

// A bordered group of rows, named for screen readers.
function RowGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="flex shrink-0 flex-col divide-y divide-line overflow-hidden rounded-[18px] border border-line bg-panel">
      {children}
    </section>
  );
}

// One setting: its icon and name on the left, its controls after.
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[54px] items-start gap-3 py-[9px] pr-3 pl-[18px]">
      <span className="flex h-9 w-[104px] shrink-0 items-center gap-3 text-13 text-muted">
        {icon}
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">{children}</div>
    </div>
  );
}

function TimeSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <label className="flex">
      <span className="sr-only">{label}</span>
      <span className="relative flex">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={clsx(field, "w-[150px] appearance-none pr-8 font-medium outline-none")}
        >
          {!options.some((o) => o.v === value) && <option value={value}>{timeLabel(value)}</option>}
          {options.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
      </span>
    </label>
  );
}

function LinkButton({ icon, label, linked, onClick, onClear }: { icon: React.ReactNode; label: string; linked: boolean; onClick: () => void; onClear: () => void }) {
  return (
    <span className={clsx("flex h-[30px] max-w-[220px] items-center rounded-[10px] border text-12", linked ? "border-line bg-panel text-text" : "border-dashed border-line text-muted")}>
      <button onClick={onClick} className="flex min-w-0 items-center gap-2 px-2.5 hover:text-text">
        {icon}
        <span className="truncate">{label}</span>
      </button>
      {linked && (
        <button aria-label={`Remove ${label}`} onClick={onClear} className="mr-1 flex h-6 w-6 items-center justify-center rounded-[7px] text-muted hover:text-text">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

