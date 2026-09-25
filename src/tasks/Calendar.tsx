import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import clsx from "clsx";
import { addDays, addMonths, formatTime, fromYmd, parseTime, startOfDay, ymd } from "./dates";

interface Props {
  // Opens below (or above) this, its right edge lined up with the anchor's.
  anchor: DOMRect;
  value: string | null;
  time: string | null;
  onPick: (due: string, time: string | null) => void;
  // Offered when there's a date to take away.
  onClear?: () => void;
  clearLabel?: string;
  // Offered where the current moment makes sense (dates in notes).
  onNow?: () => void;
  onClose: () => void;
}

const WIDTH = 236;

// The locale's first day of the week (0 = Sunday), where WebView2 knows it.
function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = locale.getWeekInfo?.() ?? locale.weekInfo;
    if (info) return info.firstDay % 7;
  } catch {
    // An unknown language tag: fall through to Sunday.
  }
  return 0;
}

// A small themed month calendar (the native date popup can't be themed).
// Arrows move by day and week, Page Up/Down by month, Enter picks; a time can
// be typed underneath. Escape or clicking away closes it.
export default function Calendar({ anchor, value, time, onPick, onClear, clearLabel = "Clear", onNow, onClose }: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [cursor, setCursor] = useState(() => (value ? fromYmd(value) : today));
  const [month, setMonth] = useState(() => new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const [timeText, setTimeText] = useState(time ? formatTime(time) : "");
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.right - WIDTH, top: anchor.bottom + 4 });
  const firstDay = useMemo(firstDayOfWeek, []);

  const typedTime = timeText.trim() ? parseTime(timeText) : null;
  const timeInvalid = timeText.trim() !== "" && typedTime === null;

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = anchor.bottom + 4;
    const top = below + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - r.height - 4) : below;
    setPos({ left: Math.max(8, Math.min(anchor.right - r.width, window.innerWidth - r.width - 8)), top });
  }, [anchor]);

  // Keys go to the grid from the start (autoFocus only works on form controls).
  useEffect(() => grid.current?.focus(), []);

  // Window capture, like the other popovers, so Escape closes only this.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", key, true);
    document.addEventListener("mousedown", down, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("mousedown", down, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Six weeks from the week that holds the 1st, so the grid never jumps in height.
  const days = useMemo(() => {
    const start = addDays(month, -((month.getDay() - firstDay + 7) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [month, firstDay]);

  const weekdayNames = useMemo(
    () => days.slice(0, 7).map((d) => d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2)),
    [days],
  );

  const moveTo = (d: Date) => {
    setCursor(d);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };

  const pick = (d: Date) => {
    if (timeInvalid) return;
    onPick(ymd(d), typedTime);
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const step: Record<string, () => Date> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, -1),
      PageDown: () => addMonths(cursor, 1),
      Home: () => addDays(cursor, -((cursor.getDay() - firstDay + 7) % 7)),
      End: () => addDays(cursor, 6 - ((cursor.getDay() - firstDay + 7) % 7)),
    };
    if (step[e.key]) {
      e.preventDefault();
      moveTo(step[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
    }
  };

  const title = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const cursorKey = ymd(cursor);
  const todayKey = ymd(today);

  return createPortal(
    <div
      ref={box}
      data-menu
      className="fixed z-50 rounded-lg border border-line p-2 text-[12.5px] shadow-xl"
      style={{ left: pos.left, top: pos.top, width: WIDTH, background: "var(--menu)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-1 flex items-center">
        <span className="flex-1 pl-1 font-semibold" aria-live="polite">
          {title}
        </span>
        <button className="rounded p-1 text-muted hover:bg-hover hover:text-fg" title="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
          <ChevronLeft size={14} />
        </button>
        <button className="rounded p-1 text-muted hover:bg-hover hover:text-fg" title="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}>
          <ChevronRight size={14} />
        </button>
      </div>

      <div
        ref={grid}
        role="grid"
        aria-label={title}
        aria-activedescendant={`cal-${cursorKey}`}
        tabIndex={0}
        className="rounded-md outline-none"
        onKeyDown={onGridKey}
      >
        <div role="row" className="grid grid-cols-7 pb-0.5">
          {weekdayNames.map((name, i) => (
            <span key={i} role="columnheader" className="text-center text-[10.5px] text-muted">
              {name}
            </span>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div key={week} role="row" className="grid grid-cols-7">
            {days.slice(week * 7, week * 7 + 7).map((d) => {
              const key = ymd(d);
              const selected = key === value;
              const outside = d.getMonth() !== month.getMonth();
              return (
                <div
                  key={key}
                  id={`cal-${key}`}
                  role="gridcell"
                  aria-selected={selected}
                  aria-label={d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  className={clsx(
                    "flex h-7 cursor-default items-center justify-center rounded-md text-[12px] tabular-nums",
                    selected ? "bg-accent text-accent-ink" : "hover:bg-hover",
                    !selected && outside && "text-muted opacity-60",
                    !selected && key === todayKey && "font-semibold text-accent-text",
                    key === cursorKey && !selected && "ring-1 ring-inset ring-accent",
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(d)}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 border-t border-line pt-1.5">
        <div className={clsx("flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-hover px-1.5", timeInvalid && "ring-1 ring-[#e5484d]")}>
          <Clock size={12} className="shrink-0 text-muted" />
          <input
            aria-label="Time (optional)"
            className="w-full min-w-0 bg-transparent text-[12px] outline-none placeholder:text-muted"
            style={{ caretColor: "auto" }}
            placeholder="Add a time"
            title="A time is optional: 9am, 2:30 pm, 17:00"
            value={timeText}
            onChange={(e) => setTimeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // The day the writer moved to (it starts on the current due date).
                e.preventDefault();
                pick(cursor);
              }
            }}
          />
        </div>
        <button className="rounded-md px-2 py-[3px] hover:bg-hover" onClick={() => pick(today)}>
          Today
        </button>
        {onNow && (
          <button className="rounded-md px-2 py-[3px] hover:bg-hover" title="Today, at the current time" onClick={onNow}>
            Now
          </button>
        )}
        {onClear && (
          <button className="rounded-md px-2 py-[3px] text-muted hover:bg-hover hover:text-fg" onClick={onClear}>
            {clearLabel}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
