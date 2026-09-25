import clsx from "clsx";
import { useState } from "react";
import { openUrl } from "../lib/api";
import type { Screen } from "../shell/nav";
import { fromYmd, nowTime, startOfDay, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { setCompleted, type Task } from "../tasks/model";
import { Icon } from "../ui/icons";
import { Card, clock, clockRange } from "./parts";
import { callNames, type HomeEvent } from "./sources";
import type { HomeData } from "./useHome";

// What's next today: the next (or current) event, or, until Schedule exists,
// the next timed task. Snooze hides it for ten minutes.
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
  const next = pickNext(home, snoozed);
  const snooze = (id: string) => setSnoozed((s) => ({ ...s, [id]: home.now.getTime() + SNOOZE }));

  const style = { background: "radial-gradient(520px 240px at 100% 0%, var(--glow), transparent 70%), var(--panel)" };

  if (!next) {
    return (
      <Card label="Up next" className="col-span-2 flex-row! gap-7 px-[30px] py-[26px]" style={style}>
        <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
          <div className="flex items-center gap-[10px]">
            <span className="h-2 w-2 rounded-full bg-faint" />
            <span className="font-mono text-12 tracking-[0.14em] text-muted">UP NEXT</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="font-head text-32 leading-[1.1] font-bold tracking-[-0.01em]">Nothing else scheduled today</div>
            <div className="text-15 text-muted">Add a time to a task, like “Call Sam 5pm”, and it shows up here.</div>
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
            onClick={() => e.joinUrl && void openUrl(e.joinUrl)}
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
          <button type="button" onClick={() => onNavigate("notes")} className="h-11 rounded-[13px] border border-line bg-panel2 px-4 text-14 font-medium">
            Open note
          </button>
        )}
        <SnoozeButton onClick={() => snooze(e.id)} />
      </>
    );
  } else {
    const t = next.task;
    title = t.Title;
    when = clock(start);
    meta = ["Task", listFor(t.List).name, t.Notes].filter(Boolean).join(" · ");
    actions = (
      <>
        <button
          type="button"
          onClick={() => home.updateTasks((tasks) => setCompleted(tasks, t.Id, true, new Date()))}
          className="flex h-11 items-center gap-2 rounded-[13px] bg-accent px-[18px] text-14 font-semibold text-accent-ink transition-[filter] hover:brightness-110"
        >
          <Icon name="check" size={17} stroke={2.6} />
          Mark done
        </button>
        <SnoozeButton onClick={() => snooze(t.Id)} />
      </>
    );
  }

  return (
    <Card label="Up next" className="col-span-2 flex-row! gap-7 px-[30px] py-[26px]" style={style}>
      <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
        <div className="flex items-center gap-[10px]">
          <span className="pl-pulse h-2 w-2 rounded-full bg-accent2" />
          <span className="font-mono text-12 tracking-[0.14em] text-accent2">UP NEXT</span>
          <span className="font-mono text-12 text-muted">{when}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="truncate font-head text-32 leading-[1.1] font-bold tracking-[-0.01em]">{title}</div>
          <div className="truncate text-15 text-muted">{meta}</div>
        </div>
        <div className="flex-1" />
        <div className="flex gap-[10px]">{actions}</div>
      </div>
      <div className="flex w-[150px] shrink-0 flex-col items-end justify-center gap-0.5 border-l border-line">
        <div className="font-head text-96 leading-[0.9] font-normal tracking-[-0.04em]">{count.value}</div>
        <div className="font-mono text-12 tracking-[0.14em] text-muted">{count.label}</div>
      </div>
    </Card>
  );
}

function SnoozeButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="h-11 rounded-[13px] border border-line px-4 text-14 font-medium text-muted transition-colors hover:text-text">
      Snooze 10m
    </button>
  );
}
