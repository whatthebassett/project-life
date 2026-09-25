// Reminders for tasks and events: a Windows notification when one comes due,
// while Project Life is running (in the tray too, with the window closed).
// A call's notification has a Join button. Only the main window checks, so
// each reminder goes off once.
import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { inTauri } from "../lib/api";
import { callNames, joinUrlOf, occurrences } from "../schedule/events";
import { eventStore } from "../schedule/useEvents";
import { shortTime } from "../schedule/look";
import { formatTime, fromYmd } from "./dates";
import { patchTask, type Task } from "./model";
import { taskStore } from "./useTasks";

// A reminder that was missed by more than this (the app was closed) is let go.
const STALE_MS = 12 * 60 * 60_000;
const minutesBefore: Record<string, number> = { at: 0, "10m": 10, "30m": 30, "1h": 60 };

export function reminderAt(t: Task): Date | null {
  if (!t.Reminder || !t.Due || t.Completed) return null;
  const day = fromYmd(t.Due);
  if (t.Reminder === "morning") return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
  if (t.Reminder === "daybefore") return new Date(day.getFullYear(), day.getMonth(), day.getDate() - 1, 9, 0);
  if (!t.DueTime) return null;
  const [h, m] = t.DueTime.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m - minutesBefore[t.Reminder]);
}

async function notify(title: string, body: string, join?: { label: string; url: string }) {
  try {
    if (inTauri) {
      await invoke("show_toast", { title, body, joinLabel: join?.label ?? null, joinUrl: join?.url ?? null });
    } else if ("Notification" in window) {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    }
  } catch (e) {
    console.error("Couldn't show a reminder", e);
  }
}

function checkTasks(now: number) {
  const store = taskStore();
  if (store.unread()) return;
  const due: { task: Task; at: Date }[] = [];
  for (const task of store.getState().file.Tasks) {
    const at = reminderAt(task);
    if (!at || at.getTime() > now || now - at.getTime() > STALE_MS) continue;
    if (task.Reminded && Date.parse(task.Reminded) >= at.getTime()) continue;
    due.push({ task, at });
  }
  if (!due.length) return;
  store.update((ts) => due.reduce((out, { task, at }) => patchTask(out, task.Id, { Reminded: at.toISOString() }), ts));
  const today = new Date().toDateString();
  for (const { task } of due) {
    const day = task.Due ? fromYmd(task.Due) : null;
    const when = task.DueTime ? `Due ${day?.toDateString() === today ? "today" : day?.toLocaleDateString(undefined, { weekday: "long" })} at ${formatTime(task.DueTime)}` : "Due today";
    void notify(task.Title, when);
  }
}

function checkEvents(now: number) {
  const store = eventStore();
  if (store.unread()) return;
  const events = store.getState().file.Events;
  // Reminders reach up to a day ahead, so look that far past now.
  const shows = occurrences(
    events.filter((e) => e.Reminders?.length),
    new Date(now - STALE_MS),
    new Date(now + 25 * 60 * 60_000),
  );
  const fired = new Map<string, number>();
  const toShow: { title: string; body: string; join?: { label: string; url: string } }[] = [];
  for (const o of shows) {
    const e = o.event;
    const last = Math.max(e.Reminded ? Date.parse(e.Reminded) : 0, fired.get(e.Id) ?? 0);
    for (const m of e.Reminders ?? []) {
      const at = o.start.getTime() - m * 60_000;
      if (at > now || now - at > STALE_MS || at <= last) continue;
      fired.set(e.Id, Math.max(fired.get(e.Id) ?? 0, at));
      const minutes = Math.round((o.start.getTime() - now) / 60_000);
      const lead = e.AllDay ? "Today" : minutes <= 0 ? `Now · ${shortTime(o.start)}` : minutes < 60 ? `In ${minutes} min · ${shortTime(o.start)}` : `${o.start.toDateString() === new Date(now).toDateString() ? "Today" : "Tomorrow"} at ${shortTime(o.start)}`;
      const url = e.Call ? joinUrlOf(e) : null;
      toShow.push({ title: e.Title, body: [lead, e.Place].filter(Boolean).join(" · "), join: url && e.Call ? { label: `Join ${callNames[e.Call]}`, url } : undefined });
      break;
    }
  }
  if (!fired.size) return;
  store.change((f) => ({ ...f, Events: f.Events.map((e) => (fired.has(e.Id) ? { ...e, Reminded: new Date(fired.get(e.Id)!).toISOString() } : e)) }));
  for (const t of toShow) void notify(t.title, t.body, t.join);
}

function check() {
  const now = Date.now();
  checkTasks(now);
  checkEvents(now);
}

export function useTaskReminders() {
  useEffect(() => {
    void Promise.all([taskStore().load(), eventStore().load()]).then(check);
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);
}
