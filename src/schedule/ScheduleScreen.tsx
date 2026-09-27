import { dayOfWeek } from "../lib/format";
import { locale } from "../lib/format";
import clsx from "clsx";
import { CalendarDays, CalendarPlus, CalendarRange, Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, FileText, FileUp, Focus, Link, ListTodo, Maximize2, Palette, Pencil, Plus, RefreshCw, Rss, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connectAccount } from "../accounts/actions";
import { appName, calendarKey, splitKey } from "../accounts/model";
import { errorText, syncAccount, syncAll, syncIfStale } from "../accounts/sync";
import { useAccounts } from "../accounts/useAccounts";
import ConfirmDialog from "../components/ConfirmDialog";
import ContextMenu, { menuPoint, type MenuItem, type MenuState } from "../components/ContextMenu";
import { openUrl } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import { toast } from "../ui/Toast";
import { isoWeek, useNow, weekRangeLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import { addDays, fromYmd, startOfDay, ymd } from "../tasks/dates";
import { toggleTask } from "../tasks/actions";
import { currentLists, listColors, listFor, type ListColor, type ListRecord } from "../tasks/lists";
import { DeleteListDialog, recolorList, renameList, setListInTasks } from "../tasks/listMenu";
import { newId } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { useTasks } from "../tasks/useTasks";
import { addEvent, allDayRange, blankEvent, deleteOccurrence, eventLength, moveOccurrence, parseQuickEvent, patchEvent, saveEvent, type Scope } from "./actions";
import { ImportDialog, NewCalendarDialog, RenameCalendarDialog, SubscribeDialog } from "./CalendarDialogs";
import EventPopup from "./EventPopup";
import { freeSlot, fromStamp, isReadOnly, joinUrlOf, localStamp, occurrences, type CalEvent, type Occurrence } from "./events";
import { feedKey, recolorFeed, refreshFeed, renameFeed, unsubscribe, useFeeds } from "./feeds";
import { joinState, shortTime, softOf } from "./look";
import MonthView, { monthGrid } from "./MonthView";
import { subscribeScheduleRequests, takeScheduleRequest } from "./nav";
import ScheduleSidebar, { type CalendarRow } from "./ScheduleSidebar";
import ScopeDialog from "./ScopeDialog";
import { useAllEvents } from "./useEvents";
import WeekView, { type AllDayItem } from "./WeekView";

const TASKS_CAL = "tasks";

const weekStartOf = (d: Date) => addDays(startOfDay(d), -dayOfWeek(d));

// The Schedule screen (Calendar.dc.html): quick add, the mini month,
// calendars and the selected event on the left; the week or month on the
// right. Double-click an event (or Edit) for the event pop-up
// (EventNew.dc.html), which also makes new ones.
export default function ScheduleScreen() {
  const { events, error } = useAllEvents();
  const { tasks, allLists: lists } = useTasks();
  const { accounts } = useAccounts();
  const { feeds } = useFeeds();
  // Adding, renaming and deleting calendars.
  const [calDialog, setCalDialog] = useState<"new" | "subscribe" | "import" | { name: string; rename: (name: string) => void } | null>(null);
  const [deletingList, setDeletingList] = useState<ListRecord | null>(null);
  // A fresh look at connected calendars when the Schedule opens.
  useEffect(() => syncIfStale(), []);
  const { settings, update } = useSettings();
  const now = useNow();
  const view = settings.ScheduleView === "month" ? "month" : "week";
  const hidden = useMemo(() => new Set(settings.ScheduleHidden ?? []), [settings.ScheduleHidden]);
  const [focus, setFocus] = useState(() => startOfDay(new Date()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ event: CalEvent; occ: Occurrence | null; isNew: boolean } | null>(null);
  const [moving, setMoving] = useState<{ occ: Occurrence; start: Date; end: Date } | null>(null);
  // Deleting from the right-click menu: which day or days of a repeating
  // event, or a yes for one on a connected calendar (that can't be undone).
  const [deleting, setDeleting] = useState<Occurrence | null>(null);
  const notes = useNotes();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);

  const weekStart = weekStartOf(focus);
  const monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1);
  const grid = monthGrid(monthStart);
  const [from, to] = view === "week" ? [weekStart, addDays(weekStart, 7)] : [grid[0], addDays(grid[41], 1)];

  const visibleEvents = useMemo(() => events.filter((e) => !hidden.has(e.Calendar)), [events, hidden]);
  const occs = useMemo(() => occurrences(visibleEvents, from, to), [visibleEvents, from.getTime(), to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  const all = useMemo(() => occurrences(events, from, to), [events, from.getTime(), to.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selected event, else the next one still to come in view.
  const selected = useMemo(() => {
    const byKey = occs.find((o) => o.key === selectedKey);
    if (byKey) return byKey;
    return occs.find((o) => o.end > now && !o.event.AllDay) ?? occs.find((o) => o.end > now) ?? null;
  }, [occs, selectedKey, now]);

  const tasksDue = useMemo(
    () => tasks.filter((t) => !t.Completed && t.Due && t.Due >= ymd(from) && t.Due < ymd(to)),
    [tasks, from.getTime(), to.getTime()], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Busy days for the mini month: a wide window around the focus.
  const busy = useMemo(() => {
    const start = new Date(focus.getFullYear(), focus.getMonth() - 1, 1);
    const end = new Date(focus.getFullYear(), focus.getMonth() + 2, 1);
    return new Set(occurrences(visibleEvents, start, end).map((o) => ymd(o.start)));
  }, [visibleEvents, focus]);

  const calendars: CalendarRow[] = [
    ...lists.map<CalendarRow>((l) => ({
      id: l.Id,
      name: l.Name,
      color: `var(--${l.Color})`,
      on: !hidden.has(l.Id),
      count: all.filter((o) => o.event.Calendar === l.Id).length,
      kind: "list",
    })),
    { id: TASKS_CAL, name: "Tasks due", color: "var(--muted)", on: !hidden.has(TASKS_CAL), count: tasksDue.length, kind: "tasks" },
    // Connected accounts' calendars, under the account they come from.
    ...accounts.flatMap((a) =>
      a.Calendars.filter((c) => c.On).map((c) => {
        const key = calendarKey(a.Id, c.Id);
        return { id: key, name: c.Name, color: listFor(key).color, on: !hidden.has(key), count: all.filter((o) => o.event.Calendar === key).length, group: `${appName[a.Provider]} · ${a.Email}`, kind: "account" as const };
      }),
    ),
    // Calendars subscribed to by link.
    ...feeds.map<CalendarRow>((f) => {
      const key = feedKey(f.Id);
      return { id: key, name: f.Name, color: `var(--${f.Color})`, on: !hidden.has(key), count: all.filter((o) => o.event.Calendar === key).length, group: "Subscribed", kind: "feed", error: f.Error };
    }),
  ];

  // How the connected calendars are doing, under the list.
  const trouble = accounts.find((a) => a.NeedsSignIn || a.Error);
  const lastSync = accounts.map((a) => a.LastSync).filter(Boolean).sort().pop();
  // A subscribed calendar that couldn't refresh says so when accounts have nothing to say.
  const feedTrouble = feeds.find((f) => f.Error);
  const syncStatus = !accounts.length
    ? feedTrouble
      ? { text: `Couldn't refresh “${feedTrouble.Name}”: ${feedTrouble.Error}`, action: "Try again", onAction: () => void refreshFeed(feedTrouble.Id), error: true }
      : null
    : trouble
      ? {
          text: trouble.NeedsSignIn ? `${appName[trouble.Provider]} needs you to sign in again` : `${appName[trouble.Provider]} didn't sync: ${trouble.Error}`,
          action: trouble.NeedsSignIn ? "Reconnect" : "Try again",
          onAction: () => void (trouble.NeedsSignIn ? connectAccount(trouble.Provider).catch((e) => toast(errorText(e))) : syncAll()),
          error: true,
        }
      : { text: lastSync ? `Synced ${shortTime(new Date(lastSync))}` : "Syncing…", action: "Sync now", onAction: () => void syncAll(), error: false };

  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ ScheduleHidden: [...next] });
  };

  const openNew = useCallback((start?: Date, end?: Date) => {
    const n = new Date();
    const s = start ?? new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + (n.getMinutes() >= 30 ? 1 : 0), n.getMinutes() >= 30 ? 0 : 30);
    setEditor({ event: blankEvent(s, end ?? new Date(s.getTime() + eventLength() * 60_000)), occ: null, isNew: true });
  }, []);

  // Asked for from elsewhere.
  useEffect(() => {
    const handle = () => {
      const req = takeScheduleRequest();
      if (!req) return;
      if (req.kind === "new") openNew();
      else {
        const e = events.find((x) => x.Id === req.id);
        if (!e) return;
        const day = req.day ? fromYmd(req.day) : startOfDay(fromStamp(e.Start));
        setFocus(day);
        setSelectedKey(`${e.Id}@${ymd(day)}`);
      }
    };
    handle();
    return subscribeScheduleRequests(handle);
  }, [events, openNew]);

  const quickAdd = (text: string) => {
    const e = parseQuickEvent(text, new Date());
    if (!e) return;
    addEvent(e);
    setFocus(startOfDay(fromStamp(e.Start)));
    setSelectedKey(`${e.Id}@${e.Start.slice(0, 10)}`);
  };

  const move = (occ: Occurrence, start: Date, end: Date) => {
    if (occ.event.Feed) {
      toast(`“${occ.event.Title}” is on a subscribed calendar, so it can't be moved here`);
      return;
    }
    const remote = occ.event.Remote;
    if (remote && !remote.Editable) {
      const where = appName[accounts.find((a) => a.Id === remote.Account)?.Provider ?? "microsoft"];
      toast(`Someone else organized “${occ.event.Title}”, so it can only be moved in ${where}`);
      return;
    }
    if (occ.event.Repeat) setMoving({ occ, start, end });
    else moveOccurrence(occ, start, end, "all");
    setSelectedKey(occ.event.Repeat ? null : `${occ.event.Id}@${ymd(start)}`);
  };

  const edit = (o: Occurrence) => setEditor({ event: o.event, occ: o, isNew: false });

  const openNewAllDay = (day: Date) => {
    const d = startOfDay(day);
    setEditor({ event: { ...blankEvent(d, d), ...allDayRange(ymd(d)), Reminders: [] }, occ: null, isNew: true });
  };

  // A copy of the one showing that was clicked, as an event of its own:
  // copying a whole repeating series is rarely what's meant, and the copy can
  // be made to repeat in Edit. One on a connected calendar is added there.
  const duplicate = (o: Occurrence) => {
    const at = new Date().toISOString();
    const copy: CalEvent = {
      ...o.event,
      Id: newId(),
      Title: o.event.Title ? `${o.event.Title} (copy)` : "",
      Start: localStamp(o.start),
      End: localStamp(o.end),
      Repeat: null,
      Skip: [],
      Of: null,
      OnDate: null,
      Remote: null,
      // A copy from a subscribed calendar is yours, on your usual calendar.
      Feed: null,
      Uid: null,
      ...(o.event.Feed ? { Calendar: blankEvent(o.start, o.end).Calendar } : {}),
      Reminded: at,
      Created: at,
    };
    if (splitKey(copy.Calendar)) saveEvent(copy, null, "all");
    else {
      addEvent(copy);
      setSelectedKey(`${copy.Id}@${copy.Start.slice(0, 10)}`);
    }
  };

  const moveToCalendar = (e: CalEvent, id: string, name: string) => {
    const before = e.Calendar;
    patchEvent(e.Id, { Calendar: id });
    toast(`Moved “${e.Title || "Untitled"}” to ${name}`, () => patchEvent(e.Id, { Calendar: before }));
  };

  const remove = (o: Occurrence) => {
    // Repeating ones ask which days; synced ones ask first, as Outlook and
    // Google Calendar have no Undo.
    if (o.event.Repeat || o.event.Remote) setDeleting(o);
    else deleteOccurrence(o, "all");
  };

  const eventMenu = (o: Occurrence): MenuItem[] => {
    const e = o.event;
    const readOnly = isReadOnly(e);
    const join = joinState(o, now);
    const link = join.url ?? joinUrlOf(e);
    const note = e.Note;
    return [
      { label: "Edit…", icon: <Pencil size={13} />, hint: "Enter", onSelect: () => edit(o) },
      ...(link ? [{ label: join.url ? join.label : "Join call", icon: <Video size={13} />, onSelect: () => void openUrl(link) }] : []),
      ...(note ? [{ label: "Open note", icon: <FileText size={13} />, onSelect: () => void notes.activate(note) }] : []),
      ...(link
        ? [
            {
              label: "Copy meeting link",
              icon: <Link size={13} />,
              onSelect: () => void navigator.clipboard.writeText(link).then(() => toast("Copied the meeting link"), () => toast("Couldn't copy the link")),
            },
          ]
        : []),
      { type: "separator" },
      e.Feed
        ? { label: "Copy to my calendar", icon: <Copy size={13} />, onSelect: () => duplicate(o) }
        : { label: "Duplicate", icon: <Copy size={13} />, disabled: readOnly, onSelect: () => duplicate(o) },
      // Synced events move between calendars in the pop-up, which knows
      // which of the account's calendars can take them.
      ...(e.Remote || e.Feed
        ? []
        : [
            {
              label: "Calendar",
              icon: <CalendarDays size={13} />,
              children: currentLists().map<MenuItem>((l) => ({
                label: l.name,
                icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: l.color }} />,
                checked: e.Calendar === l.id,
                onSelect: () => e.Calendar !== l.id && moveToCalendar(e, l.id, l.name),
              })),
            },
          ]),
      { type: "separator" },
      { label: e.Repeat || e.Remote ? "Delete…" : "Delete", icon: <Trash2 size={13} />, danger: true, disabled: readOnly, onSelect: () => remove(o) },
    ];
  };

  const taskMenu = (id: string): MenuItem[] => {
    const task = tasks.find((t) => t.Id === id);
    if (!task) return [];
    return [
      { label: "Open in Tasks", icon: <Maximize2 size={13} />, onSelect: () => requestTasks({ kind: "open", id, popup: true }) },
      { label: "Complete", icon: <Check size={13} />, onSelect: () => toggleTask(task) },
    ];
  };

  // Right-clicking an event picks it too, so the card on the left shows
  // what the menu is about.
  const showEventMenu = (e: React.MouseEvent, o: Occurrence) => {
    const { x, y } = menuPoint(e);
    setSelectedKey(o.key);
    openMenu(x, y, eventMenu(o));
  };

  const showSlotMenu = (e: React.MouseEvent, start: Date) => {
    const { x, y } = menuPoint(e);
    openMenu(x, y, [
      { label: "New event here", icon: <Plus size={13} />, onSelect: () => openNew(start, new Date(start.getTime() + 60 * 60_000)) },
      { label: "New all-day event", icon: <CalendarPlus size={13} />, onSelect: () => openNewAllDay(start) },
    ]);
  };

  const showDayMenu = (e: React.MouseEvent, day: Date) => {
    const { x, y } = menuPoint(e);
    openMenu(x, y, [
      {
        label: "New event on this day",
        icon: <Plus size={13} />,
        onSelect: () => {
          // The first free time that day, the way quick add picks one.
          const slot = freeSlot(events, ymd(day), null, eventLength(), new Date());
          openNew(slot.start, slot.end);
        },
      },
      { label: "New all-day event", icon: <CalendarPlus size={13} />, onSelect: () => openNewAllDay(day) },
      { type: "separator" },
      {
        label: "Go to this week",
        icon: <CalendarRange size={13} />,
        onSelect: () => {
          setFocus(startOfDay(day));
          update({ ScheduleView: "week" });
        },
      },
    ]);
  };

  const showCalendarMenu = (e: React.MouseEvent, c: CalendarRow) => {
    const { x, y } = menuPoint(e);
    const others = calendars.filter((r) => r.id !== c.id);
    const account = c.group ? splitKey(c.id)?.account : null;
    openMenu(x, y, [
      {
        label: "Show only this calendar",
        icon: <Focus size={13} />,
        disabled: c.on && others.every((r) => !r.on),
        onSelect: () => update({ ScheduleHidden: others.map((r) => r.id) }),
      },
      { label: "Show all calendars", icon: <Eye size={13} />, disabled: calendars.every((r) => r.on), onSelect: () => update({ ScheduleHidden: [] }) },
      c.on
        ? { label: "Hide this calendar", icon: <EyeOff size={13} />, onSelect: () => toggle(c.id) }
        : { label: "Show this calendar", icon: <Eye size={13} />, onSelect: () => toggle(c.id) },
      ...(account ? [{ type: "separator" } as MenuItem, { label: "Sync now", icon: <RefreshCw size={13} />, onSelect: () => void syncAccount(account) }] : []),
      ...calendarActions(c),
    ]);
  };

  const colorMenu = (current: string, pick: (c: ListColor) => void): MenuItem => ({
    label: "Color",
    icon: <Palette size={13} />,
    children: listColors.map((c) => ({
      label: c.name,
      checked: current === c.id,
      icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: `var(--${c.id})` }} />,
      onSelect: () => pick(c.id),
    })),
  });

  // Renaming, recoloring and deleting: your own calendars (which are lists
  // too) and subscribed ones.
  const calendarActions = (c: CalendarRow): MenuItem[] => {
    const list = c.kind === "list" ? lists.find((l) => l.Id === c.id) : null;
    if (list) {
      const inTasks = list.InTasks !== false;
      const lastInTasks = inTasks && lists.filter((l) => l.InTasks !== false).length <= 1;
      return [
        { type: "separator" },
        { label: "Rename…", icon: <Pencil size={13} />, onSelect: () => setCalDialog({ name: list.Name, rename: (n) => renameList(list.Id, n) }) },
        colorMenu(list.Color, (color) => recolorList(list.Id, color)),
        { label: "Show in Tasks", icon: <ListTodo size={13} />, checked: inTasks, disabled: lastInTasks, onSelect: () => setListInTasks(list.Id, !inTasks) },
        { type: "separator" },
        { label: "Delete calendar…", icon: <Trash2 size={13} />, danger: true, disabled: lists.length <= 1, onSelect: () => setDeletingList(list) },
      ];
    }
    const feed = c.kind === "feed" ? feeds.find((f) => feedKey(f.Id) === c.id) : null;
    if (feed) {
      return [
        { type: "separator" },
        { label: "Refresh now", icon: <RefreshCw size={13} />, onSelect: () => void refreshFeed(feed.Id) },
        { label: "Rename…", icon: <Pencil size={13} />, onSelect: () => setCalDialog({ name: feed.Name, rename: (n) => renameFeed(feed.Id, n) }) },
        colorMenu(feed.Color, (color) => recolorFeed(feed.Id, color)),
        {
          label: "Copy link",
          icon: <Link size={13} />,
          onSelect: () => void navigator.clipboard.writeText(feed.Url).then(() => toast("Copied the calendar's link"), () => toast("Couldn't copy the link")),
        },
        { type: "separator" },
        { label: "Unsubscribe", icon: <Trash2 size={13} />, danger: true, onSelect: () => unsubscribe(feed.Id) },
      ];
    }
    return [];
  };

  const showAddCalendarMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, [
      { label: "New calendar…", icon: <CalendarPlus size={13} />, onSelect: () => setCalDialog("new") },
      { label: "Subscribe by link…", icon: <Rss size={13} />, onSelect: () => setCalDialog("subscribe") },
      { label: "Import a file (.ics)…", icon: <FileUp size={13} />, onSelect: () => setCalDialog("import") },
    ]);
  };

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const allDayRows: AllDayItem[][] = days.map((d) => {
    const key = ymd(d);
    const next = addDays(d, 1);
    const evs = occs
      .filter((o) => o.event.AllDay && o.start < next && o.end > d)
      .map<AllDayItem>((o) => {
        const cal = listFor(o.event.Calendar);
        return {
          key: o.key,
          title: o.event.Title,
          task: false,
          color: cal.color,
          soft: softOf(cal.tone),
          onClick: () => setSelectedKey(o.key),
          onMenu: (e: React.MouseEvent) => showEventMenu(e, o),
        };
      });
    const due = hidden.has(TASKS_CAL)
      ? []
      : tasksDue
          .filter((t) => t.Due === key)
          .map<AllDayItem>((t) => ({
            key: `task:${t.Id}`,
            title: t.Title,
            task: true,
            color: "var(--muted)",
            soft: "var(--panel2)",
            onClick: () => requestTasks({ kind: "open", id: t.Id }),
            onMenu: (e: React.MouseEvent) => {
              const { x, y } = menuPoint(e);
              openMenu(x, y, taskMenu(t.Id));
            },
          }));
    return [...evs, ...due];
  });

  const step = (n: number) => setFocus(view === "week" ? addDays(focus, 7 * n) : new Date(focus.getFullYear(), focus.getMonth() + n, 1));
  const { week, year } = isoWeek(addDays(weekStart, 3));
  const monthDays = new Date(focus.getFullYear(), focus.getMonth() + 1, 0).getDate();

  return (
    <>
      <ScheduleSidebar
        now={now}
        focus={focus}
        weekStart={weekStart}
        busy={busy}
        onPickDay={(d) => setFocus(startOfDay(d))}
        calendars={calendars}
        syncStatus={syncStatus}
        onToggle={toggle}
        onNew={() => openNew()}
        quickPreview={(text) => parseQuickEvent(text, now)}
        onQuickAdd={quickAdd}
        selected={selected}
        calendarOf={listFor}
        onEdit={edit}
        onCalendarMenu={showCalendarMenu}
        onEventMenu={showEventMenu}
        onAddCalendar={showAddCalendarMenu}
      />

      <main className="flex min-w-0 flex-1 flex-col gap-4 bg-bg px-7 pt-[22px]">
        <header className="flex h-12 shrink-0 items-center justify-between">
          <div className="flex items-baseline gap-3.5">
            <h2 className="m-0 font-head text-32 font-bold tracking-[-0.015em]">
              {view === "week" ? weekRangeLabel(weekStart) : monthStart.toLocaleDateString(locale(), { month: "long", year: "numeric" })}
            </h2>
            <span className="font-mono text-12 text-muted">{view === "week" ? `WEEK ${week} · ${year}` : `${monthDays} DAYS`}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1">
              <button aria-label="Previous" onClick={() => step(-1)} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              <button onClick={() => setFocus(startOfDay(new Date()))} className="h-10 rounded-[12px] border border-line px-4 text-13 font-medium hover:bg-panel">
                Today
              </button>
              <button aria-label="Next" onClick={() => step(1)} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
            <div role="group" aria-label="View" className="flex rounded-[12px] border border-line bg-panel p-[3px]">
              {(["week", "month"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => update({ ScheduleView: v })}
                  className={clsx("h-[34px] rounded-[9px] px-4 text-13 font-medium capitalize", view === v ? "bg-panel2 text-text" : "text-muted hover:text-text")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </header>

        {error && <div className="rounded-[12px] border border-danger/40 bg-danger/10 px-4 py-3 text-13 text-danger">{error}</div>}

        {view === "week" ? (
          <WeekView
            days={days}
            timed={occs.filter((o) => !o.event.AllDay)}
            allDay={allDayRows}
            now={now}
            selectedKey={selected?.key ?? null}
            calendarOf={listFor}
            onSelect={(o) => setSelectedKey(o.key)}
            onOpen={edit}
            onCreate={(s, e) => openNew(s, e)}
            onMove={move}
            onEventMenu={showEventMenu}
            onSlotMenu={showSlotMenu}
          />
        ) : (
          <MonthView
            month={monthStart}
            occs={occs}
            now={now}
            calendarOf={listFor}
            onDay={(d) => {
              setFocus(startOfDay(d));
              update({ ScheduleView: "week" });
            }}
            onSelect={(o) => setSelectedKey(o.key)}
            onEventMenu={showEventMenu}
            onDayMenu={showDayMenu}
          />
        )}
      </main>

      {editor && (
        <EventPopup
          event={editor.event}
          occ={editor.occ}
          isNew={editor.isNew}
          events={events}
          now={now}
          openMenu={openMenu}
          onClose={() => setEditor(null)}
          onSave={(e, scope: Scope) => {
            if (editor.isNew) addEvent(e);
            else saveEvent(e, editor.occ, scope);
            setEditor(null);
            setFocus(startOfDay(fromStamp(e.Start)));
            setSelectedKey(`${e.Id}@${e.Start.slice(0, 10)}`);
          }}
          onDelete={(scope) => {
            const occ = editor.occ ?? { event: editor.event, key: editor.event.Id, day: editor.event.Start.slice(0, 10), start: fromStamp(editor.event.Start), end: fromStamp(editor.event.End) };
            deleteOccurrence(occ, scope);
            setEditor(null);
          }}
        />
      )}
      {moving && (
        <ScopeDialog
          verb="Move"
          onResult={(scope) => {
            if (scope) moveOccurrence(moving.occ, moving.start, moving.end, scope);
            setMoving(null);
          }}
        />
      )}
      {deleting &&
        (deleting.event.Remote ? (
          <ConfirmDialog
            title={`Delete “${deleting.event.Title || "Untitled"}”?`}
            message={`It's deleted in ${appName[accounts.find((a) => a.Id === deleting.event.Remote!.Account)?.Provider ?? "microsoft"]} too, and can't be undone.`}
            okLabel="Delete"
            cancelLabel="Cancel"
            danger
            onResult={(ok) => {
              if (ok) deleteOccurrence(deleting, "all");
              setDeleting(null);
            }}
          />
        ) : (
          <ScopeDialog
            verb="Delete"
            onResult={(scope) => {
              if (scope) deleteOccurrence(deleting, scope);
              setDeleting(null);
            }}
          />
        ))}
      {calDialog === "new" && <NewCalendarDialog onClose={() => setCalDialog(null)} />}
      {calDialog === "subscribe" && <SubscribeDialog onClose={() => setCalDialog(null)} />}
      {calDialog === "import" && <ImportDialog onClose={() => setCalDialog(null)} />}
      {calDialog && typeof calDialog === "object" && <RenameCalendarDialog name={calDialog.name} onRename={calDialog.rename} onClose={() => setCalDialog(null)} />}
      {deletingList && <DeleteListDialog list={deletingList} lists={lists} tasks={tasks} onDone={() => setDeletingList(null)} />}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}
