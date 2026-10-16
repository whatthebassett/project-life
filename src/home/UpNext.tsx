import clsx from "clsx";
import { AlarmClock, CalendarDays, Check, Maximize2 } from "lucide-react";
import { useState } from "react";
import type { MenuItem } from "../components/ContextMenu";
import { openUrl } from "../lib/api";
import { useNotes } from "../notes/NotesContext";
import { requestSchedule } from "../schedule/nav";
import type { Screen } from "../shell/nav";
import { fromYmd, nowTime, startOfDay, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { setCompleted, type Task } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { Icon } from "../ui/icons";
import { eventMenu } from "./menus";
import { Card, clock, clockRange, isMicro, isTiny, useCardSize } from "./parts";
import { callNames, type HomeEvent } from "./sources";
import type { HomeData } from "./useHome";

// What's next today: the next (or current) event, or else the next timed
// task. Snooze hides it for ten minutes.
type Next = { kind: "event"; event: HomeEvent } | { kind: "task"; task: Task; start: Date };

const SNOOZE = 10 * 60_000;

function pickNext(home: HomeData, snoozed: Record<string, number>): Next | null {
  const now = home.now;
  const awake = (id: string) => !(snoozed[id] > now.getTime());
  const event = [...home.events]
    .filter((e) => e.end > now && e.start.toDateString() === now.toDateString() && awake(e.id))
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  if (event) return { kind: "event", event };
  const today = ymd(startOfDay(now));
  const task = home.tasks
    .filter((t) => !t.Completed && t.Due === today && t.DueTime && t.DueTime > nowTime(now) && awake(t.Id))
    .sort((a, b) => a.DueTime!.localeCompare(b.DueTime!))[0];
  if (!task) return null;
  const [h, m] = task.DueTime!.split(":").map(Number);
  const start = fromYmd(task.Due!);
  start.setHours(h, m);
  return { kind: "task", task, start };
}

// The big number: minutes to go, or hours once it's a while off.
function countdown(start: Date, end: Date | null, now: Date): { value: string; label: string } {
  if (start <= now && end) {
    const left = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / 60_000));
    return { value: String(left), label: "MIN LEFT" };
  }
  const mins = Math.max(1, Math.ceil((start.getTime() - now.getTime()) / 60_000));
  if (mins < 100) return { value: String(mins), label: "MIN TO GO" };
  const hours = Math.round(mins / 60);
  return { value: String(hours), label: hours === 1 ? "HR TO GO" : "HRS TO GO" };
}

export default function UpNext({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const { activate } = useNotes();
  const next = pickNext(home, snoozed);
  const snooze = (id: string) => setSnoozed((s) => ({ ...s, [id]: home.now.getTime() + SNOOZE }));

  // The card measures itself and fits what it can. Wide enough, the big
  // countdown stands beside the rest; otherwise it's a line under the label.
  // The title gets the lines there's room for, and the button and the
  // details come in only when they fit under it.
  const [ref, size] = useCardSize();
  // Until it's measured: the size it first comes at.
  const box = size.width ? size : { width: 705, height: 252 };
  const tiny = isTiny(box);
  const wide = box.width >= 480;
  const padX = isMicro(box) ? 12 : tiny ? 16 : wide ? 30 : 18;
  const padY = isMicro(box) ? 12 : tiny ? 16 : wide ? 26 : 18;
  const W = box.width - 2 - padX * 2;
  const H = box.height - 2 - padY * 2;
  const big = wide && H >= 76;
  // Beside the big countdown: one line of title, then the button, then the details.
  const bigActions = H >= 16 + 14 + 35 + 14 + 44;
  const bigMeta = H >= 16 + 14 + 35 + 6 + 22 + 14 + 44;
  // Without it: the label (and the countdown, on its own line unless the
  // card is wide), then as many lines of title as fit, up to three.
  const head = W >= 330 ? 16 : 36;
  const gap = big ? (bigActions ? 14 : 10) : tiny ? 8 : 14;
  const lineHeight = tiny ? 18.4 : 24.2;
  const smallActions = !tiny && W >= 150 && H >= head + gap + lineHeight + 14 + 44;
  const lines = big ? 1 : Math.min(3, Math.max(1, Math.floor((H - head - gap - (smallActions ? 58 : 0)) / lineHeight)));
  const titleClass = clsx("font-head font-bold tracking-[-0.01em]", big ? "text-32 leading-[1.1]" : tiny ? "text-16 leading-[1.15]" : "text-22 leading-[1.1]");
  const clamp = { display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines, overflow: "hidden" } as const;
  const cardClass = "col-span-2 flex-row! gap-7 p-[18px] @[30rem]:px-[30px] @[30rem]:py-[26px]";

  const style = { background: "radial-gradient(520px 240px at 100% 0%, var(--glow), transparent 70%), var(--panel)" };
  const openSchedule: MenuItem = { label: "Open Schedule", icon: <CalendarDays size={13} />, onSelect: () => onNavigate("schedule") };

  if (!next) {
    return (
      <Card ref={ref} id="up" menu={[openSchedule]} label="Up next" className={cardClass} style={style}>
        <div className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
          <div className="flex items-center gap-[10px]">
            {W >= 110 && <span className="h-2 w-2 shrink-0 rounded-full bg-faint" />}
            <span className="font-mono text-12 tracking-[0.14em] text-muted">UP NEXT</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {/* No countdown line here, so the words get its room. */}
            <div className={titleClass} style={{ ...clamp, WebkitLineClamp: big ? 1 : Math.min(3, Math.max(1, Math.floor((H - 16 - gap) / lineHeight))) }}>
              {W < 180 ? "Nothing else today" : "Nothing else scheduled today"}
            </div>
            {big && H >= 120 && <div className="truncate text-15 text-muted">Add a time to a task, like “Call Sam 5pm”, and it shows up here.</div>}
          </div>
        </div>
      </Card>
    );
  }

  const start = next.kind === "event" ? next.event.start : next.start;
  const end = next.kind === "event" ? next.event.end : null;
  const count = countdown(start, end, home.now);

  let title: string;
  let meta: string;
  let when: string;
  let actions: React.ReactNode;
  let menu: MenuItem[];
  if (next.kind === "event") {
    const e = next.event;
    title = e.title;
    when = clockRange(e.start, e.end);
    meta = [e.meta, e.call && `${callNames[e.call]} call`, e.note && "Linked note attached"].filter(Boolean).join(" · ");
    // Join turns solid ten minutes before the start (DESIGN.md §7).
    const live = e.start.getTime() - home.now.getTime() <= SNOOZE;
    actions = (
      <>
        {e.call && (
          <button
            type="button"
            onClick={() => (e.joinUrl ? void openUrl(e.joinUrl) : !home.sample && requestSchedule({ kind: "open", id: e.id.split("@")[0], day: e.id.split("@")[1] }))}
            title={e.joinUrl ? undefined : `Add the ${callNames[e.call]} link in Schedule`}
            className={clsx(
              "flex h-11 items-center gap-2 rounded-[13px] border border-accent px-[18px] text-14 font-semibold transition-[filter]",
              live ? "bg-accent text-accent-ink hover:brightness-110" : "text-text hover:bg-panel2",
            )}
          >
            <Icon name="video" size={17} stroke={2} />
            Join {callNames[e.call]}
          </button>
        )}
        {e.note && (
          <button type="button" onClick={() => (e.noteName ? void activate(e.noteName) : onNavigate("notes"))} className="h-11 rounded-[13px] border border-line bg-panel2 px-4 text-14 font-medium">
            Open note
          </button>
        )}
        <SnoozeButton onClick={() => snooze(e.id)} />
      </>
    );
    menu = [...eventMenu(e, Boolean(home.sample), (name) => void activate(name)), { type: "separator" }, snoozeItem(() => snooze(e.id))];
  } else {
    const t = next.task;
    const done = () => home.updateTasks((tasks) => setCompleted(tasks, t.Id, true, new Date()));
    title = t.Title;
    when = clock(start);
    meta = ["Task", listFor(t.List).name, t.Notes].filter(Boolean).join(" · ");
    actions = (
      <>
        <button
          type="button"
          onClick={done}
          className="flex h-11 items-center gap-2 rounded-[13px] bg-accent px-[18px] text-14 font-semibold text-accent-ink transition-[filter] hover:brightness-110"
        >
          <Icon name="check" size={17} stroke={2.6} />
          Mark done
        </button>
        <SnoozeButton onClick={() => snooze(t.Id)} />
      </>
    );
    menu = [
      { label: "Open", icon: <Maximize2 size={13} />, disabled: Boolean(home.sample), onSelect: () => requestTasks({ kind: "open", id: t.Id, popup: true }) },
      { label: "Mark done", icon: <Check size={13} />, onSelect: done },
      { type: "separator" },
      snoozeItem(() => snooze(t.Id)),
    ];
  }

  return (
    <Card ref={ref} id="up" menu={menu} label="Up next" className={cardClass} style={style}>
      <div className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-1">
          {W >= 110 && <span className="pl-pulse h-2 w-2 shrink-0 rounded-full bg-accent2" />}
          <span className="font-mono text-12 tracking-[0.14em] text-accent2">UP NEXT</span>
          {W >= 190 && <span className="font-mono text-12 text-muted">{when}</span>}
          {/* No room for the big countdown: it's said here. */}
          {!big && (
            <span className={clsx("truncate font-mono text-12 text-text", W < 330 && "basis-full")}>
              {count.value} {count.label.toLowerCase()}
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className={titleClass} style={clamp}>
            {title}
          </div>
          {big && bigMeta && <div className="truncate text-15 text-muted">{meta}</div>}
        </div>
        {(big ? bigActions : smallActions) && (
          <>
            <div className="flex-1" />
            {/* A small card keeps its main button; the rest are in its right-click menu. */}
            <div className={clsx("flex gap-[10px]", !big && "[&>*:not(:first-child)]:hidden")}>{actions}</div>
          </>
        )}
      </div>
      {big && (
        <div className="flex min-w-[150px] shrink-0 flex-col items-end justify-center gap-0.5">
          <div className={clsx("font-head leading-[0.9] font-normal tracking-[-0.04em]", H >= 104 ? "text-96" : "text-[64px]")}>{count.value}</div>
          <div className="font-mono text-12 tracking-[0.14em] text-muted">{count.label}</div>
        </div>
      )}
    </Card>
  );
}

const snoozeItem = (onSelect: () => void): MenuItem => ({ label: "Snooze 10 minutes", icon: <AlarmClock size={13} />, onSelect });

function SnoozeButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 rounded-[13px] border border-line px-4 text-14 font-medium text-muted transition-colors hover:text-text">
      Snooze 10m
    </button>
  );
}
