// Asking for something in Tasks from elsewhere: Home opens a task or a list,
// a note's to-do chip opens its task, Ctrl+Shift+T starts a new one. App
// shows the Tasks screen; the screen picks the request up when it's ready.
export type TaskRequest = { kind: "open"; id: string; popup?: boolean } | { kind: "list"; id: string } | { kind: "new" };

let pending: TaskRequest | null = null;
let show: (() => void) | null = null;
const listeners = new Set<() => void>();

export function onShowTasks(fn: () => void) {
  show = fn;
}

export function requestTasks(req: TaskRequest) {
  pending = req;
  show?.();
  listeners.forEach((l) => l());
}

export function takeTaskRequest(): TaskRequest | null {
  const r = pending;
  pending = null;
  return r;
}

export function subscribeTaskRequests(l: () => void) {
  listeners.add(l);
  return () => void listeners.delete(l);
}
