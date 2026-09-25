// What Home shows from the parts of Project Life that arrive in later
// phases: events (Phase 5), habits (Phase 6) and notes (Phase 3). Until then
// these are empty, except in the dev-only sample mode (sample.ts).
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
  // The title of a linked note.
  note?: string;
}

export interface HomeHabit {
  id: string;
  name: string;
  // The streak before today.
  streak: number;
  // This week before today, Monday first: done or not.
  past: boolean[];
  doneToday: boolean;
}

export interface HomeNote {
  id: string;
  title: string;
  // Milliseconds since 1970.
  edited: number;
  snippet: string;
}

export const callNames: Record<CallKind, string> = { teams: "Teams", meet: "Meet", zoom: "Zoom" };
