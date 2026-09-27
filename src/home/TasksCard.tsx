import clsx from "clsx";
import { AlarmClock, Check, CheckSquare, Copy, Flag, Maximize2, RotateCcw, Trash2 } from "lucide-react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { go } from "../shell/go";
import { applyLater, deleteTasks, duplicateTask, laterChoices } from "../tasks/actions";
import { addDays, daysBetween, formatDue, startOfDay, ymd } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { byDue, isOverdue, openCount, setCompleted, todaysTasks, type Task } from "../tasks/model";
import { priorityMenu } from "../tasks/menus";
import { requestTasks } from "../tasks/nav";
import { Checkbox } from "../ui/Checkbox";
import { Card, CardHeader, Empty, useRowMenu } from "./parts";
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
  const openMenu = useRowMenu("tasks", "Tasks");

  // Like the Tasks screen's row menu, less what needs the list at hand.
  // Sample tasks aren't in the real list, so only ticking them works.
  const taskMenu = (t: Task): MenuItem[] => {
    const done = Boolean(t.Completed);
    const off = Boolean(home.sample);
    return [
      { label: "Open", icon: <Maximize2 size={13} />, disabled: off, onSelect: () => requestTasks({ kind: "open", id: t.Id, popup: true }) },
      done
        ? { label: "Mark not done", icon: <RotateCcw size={13} />, onSelect: () => toggle(t) }
        : { label: "Complete", icon: <Check size={13} />, onSelect: () => toggle(t) },
      { type: "separator" },
      {
        label: "Later",
        icon: <AlarmClock size={13} />,
        disabled: done || off,
        children: laterChoices(t, new Date()).map<MenuItem>((c) => ({ label: c.label, hint: c.hint, onSelect: () => applyLater(t, c) })),
      },
      { label: "Priority", icon: <Flag size={13} />, disabled: off, children: priorityMenu(t) },
      { label: "Duplicate", icon: <Copy size={13} />, disabled: off, onSelect: () => duplicateTask(t) },
      { type: "separator" },
      { label: "Move to Recycle Bin", icon: <Trash2 size={13} />, danger: true, disabled: off, onSelect: () => deleteTasks([t]) },
    ];
  };

  return (
    <Card id="tasks" menu={[{ label: "Open Tasks", icon: <CheckSquare size={13} />, onSelect: () => go("tasks") }]} label="Tasks" className="flex-1 gap-[14px] p-6">
      <CardHeader title="Tasks">
        <span className="font-mono text-12 text-muted">{left} left</span>
      </CardHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {shown.map((t) => {
          const done = Boolean(t.Completed);
          const dueToday = t.Due ? daysBetween(ymd(today), t.Due) === 0 : false;
          const dueColor = done ? "text-muted" : isOverdue(t, home.now) ? "text-danger" : dueToday ? "text-warn" : "text-muted";
          return (
            <div
              key={t.Id}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const { x, y } = menuPoint(e);
                openMenu(x, y, taskMenu(t));
              }}
              className="flex min-h-[58px] items-center gap-3 border-b border-line px-1 py-1.5"
            >
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
