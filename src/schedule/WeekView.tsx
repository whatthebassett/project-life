import clsx from "clsx";
import { Video } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { addDays, ymd } from "../tasks/dates";
import type { TaskList } from "../tasks/lists";
import type { Occurrence } from "./events";
import { rangeLabel, shortTime, softOf } from "./look";

export const HOUR = 52;
// The view opens scrolled to 8 AM (the mockup's 8 AM to 11 PM).
const FIRST_HOUR = 8;
const SNAP = 15;

export interface AllDayItem {
  key: string;
  title: string;
  // A task due that day draws as a little checkbox; an event as a chip.
  task: boolean;
  color: string;
  soft: string;
  onClick: () => void;
}

interface Props {
  days: Date[];
  timed: Occurrence[];
  allDay: AllDayItem[][];
  now: Date;
  selectedKey: string | null;
  calendarOf: (id: string) => TaskList;
  onSelect: (o: Occurrence) => void;
  onOpen: (o: Occurrence) => void;
  onCreate: (start: Date, end: Date) => void;
  onMove: (o: Occurrence, start: Date, end: Date) => void;
}

interface Placed {
  occ: Occurrence;
  // Minutes from that day's midnight.
  top: number;
  bottom: number;
  col: number;
  cols: number;
  // The first or last piece of an event that runs past midnight.
  first: boolean;
}

type Drag =
  | { kind: "move" | "resize"; occ: Occurrence; x: number; y: number; moved: boolean }
  | { kind: "create"; day: number; from: number; to: number; moved: boolean };

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

// Side by side where events overlap: each cluster of overlapping events
// shares the width, each in the first column free at its start.
function place(occs: Occurrence[], day: Date): Placed[] {
  const dayStart = day.getTime();
  const dayEnd = addDays(day, 1).getTime();
  const pieces = occs
    .filter((o) => o.end.getTime() > dayStart && o.start.getTime() < dayEnd)
    .map((o) => ({
      occ: o,
      top: o.start.getTime() <= dayStart ? 0 : minutesOf(o.start),
      bottom: o.end.getTime() >= dayEnd ? 24 * 60 : Math.max(minutesOf(o.end), (o.start.getTime() <= dayStart ? 0 : minutesOf(o.start)) + SNAP),
      first: o.start.getTime() >= dayStart,
      col: 0,
      cols: 1,
    }))
    .sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  let cluster: typeof pieces = [];
  let clusterEnd = -1;
  const ends: number[] = [];
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((p) => p.col + 1));
    cluster.forEach((p) => (p.cols = cols));
    cluster = [];
    ends.length = 0;
  };
  for (const p of pieces) {
    if (p.top >= clusterEnd) flush();
    let col = ends.findIndex((e) => e <= p.top);
    if (col < 0) col = ends.length;
    ends[col] = p.bottom;
    p.col = col;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.bottom);
  }
  flush();
  return pieces;
}

// The week (Calendar.dc.html): the days across the top with their all-day
// row, the hours down the side, events in their calendar's soft color. Drag
// an event to move it, its bottom edge to resize it, or empty space to make
// a new one; double-click to open one.
export default function WeekView({ days, timed, allDay, now, selectedKey, calendarOf, onSelect, onOpen, onCreate, onMove }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [preview, setPreview] = useState<{ key: string; start: Date; end: Date } | null>(null);
  const todayKey = ymd(now);

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = FIRST_HOUR * HOUR - 4;
  }, []);

  const at = (e: React.PointerEvent) => {
    const r = grid.current!.getBoundingClientRect();
    const day = Math.min(6, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * 7)));
    const minutes = Math.min(24 * 60, Math.max(0, ((e.clientY - r.top) / HOUR) * 60));
    return { day, minutes };
  };

  const startEventDrag = (e: React.PointerEvent, occ: Occurrence, kind: "move" | "resize") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // The pointer is captured once it moves, so a double-click still opens it.
    setDrag({ kind, occ, x: e.clientX, y: e.clientY, moved: false });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Only empty space in a day starts a new event (events handle their own).
    if (e.button !== 0 || !(e.target as HTMLElement).dataset.col) return;
    const { day, minutes } = at(e);
    const from = Math.floor(minutes / 30) * 30;
    grid.current?.setPointerCapture(e.pointerId);
    setDrag({ kind: "create", day, from, to: from + 60, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === "create") {
      const { minutes } = at(e);
      const to = Math.max(drag.from + SNAP, snap(minutes));
      if (to !== drag.to || !drag.moved) setDrag({ ...drag, to, moved: drag.moved || Math.abs(minutes - drag.from) > 8 });
      return;
    }
    const dy = e.clientY - drag.y;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dy) < 4 && Math.abs(dx) < 4) return;
    const r = grid.current!.getBoundingClientRect();
    const deltaMin = snap((dy / HOUR) * 60);
    const deltaDays = drag.kind === "move" ? Math.round(dx / (r.width / 7)) : 0;
    const { occ } = drag;
    let start = new Date(occ.start.getTime() + deltaMin * 60_000);
    let end = new Date(occ.end.getTime() + deltaMin * 60_000);
    if (drag.kind === "resize") {
      start = occ.start;
      end = new Date(Math.max(occ.start.getTime() + SNAP * 60_000, occ.end.getTime() + deltaMin * 60_000));
    } else {
      start = addDaysKeepTime(start, deltaDays);
      end = addDaysKeepTime(end, deltaDays);
    }
    if (!drag.moved) {
      grid.current?.setPointerCapture(e.pointerId);
      setDrag({ ...drag, moved: true });
    }
    setPreview({ key: occ.key, start, end });
  };

  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "create") {
      const day = days[d.day];
      const from = d.moved ? Math.min(d.from, d.to) : d.from;
      const to = d.moved ? Math.max(d.to, d.from + SNAP) : d.from + 60;
      onCreate(new Date(day.getTime() + from * 60_000), new Date(day.getTime() + to * 60_000));
      return;
    }
    const p = preview;
    setPreview(null);
    if (d.moved && p && (p.start.getTime() !== d.occ.start.getTime() || p.end.getTime() !== d.occ.end.getTime())) onMove(d.occ, p.start, p.end);
    else if (!d.moved) onSelect(d.occ);
  };

  const shown = timed.map((o) => (preview && o.key === preview.key ? { ...o, start: preview.start, end: preview.end } : o));
  const nowTop = (minutesOf(now) / 60) * HOUR;
  const allDayRows = Math.max(1, ...allDay.map((a) => Math.min(a.length, 3)));

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-line bg-panel">
      <div className="flex shrink-0 border-b border-line pr-3">
        <div className="w-[60px] shrink-0" />
        <div className="grid flex-1 grid-cols-7">
          {days.map((d, i) => {
            const today = ymd(d) === todayKey;
            const items = allDay[i] ?? [];
            return (
              <div key={i} className="flex min-w-0 flex-col gap-2 border-l border-line px-2.5 pt-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className={clsx("font-mono text-11 tracking-[0.08em]", today ? "text-accent" : "text-muted")}>
                    {d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  </span>
                  <span className={clsx("flex h-[30px] min-w-[30px] items-center justify-center rounded-[10px] px-1.5 text-15 font-semibold", today ? "bg-accent text-accent-ink" : "text-text")}>
                    {d.getDate()}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5" style={{ minHeight: allDayRows * 26 - 2 }}>
                  {items.slice(0, items.length > 3 ? 2 : 3).map((a) => (
                    <button
                      key={a.key}
                      onClick={a.onClick}
                      title={a.title}
                      className="flex h-6 min-w-0 items-center gap-1.5 rounded-[7px] px-2 text-left text-11 font-medium text-text"
                      style={{ background: a.task ? "var(--panel2)" : a.soft }}
                    >
                      {a.task ? (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px] border-muted" />
                      ) : (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.color }} />
                      )}
                      <span className="truncate">{a.title}</span>
                    </button>
                  ))}
                  {items.length > 3 && <span className="pl-2 text-11 text-muted">+{items.length - 2} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR }}>
          <div className="relative w-[60px] shrink-0">
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className="absolute right-2.5 -translate-y-1/2 font-mono text-10 text-muted" style={{ top: h * HOUR }}>
                {shortTime(new Date(2000, 0, 1, h))}
              </span>
            ))}
            {days.some((d) => ymd(d) === todayKey) && (
              <span className="absolute right-1.5 z-[1] flex h-[18px] -translate-y-1/2 items-center rounded-[6px] bg-accent2 px-[5px] font-mono text-10 font-medium text-accent-ink" style={{ top: nowTop }}>
                {`${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, "0")}`}
              </span>
            )}
          </div>
          <div
            ref={grid}
            className="grid flex-1 touch-none grid-cols-7 select-none"
            style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--line) 0 1px, transparent 1px ${HOUR}px)` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              setDrag(null);
              setPreview(null);
            }}
          >
            {days.map((d, i) => {
              const today = ymd(d) === todayKey;
              return (
                <div key={i} data-col={i} className="relative border-l border-line" style={{ background: today ? "var(--today-tint)" : undefined }}>
                  {place(shown, d).map((p) => {
                    const o = p.occ;
                    const cal = calendarOf(o.event.Calendar);
                    const selected = o.key === selectedKey;
                    const past = o.end <= now;
                    const h = Math.max(22, ((p.bottom - p.top) / 60) * HOUR - 3);
                    const tall = h >= 44;
                    const dragging = preview?.key === o.key;
                    return (
                      <div
                        key={o.key}
                        role="button"
                        tabIndex={0}
                        aria-label={`${o.event.Title || "Untitled event"}, ${o.start.toLocaleDateString(undefined, { weekday: "long" })} ${shortTime(o.start)}`}
                        aria-pressed={selected}
                        onPointerDown={(e) => startEventDrag(e, o, "move")}
                        onDoubleClick={() => onOpen(o)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onOpen(o);
                          else if (e.key === " ") {
                            e.preventDefault();
                            onSelect(o);
                          }
                        }}
                        className={clsx(
                          "absolute flex cursor-grab flex-col gap-0.5 overflow-hidden rounded-[10px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          tall ? "px-2.5 py-2" : "px-2.5 py-1",
                          dragging && "z-10 cursor-grabbing opacity-90",
                        )}
                        style={{
                          top: (p.top / 60) * HOUR + 1,
                          height: h,
                          left: `calc(${(p.col / p.cols) * 100}% + 4px)`,
                          width: `calc(${100 / p.cols}% - 8px)`,
                          background: selected ? cal.color : softOf(cal.tone),
                          color: selected ? "var(--accent-ink)" : past ? "var(--muted)" : "var(--text)",
                          boxShadow: selected || dragging ? "0 10px 24px rgba(0,0,0,0.35)" : undefined,
                        }}
                      >
                        <span className="flex w-full items-center gap-1.5 overflow-hidden text-12 leading-[1.2] font-semibold whitespace-nowrap">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: selected ? "var(--accent-ink)" : cal.color }} />
                          <span className="flex-1 truncate">{o.event.Title || "Untitled event"}</span>
                          {o.event.Call && <Video size={11} strokeWidth={2} className="shrink-0 opacity-80" />}
                        </span>
                        {tall && p.first && <span className="pl-3 font-mono text-10 opacity-85">{rangeLabel(o)}</span>}
                        <span
                          aria-hidden="true"
                          onPointerDown={(e) => startEventDrag(e, o, "resize")}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                        />
                      </div>
                    );
                  })}
                  {drag?.kind === "create" && drag.day === i && drag.moved && (
                    <div
                      className="pointer-events-none absolute inset-x-1 rounded-[10px] border-2 border-dashed border-accent bg-accent-soft"
                      style={{ top: (Math.min(drag.from, drag.to) / 60) * HOUR + 1, height: (Math.abs(drag.to - drag.from) / 60) * HOUR - 2 }}
                    />
                  )}
                  {today && (
                    <span className="pointer-events-none absolute right-0 -left-[5px] z-[2] h-0.5 bg-accent2" style={{ top: nowTop }}>
                      <span className="absolute top-[-4px] left-0 h-2.5 w-2.5 rounded-full bg-accent2" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function addDaysKeepTime(d: Date, n: number): Date {
  if (!n) return d;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
}
