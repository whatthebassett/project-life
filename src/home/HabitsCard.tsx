import clsx from "clsx";
import type { Screen } from "../shell/nav";
import { Card, CardHeader, CardLink, Empty } from "./parts";
import type { HomeData } from "./useHome";

const letters = ["M", "T", "W", "T", "F", "S", "S"];

// This week for each habit, Monday first: done days filled, missed ones
// outlined, today clickable, the days to come dashed.
export default function HabitsCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const todayIdx = (home.now.getDay() + 6) % 7;
  return (
    <Card label="Habits" className="gap-3 px-6 py-[22px]">
      <CardHeader title="Habits">
        <div className="flex gap-1.5" aria-hidden="true">
          {letters.map((l, i) => (
            <span key={i} className={clsx("w-[22px] text-center font-mono text-11", i === todayIdx ? "text-accent" : "text-muted")}>
              {l}
            </span>
          ))}
        </div>
      </CardHeader>
      {home.habits.map((h) => {
        // Line the week up with today, whatever the data holds.
        const past = Array.from({ length: todayIdx }, (_, i) => h.past[h.past.length - todayIdx + i] ?? false);
        const streak = h.streak + (h.doneToday ? 1 : 0);
        return (
          <div key={h.id} className="flex min-h-11 items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="truncate text-14 font-medium">{h.name}</div>
              <div className="font-mono text-11 text-muted">{streak} day streak</div>
            </div>
            <div className="flex items-center gap-1.5">
              {letters.map((_, i) => {
                if (i < todayIdx) {
                  const ok = past[i];
                  return <span key={i} className={clsx("h-[22px] w-[22px] rounded-[7px] border-[1.5px]", ok ? "border-accent2 bg-accent2" : "border-faint")} />;
                }
                if (i === todayIdx) {
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-pressed={h.doneToday}
                      aria-label={`${h.doneToday ? "Undo today" : "Mark today done"}: ${h.name}`}
                      onClick={() => home.toggleHabit(h.id)}
                      className={clsx("hit relative h-[22px] w-[22px] rounded-[7px] border-[1.5px] border-accent shadow-[0_0_0_3px_var(--accent-soft)]", h.doneToday && "bg-accent")}
                    />
                  );
                }
                return <span key={i} className="h-[22px] w-[22px] rounded-[7px] border-[1.5px] border-dashed border-faint" />;
              })}
            </div>
          </div>
        );
      })}
      {home.habits.length === 0 && (
        <Empty>
          No habits yet. They'll show up here once you add some in <CardLink onClick={() => onNavigate("habits")}>Habits</CardLink>.
        </Empty>
      )}
    </Card>
  );
}
