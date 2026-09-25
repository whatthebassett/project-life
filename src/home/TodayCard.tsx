import { openCount, todaysTasks } from "../tasks/model";
import { ProgressRing } from "../ui/Progress";
import { Card } from "./parts";
import type { HomeData } from "./useHome";

// Today: a ring for today's tasks done, and what's left of the day.
export default function TodayCard({ home }: { home: HomeData }) {
  const today = todaysTasks(home.tasks, home.now);
  const total = today.length;
  const done = total - openCount(today);
  const pct = total ? done / total : 0;
  const habitsDone = home.habits.filter((h) => h.doneToday).length;
  const eventsLeft = home.events.filter((e) => e.end > home.now && e.start.toDateString() === home.now.toDateString()).length;

  return (
    <Card label="Today" className="flex-row! items-center gap-6 p-[26px]">
      <ProgressRing value={pct} size={132} radius={54} stroke={12} label={`${done} of ${total} of today's tasks done`}>
        <span className="font-mono text-26 font-medium">{Math.round(pct * 100)}%</span>
        <span className="text-11 tracking-[0.08em] text-muted">DONE</span>
      </ProgressRing>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="font-mono text-12 tracking-[0.14em] text-muted">TODAY</div>
        <div className="flex flex-col gap-2 text-14">
          <Line value={`${done}/${total}`} color="text-accent" label="tasks" />
          <Line value={home.habits.length ? `${habitsDone}/${home.habits.length}` : "—"} color="text-accent2" label="habits" />
          <Line value={home.events.length ? String(eventsLeft) : "—"} color="text-warn" label="events left" />
        </div>
      </div>
    </Card>
  );
}

function Line({ value, color, label }: { value: string; color: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-mono font-medium ${color}`}>{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}
