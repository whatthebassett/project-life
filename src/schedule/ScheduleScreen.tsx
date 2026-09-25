import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ContextMenu, { type MenuItem, type MenuState } from "../components/ContextMenu";
import { isoWeek, useNow, weekRangeLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import { addDays, fromYmd, startOfDay, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { requestTasks } from "../tasks/nav";
import { useTasks } from "../tasks/useTasks";
import { addEvent, blankEvent, deleteOccurrence, moveOccurrence, parseQuickEvent, saveEvent, type Scope } from "./actions";
import EventPopup from "./EventPopup";
import { fromStamp, occurrences, type CalEvent, type Occurrence } from "./events";
import { softOf } from "./look";
import MonthView, { monthGrid } from "./MonthView";
import { subscribeScheduleRequests, takeScheduleRequest } from "./nav";
import ScheduleSidebar, { type CalendarRow } from "./ScheduleSidebar";
import ScopeDialog from "./ScopeDialog";
import { useEvents } from "./useEvents";
import WeekView, { type AllDayItem } from "./WeekView";

const TASKS_CAL = "tasks";

const mondayOf = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));

// The Schedule screen (Calendar.dc.html): quick add, the mini month,
// calendars and the selected event on the left; the week or month on the
// right. Double-click an event (or Edit) for the event pop-up
// (EventNew.dc.html), which also makes new ones.
export default function ScheduleScreen() {
  const { events, error } = useEvents();
  const { tasks, lists } = useTasks();
  const { settings, update } = useSettings();
  const now = useNow();
  const view = settings.ScheduleView === "month" ? "month" : "week";
  const hidden = useMemo(() => new Set(settings.ScheduleHidden ?? []), [settings.ScheduleHidden]);
  const [focus, setFocus] = useState(() => startOfDay(new Date()));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ event: CalEvent; occ: Occurrence | null; isNew: boolean } | null>(null);
  const [moving, setMoving] = useState<{ occ: Occurrence; start: Date; end: Date } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);

  const weekStart = mondayOf(focus);
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
    ...lists.map((l) => ({
      id: l.Id,
      name: l.Name,
      color: `var(--${l.Color})`,
      on: !hidden.has(l.Id),
      count: all.filter((o) => o.event.Calendar === l.Id).length,
    })),
    { id: TASKS_CAL, name: "Tasks due", color: "var(--muted)", on: !hidden.has(TASKS_CAL), count: tasksDue.length },
  ];

  const toggle = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update({ ScheduleHidden: [...next] });
  };

  const openNew = useCallback((start?: Date, end?: Date) => {
    const n = new Date();
    const s = start ?? new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + (n.getMinutes() >= 30 ? 1 : 0), n.getMinutes() >= 30 ? 0 : 30);
    setEditor({ event: blankEvent(s, end ?? new Date(s.getTime() + 60 * 60_000)), occ: null, isNew: true });
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
    if (occ.event.Repeat) setMoving({ occ, start, end });
    else moveOccurrence(occ, start, end, "all");
    setSelectedKey(occ.event.Repeat ? null : `${occ.event.Id}@${ymd(start)}`);
  };

  const edit = (o: Occurrence) => setEditor({ event: o.event, occ: o, isNew: false });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const allDayRows: AllDayItem[][] = days.map((d) => {
    const key = ymd(d);
    const next = addDays(d, 1);
    const evs = occs
      .filter((o) => o.event.AllDay && o.start < next && o.end > d)
      .map<AllDayItem>((o) => {
        const cal = listFor(o.event.Calendar);
        return { key: o.key, title: o.event.Title, task: false, color: cal.color, soft: softOf(cal.tone), onClick: () => setSelectedKey(o.key) };
      });
    const due = hidden.has(TASKS_CAL)
      ? []
      : tasksDue
          .filter((t) => t.Due === key)
          .map<AllDayItem>((t) => ({ key: `task:${t.Id}`, title: t.Title, task: true, color: "var(--muted)", soft: "var(--panel2)", onClick: () => requestTasks({ kind: "open", id: t.Id }) }));
    return [...evs, ...due];
  });

  const step = (n: number) => setFocus(view === "week" ? addDays(focus, 7 * n) : new Date(focus.getFullYear(), focus.getMonth() + n, 1));
  const { week, year } = isoWeek(weekStart);
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
        onToggle={toggle}
        onNew={() => openNew()}
        quickPreview={(text) => parseQuickEvent(text, now)}
        onQuickAdd={quickAdd}
        selected={selected}
        calendarOf={listFor}
        onEdit={edit}
      />

      <main className="flex min-w-0 flex-1 flex-col gap-4 bg-bg px-7 pt-[22px]">
        <header className="flex h-12 shrink-0 items-center justify-between">
          <div className="flex items-baseline gap-3.5">
            <h2 className="m-0 font-head text-32 font-bold tracking-[-0.015em]">
              {view === "week" ? weekRangeLabel(weekStart) : monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
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
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}
