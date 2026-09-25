// Asking for something in Schedule from elsewhere: Home or a note opens an
// event, Ctrl+E starts a new one. App shows the Schedule screen; the screen
// picks the request up when it's ready.
export type ScheduleRequest = { kind: "open"; id: string; day?: string } | { kind: "new" };

let pending: ScheduleRequest | null = null;
let show: (() => void) | null = null;
const listeners = new Set<() => void>();

export function onShowSchedule(fn: () => void) {
  show = fn;
}

export function requestSchedule(req: ScheduleRequest) {
  pending = req;
  show?.();
  listeners.forEach((l) => l());
}

export function takeScheduleRequest(): ScheduleRequest | null {
  const r = pending;
  pending = null;
  return r;
}

export function subscribeScheduleRequests(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
