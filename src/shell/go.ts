// Moving between screens from anywhere (a goal's linked habit opens Habits).
// App registers how; screens pick up what they were asked to show.
import type { Screen } from "./nav";

let navigate: ((s: Screen) => void) | null = null;
let habit: string | null = null;
let goal: string | null = null;

export function onNavigate(fn: (s: Screen) => void) {
  navigate = fn;
}

export function go(screen: Screen) {
  navigate?.(screen);
}

export function showHabit(id: string) {
  habit = id;
  go("habits");
}

// Read on mount, cleared once mounted (React may render twice first).
export const peekHabit = () => habit;
export function clearHabit() {
  habit = null;
}

export function showGoal(id: string) {
  goal = id;
  go("goals");
}

export const peekGoal = () => goal;
export function clearGoal() {
  goal = null;
}
