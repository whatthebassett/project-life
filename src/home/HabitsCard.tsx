import { dayOfWeek, locale, weekLetters } from "../lib/format";
import { fromYmd } from "../tasks/dates";
import clsx from "clsx";
import { Check, EyeOff, Maximize2, Repeat, RotateCcw } from "lucide-react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { saveHabit } from "../habits/actions";
import { habitStore, useHabits } from "../habits/useHabits";
import { showHabit } from "../shell/go";
import type { Screen } from "../shell/nav";
import { toast } from "../ui/Toast";
import { Card, CardHeader, CardLink, Empty, useRowMenu } from "./parts";
import type { HomeData } from "./useHome";
import type { HomeHabit } from "./sources";

// This week for each habit, Monday first: done days filled, missed ones
// outlined, the days to come dashed. Today and the days before it can be
// clicked, to fill in a day that was done but not ticked.
export default function HabitsCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const todayIdx = dayOfWeek(home.now);
  const letters = weekLetters();
  const { habits } = useHabits();
  const openMenu = useRowMenu("habits", "Habits");

  // Sample habits aren't real ones, so they can't be opened or hidden.
  const habitMenu = (h: HomeHabit): MenuItem[] => {
    const real = home.sample ? undefined : habits.find((x) => x.Id === h.id);
    return [
      h.doneToday
        ? { label: "Undo today", icon: <RotateCcw size={13} />, onSelect: () => home.toggleHabit(h.id) }
        : { label: "Mark today done", icon: <Check size={13} />, onSelect: () => home.toggleHabit(h.id) },
      { label: "Open in Habits", icon: <Maximize2 size={13} />, onSelect: () => (real ? showHabit(real.Id) : onNavigate("habits")) },
      { type: "separator" },
      {
        label: "Hide from Home",
        icon: <EyeOff size={13} />,
        disabled: !real,
        onSelect: () => {
          if (!real) return;
          saveHabit({ ...real, ShowOnHome: false });
          toast(`Hid “${real.Name}” from Home`, () => {
            // Whatever it is by then, with Show on Home back on.
            const now = habitStore().getState().file.Habits.find((x) => x.Id === real.Id);
            if (now) saveHabit({ ...now, ShowOnHome: true });
          });
        },
      },
    ];
  };

  return (
    <Card id="habits" menu={[{ label: "Open Habits", icon: <Repeat size={13} />, onSelect: () => onNavigate("habits") }]} label="Habits" className="gap-3 px-6 py-[22px]">
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
        const pastDays = Array.from({ length: todayIdx }, (_, i) => h.pastDays?.[(h.pastDays?.length ?? 0) - todayIdx + i]);
        const streak = h.streak + (h.doneToday ? 1 : 0);
        return (
          <div
            key={h.id}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const { x, y } = menuPoint(e);
              openMenu(x, y, habitMenu(h));
            }}
            className="flex min-h-11 items-center justify-between gap-3"
          >
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="truncate text-14 font-medium">{h.name}</div>
              <div className="font-mono text-11 text-muted">{streak} day streak</div>
            </div>
            <div className="flex items-center gap-1.5">
              {letters.map((_, i) => {
                if (i < todayIdx) {
                  const ok = past[i];
                  const day = pastDays[i];
                  const square = clsx("h-[22px] w-[22px] rounded-[7px] border-[1.5px]", ok ? "border-accent2 bg-accent2" : "border-faint");
                  if (!day || !home.fillHabitDay) return <span key={i} className={square} />;
                  return (
                    <button
                      key={i}
                      type="button"
                      tabIndex={-1}
                      aria-pressed={ok}
                      aria-label={`${ok ? "Clear" : "Mark done"} ${fromYmd(day).toLocaleDateString(locale(), { weekday: "long" })}: ${h.name}`}
                      title={ok ? "Done. Click to clear it." : "Click to mark it done."}
                      onClick={() => home.fillHabitDay?.(h.id, day)}
                      className={clsx(square, "cursor-pointer transition-[box-shadow] hover:shadow-[0_0_0_2px_var(--line)]")}
                    />
                  );
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
