import { dayLabel, isoWeek, useNow, weekRangeLabel, yearProgressLabel } from "../lib/dates";
import { ComingSoon, ScreenFrame } from "./ScreenFrame";

// Empty screens for Phase 1, laid out like their mockups so the rail, panels
// and headings are in place for the phases that fill them.

export function Notes() {
  return (
    <ScreenFrame title="Notes" listWidth={284} detailsWidth={284}>
      <ComingSoon phase={3} what="Your notebooks, tabs and the editor" />
    </ScreenFrame>
  );
}

export function Schedule() {
  const now = useNow();
  const { week, year } = isoWeek(now);
  return (
    <ScreenFrame title="Schedule" listWidth={300} eyebrow={`WEEK ${week} · ${year}`} heading={weekRangeLabel(now)}>
      <ComingSoon phase={5} what="The week and month views, with quick add" />
    </ScreenFrame>
  );
}

export function Tasks() {
  const now = useNow();
  return (
    <ScreenFrame title="Tasks" listWidth={256} eyebrow={dayLabel(now)} heading="Today" detailsWidth={340}>
      <ComingSoon phase={4} what="Your tasks, grouped by date or list" />
    </ScreenFrame>
  );
}

export function Habits() {
  const now = useNow();
  return (
    <ScreenFrame title="Habits" listWidth={256} eyebrow={dayLabel(now)} heading="Today" detailsWidth={340}>
      <ComingSoon phase={6} what="Today's habits, streaks and the 12-week grid" />
    </ScreenFrame>
  );
}

export function Goals() {
  const now = useNow();
  return (
    <ScreenFrame title="Goals" listWidth={256} eyebrow={yearProgressLabel(now)} heading="Your goals" detailsWidth={340}>
      <ComingSoon phase={6} what="Goal cards with pace and progress" />
    </ScreenFrame>
  );
}
