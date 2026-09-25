import { locale } from "../lib/format";
// Reminders for tasks, events, habits and goal check-ins: a Windows notification when one comes due,
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
import { activeHabits, defaultRules, doneOn, habitDay, isDue, type HabitRules } from "../habits/model";
import { habitStore } from "../habits/useHabits";
import { fmt, paceNote, paceOn, progressOn, statusLabel, statusOf, valueOn as goalValue, type CheckIn } from "../goals/model";
import { goalStore } from "../goals/useGoals";
import { liveStatus } from "../lib/live";
import { currentSettings, type Settings } from "../lib/settings";

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

// Settings → Notifications: what's allowed, quiet hours, the sound, and
// holding everything while a stream is live.
type Kind = "tasks" | "events" | "calls" | "habits" | "goals";
const allowed: Record<Kind, keyof Settings> = { tasks: "NotifyTasks", events: "NotifyEvents", calls: "NotifyCalls", habits: "NotifyHabits", goals: "NotifyGoals" };

interface Pending {
  title: string;
  body: string;
  join?: { label: string; url: string };
}
const held: Pending[] = [];

function quietNow(s: Settings): boolean {
  const h = new Date().getHours();
  if (s.QuietHours === "23-7") return h >= 23 || h < 7;
  if (s.QuietHours === "off") return false;
  // The default: 2 AM to 10 AM.
  return h >= 2 && h < 10;
}

async function show(n: Pending) {
  const s = currentSettings();
  const sound = quietNow(s) ? "none" : (s.Sound ?? "chime");
  try {
    if (inTauri) {
      await invoke("show_toast", { title: n.title, body: n.body, joinLabel: n.join?.label ?? null, joinUrl: n.join?.url ?? null, sound });
    } else if ("Notification" in window) {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(n.title, { body: n.body, silent: sound === "none" });
    }
  } catch (e) {
    console.error("Couldn't show a reminder", e);
  }
}

async function notify(kind: Kind, title: string, body: string, join?: { label: string; url: string }) {
  const s = currentSettings();
  if (s[allowed[kind]] === false) return;
  const n = { title, body, join };
  if (s.QuietWhileLive !== false && (await liveStatus()).live) {
    held.push(n);
    return;
  }
  await show(n);
}

// Held while live: out once the stream ends (the last few, then a count).
async function releaseHeld() {
  if (!held.length || (currentSettings().QuietWhileLive !== false && (await liveStatus()).live)) return;
  const all = held.splice(0);
  for (const n of all.slice(-4)) await show(n);
  if (all.length > 4) await show({ title: "While you were live", body: `${all.length - 4} more reminders came in. They're in Tasks and Schedule.` });
}

// A test from Settings → Notifications → Sound.
export function testNotification() {
  void show({ title: "Project Life", body: "This is how reminders look and sound." });
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
    const when = task.DueTime ? `Due ${day?.toDateString() === today ? "today" : day?.toLocaleDateString(locale(), { weekday: "long" })} at ${formatTime(task.DueTime)}` : "Due today";
    void notify("tasks", task.Title, when);
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
  for (const t of toShow) void notify("events", t.title, t.body, t.join);
}

// Habits: at their reminder time (or every 2 hours, 9 AM to 9 PM) on days
// they're due, until they're done.
function checkHabits(now: number) {
  const store = habitStore();
  if (store.unread()) return;
  const rules = rulesNow();
  const today = habitDay(new Date(now), rules);
  const base = fromYmd(today);
  const fired = new Map<string, number>();
  const toShow: { title: string; body: string }[] = [];
  for (const h of activeHabits(store.getState().file.Habits)) {
    if (!h.Reminder.On || !isDue(h, today) || doneOn(h, today)) continue;
    const hours = h.Reminder.At === "every2" ? [9, 11, 13, 15, 17, 19, 21] : [Number(h.Reminder.At.slice(0, 2))];
    const due = hours.map((hr) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), hr, 0).getTime()).filter((t) => t <= now && now - t < 2 * 3_600_000);
    const at = Math.max(...due, 0);
    if (!at || (h.Reminded && Date.parse(h.Reminded) >= at)) continue;
    fired.set(h.Id, at);
    const left = h.Kind === "check" ? "Not checked off yet today" : `${h.Log[today] ?? 0} of ${h.Target} ${h.Unit} so far today`;
    toShow.push({ title: h.Name, body: left });
  }
  if (!fired.size) return;
  store.change((f) => ({ ...f, Habits: f.Habits.map((h) => (fired.has(h.Id) ? { ...h, Reminded: new Date(fired.get(h.Id)!).toISOString() } : h)) }));
  for (const t of toShow) void notify("habits", t.title, t.body);
}

// Goals: the weekly (or monthly) check-in: Sunday 6 PM, Monday 9 AM, or the
// first of the month at 9 AM.
function checkGoals(now: number) {
  const store = goalStore();
  const habits = habitStore();
  if (store.unread()) return;
  const d = new Date(now);
  const at = (kind: CheckIn): number => {
    if (kind === "month") return new Date(d.getFullYear(), d.getMonth(), 1, 9, 0).getTime();
    const target = kind === "sun" ? 0 : 1;
    const back = (d.getDay() - target + 7) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back, kind === "sun" ? 18 : 9, 0).getTime();
  };
  const today = habitDay(d, rulesNow());
  const fired = new Map<string, number>();
  const toShow: { title: string; body: string }[] = [];
  for (const g of store.getState().file.Goals) {
    if (g.CheckIn === "none") continue;
    const when = at(g.CheckIn);
    if (when > now || now - when > STALE_MS || (g.CheckedIn && Date.parse(g.CheckedIn) >= when)) continue;
    const hs = habits.getState().file.Habits;
    const pct = progressOn(g, hs, today);
    if (pct >= 100) continue;
    fired.set(g.Id, when);
    const body =
      g.Kind === "number"
        ? `${fmt(goalValue(g, hs, today))} of ${fmt(g.Target)} ${g.Unit}. ${paceNote(g, hs, today)}`
        : g.Kind === "milestones"
          ? `${g.Milestones.filter((m) => m.Done).length} of ${g.Milestones.length} milestones.${g.Milestones.find((m) => !m.Done) ? ` Next: ${g.Milestones.find((m) => !m.Done)!.Text}.` : ""}`
          : `${statusLabel[statusOf(pct, paceOn(g, today))]} · due ${fromYmd(g.Due).toLocaleDateString(locale(), { month: "short", day: "numeric" })}`;
    toShow.push({ title: `How's “${g.Title}” going?`, body });
  }
  if (!fired.size) return;
  store.change((f) => ({ ...f, Goals: f.Goals.map((g) => (fired.has(g.Id) ? { ...g, CheckedIn: new Date(fired.get(g.Id)!).toISOString() } : g)) }));
  for (const t of toShow) void notify("goals", t.title, t.body);
}

// Settings as last loaded (the reminders run outside React).
let rulesNow = () => defaultRules;
export function setReminderRules(get: () => HabitRules) {
  rulesNow = get;
}

// Calls about to start: a notification with Join a minute before, apart
// from the event's own reminders.
const callsShown = new Set<string>();
function checkCalls(now: number) {
  const store = eventStore();
  if (store.unread()) return;
  const soon = occurrences(
    store.getState().file.Events.filter((e) => e.Call),
    new Date(now),
    new Date(now + 2 * 60_000),
  );
  for (const o of soon) {
    const lead = o.start.getTime() - now;
    if (lead <= 0 || lead > 90_000 || callsShown.has(o.key)) continue;
    const url = joinUrlOf(o.event);
    if (!url || !o.event.Call) continue;
    callsShown.add(o.key);
    void notify("calls", `${o.event.Title} is starting`, `${callNames[o.event.Call]} call at ${shortTime(o.start)}`, { label: `Join ${callNames[o.event.Call]}`, url });
  }
}

function check() {
  const now = Date.now();
  checkTasks(now);
  checkEvents(now);
  checkHabits(now);
  checkGoals(now);
  checkCalls(now);
  void releaseHeld();
}

export function useTaskReminders() {
  useEffect(() => {
    void Promise.all([taskStore().load(), eventStore().load(), habitStore().load(), goalStore().load()]).then(check);
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);
}
