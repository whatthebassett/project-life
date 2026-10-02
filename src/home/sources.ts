// The shapes Home shows events, habits and notes in, filled from their
// stores (useHome.ts) or, in the dev-only sample mode, from sample.ts.
export type CallKind = "teams" | "meet" | "zoom";

export interface HomeEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  // A list/calendar id (tasks/lists.ts).
  calendar: string;
  // "45 min · Video call".
  meta?: string;
  call?: CallKind;
  joinUrl?: string;
  // The title of a linked note, and its file name.
  note?: string;
  noteName?: string;
}

export interface HomeHabit {
  id: string;
  name: string;
  // The streak before today.
  streak: number;
  // This week before today, Monday first: done or not, and which days those are.
  past: boolean[];
  pastDays?: string[];
  doneToday: boolean;
}

export interface HomeNote {
  id: string;
  title: string;
  // Milliseconds since 1970.
  edited: number;
  snippet: string;
  // The note's emoji icon, when it has one.
  icon?: string | null;
}

export const callNames: Record<CallKind, string> = { teams: "Teams", meet: "Meet", zoom: "Zoom" };
