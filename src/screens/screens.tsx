import { dayLabel, useNow, yearProgressLabel } from "../lib/dates";
import { ComingSoon, ScreenFrame } from "./ScreenFrame";

// Empty screens, laid out like their mockups so the rail, panels and headings
// are in place for the phases that fill them.

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
