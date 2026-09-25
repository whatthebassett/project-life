// Development only: the sample data from Main.dc.html, so Home can be checked
// against the mockup (and seen whole) before events, habits and notes exist.
// It lives in memory and is never saved; the Components gallery turns it on.
import { addDays, startOfDay, ymd } from "../tasks/dates";
import type { Task } from "../tasks/model";
import type { Headline } from "./news";
import type { HomeEvent, HomeHabit, HomeNote } from "./sources";
import type { Weather } from "./weather";

export interface SampleHeadline extends Headline {
  topic: string;
  sourceName: string;
}

export interface Sample {
  // The mockup's "now": today at 4:18 PM.
  now: Date;
  tasks: Task[];
  events: HomeEvent[];
  habits: HomeHabit[];
  notes: HomeNote[];
  headlines: SampleHeadline[];
  weather: (unit: "C" | "F") => Weather;
}

let state: Sample | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const sample = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  get: (): Sample | null => state,
  on: () => state !== null,
  set(on: boolean) {
    state = on ? build() : null;
    emit();
  },
  updateTasks(change: (tasks: Task[]) => Task[]) {
    if (!state) return;
    state = { ...state, tasks: change(state.tasks) };
    emit();
  },
  toggleHabit(id: string) {
    if (!state) return;
    state = { ...state, habits: state.habits.map((h) => (h.id === id ? { ...h, doneToday: !h.doneToday } : h)) };
    emit();
  },
};

function build(): Sample {
  const today = startOfDay(new Date());
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 16, 18);
  const at = (h: number) => new Date(today.getTime() + h * 3_600_000);
  const day = (n: number) => ymd(addDays(today, n));
  // The coming Saturday, like the mockup's "Book oil change".
  const saturday = (6 - today.getDay() + 7) % 7 || 7;
  const created = now.toISOString();
  const task = (Id: string, Title: string, Due: string, List: string, done: boolean): Task => ({
    Id,
    Title,
    Due,
    DueTime: null,
    Priority: 0,
    List,
    Created: created,
    Completed: done ? created : null,
  });

  const minutesAgo = (m: number) => now.getTime() - m * 60_000;
  const headline = (topic: string, sourceName: string, mins: number, title: string): SampleHeadline => ({
    topic,
    sourceName,
    title,
    link: "https://example.com/",
    published: minutesAgo(mins),
    source: sourceName,
  });

  return {
    now,
    tasks: [
      task("s1", "Renew car registration", day(0), "errands", false),
      task("s2", "Reply to sponsor email", day(0), "stream", false),
      task("s3", "Pick up dry cleaning", day(0), "errands", true),
      task("s4", "Outline onboarding flow", day(1), "checkpoint", false),
      task("s5", "Book oil change", day(saturday), "personal", false),
      task("s6", "Water the plants", day(0), "personal", true),
    ],
    events: [
      { id: "e1", title: "Morning walk", start: at(9.5), end: at(10), calendar: "personal", meta: "30 min · Outside" },
      { id: "e2", title: "Standup", start: at(11), end: at(11.25), calendar: "checkpoint", meta: "15 min · Video call", call: "meet", joinUrl: "https://meet.google.com/" },
      { id: "e3", title: "Deep work: Project Life", start: at(14), end: at(16), calendar: "checkpoint", meta: "2 hr · Focus mode" },
      {
        id: "e4",
        title: "Design review",
        start: at(17),
        end: at(17.75),
        calendar: "checkpoint",
        meta: "Checkpoint theme pass",
        call: "teams",
        joinUrl: "https://teams.microsoft.com/",
        note: "Checkpoint: theme ideas",
      },
      { id: "e5", title: "Dinner + groceries", start: at(19.5), end: at(20.5), calendar: "personal", meta: "1 hr" },
      { id: "e6", title: "Late night stream", start: at(21), end: at(23), calendar: "stream", meta: "2 hr · Live" },
    ],
    habits: [
      { id: "h1", name: "Drink water", streak: 11, past: [true, true, true, true], doneToday: false },
      { id: "h2", name: "Read 20 min", streak: 4, past: [false, true, true, true], doneToday: true },
      { id: "h3", name: "Walk", streak: 22, past: [true, true, true, true], doneToday: true },
    ],
    notes: [
      { id: "n1", title: "Checkpoint: theme ideas", edited: minutesAgo(120), snippet: "Midnight as the base. Aurora, Ember and Daylight as alternates." },
      { id: "n2", title: "Grocery list", edited: minutesAgo(26 * 60), snippet: "Oat milk, coffee beans, limes, rice, frozen dumplings" },
      { id: "n3", title: "Video ideas", edited: minutesAgo(4 * 24 * 60), snippet: "Desk setup tour, keyboard sound test, stream recap" },
    ],
    headlines: [
      headline("Gaming", "PC Gamer", 12, "Fall showcase season: every date you need to know"),
      headline("Tech", "The Verge", 38, "The next Windows 11 update puts widgets front and center"),
      headline("Gaming", "Eurogamer", 60, "The best co-op games to play this weekend"),
      headline("Local", "Cape Cod Times", 120, "Clear skies expected for this weekend’s fall festivals"),
      headline("Tech", "Ars Technica", 180, "Why local-first apps are having a moment"),
      headline("Gaming", "GameSpot", 240, "October’s biggest game releases, week by week"),
    ],
    weather: (unit) => sampleWeather(today, unit),
  };
}

function sampleWeather(today: Date, unit: "C" | "F"): Weather {
  const t = (f: number) => (unit === "F" ? f : ((f - 32) * 5) / 9);
  const d = (n: number, code: number, hi: number, lo: number, rain: number) => ({
    date: ymd(addDays(today, n)),
    code,
    high: t(hi),
    low: t(lo),
    feelsHigh: t(hi),
    rain,
    precipitation: 0,
    wind: 0,
    gusts: 0,
    windFrom: 0,
    uv: null,
    parts: [],
  });
  return {
    unit,
    fetchedAt: Date.now(),
    current: { time: "", temperature: t(66), feelsLike: t(66), code: 2, isDay: true, wind: unit === "F" ? 9 : 14, humidity: 71 },
    days: [d(0, 2, 69, 57, 10), d(1, 0, 71, 56, 0), d(2, 3, 67, 58, 10), d(3, 61, 62, 55, 70)],
  };
}
