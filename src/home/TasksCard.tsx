import clsx from "clsx";
import { addDays, daysBetween, formatDue, startOfDay, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { byDue, isOverdue, openCount, setCompleted, todaysTasks, type Task } from "../tasks/model";
import { requestTasks } from "../tasks/nav";
import { Checkbox } from "../ui/Checkbox";
import { Card, CardHeader, Empty } from "./parts";
import type { HomeData } from "./useHome";

// Today's tasks (due today or overdue, and what was checked off today), then
// the coming week's. Checking one off updates the Today ring at once, and it
// stays in place, struck through, so the tick can be seen.
export default function TasksCard({ home }: { home: HomeData }) {
  const today = startOfDay(home.now);
  const todays = todaysTasks(home.tasks, home.now);
  const inToday = new Set(todays.map((t) => t.Id));
  const weekEnd = ymd(addDays(today, 7));
  const upcoming = home.tasks.filter((t) => !t.Completed && !inToday.has(t.Id) && t.Due && t.Due <= weekEnd).sort(byDue);
  const shown = [...todays, ...upcoming];
  const left = openCount(todays);

  const toggle = (t: Task) => home.updateTasks((tasks) => setCompleted(tasks, t.Id, !t.Completed, new Date()));

  return (
    <Card label="Tasks" className="flex-1 gap-[14px] p-6">
      <CardHeader title="Tasks">
        <span className="font-mono text-12 text-muted">{left} left</span>
      </CardHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {shown.map((t) => {
          const done = Boolean(t.Completed);
          const dueToday = t.Due ? daysBetween(ymd(today), t.Due) === 0 : false;
          const dueColor = done ? "text-muted" : isOverdue(t, home.now) ? "text-danger" : dueToday ? "text-warn" : "text-muted";
          return (
            <div key={t.Id} className="flex min-h-[58px] items-center gap-3 border-b border-line px-1 py-1.5">
              <Checkbox
                shape="square"
                checked={done}
                onChange={() => toggle(t)}
                label={`${done ? "Mark not done" : "Mark done"}: ${t.Title}`}
                className="-my-1.5 -mr-2 -ml-[10px]"
              />
              <button
                onClick={() => !home.sample && requestTasks({ kind: "open", id: t.Id })}
                title="Open in Tasks"
                className="flex min-w-0 flex-1 flex-col gap-1 text-left"
              >
                <div className={clsx("truncate text-14 font-medium", done ? "text-muted line-through" : "text-text")}>{t.Title}</div>
                <div className="flex items-center gap-2 text-12">
                  {t.Due && <span className={dueColor}>{formatDue(t.Due, t.DueTime, today)}</span>}
                  {t.Due && <span className="h-[3px] w-[3px] rounded-full bg-faint" />}
                  <span className="text-muted">{listFor(t.List).name}</span>
                </div>
              </button>
            </div>
          );
        })}
        {shown.length === 0 && <Empty>Nothing due this week. Add one above, like “Pay rent fri 5pm”.</Empty>}
      </div>
    </Card>
  );
}
