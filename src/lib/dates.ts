import { useEffect, useState } from "react";

// The current time, updated on the minute, for greetings and date labels.
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      setNow(new Date());
      timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}

// "FRIDAY, SEPTEMBER 25"
export function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();
}

// "4:18 PM"
export function timeLabel(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Home's greeting. The mockup says "Good evening" at 4:18 PM, so evening starts at 4.
export function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 16) return "Good afternoon";
  return "Good evening";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

const DAY = 86_400_000;

// Monday-first weeks, like the Schedule mockup: "Sep 21 – 27".
export function weekRangeLabel(d: Date): string {
  const monday = new Date(startOfDay(d).getTime() - ((d.getDay() + 6) % 7) * DAY);
  const sunday = new Date(monday.getTime() + 6 * DAY);
  const month = (x: Date) => x.toLocaleDateString("en-US", { month: "short" });
  const end = monday.getMonth() === sunday.getMonth() ? String(sunday.getDate()) : `${month(sunday)} ${sunday.getDate()}`;
  return `${month(monday)} ${monday.getDate()} – ${end}`;
}

// ISO 8601 week number: "WEEK 39 · 2026".
export function isoWeek(d: Date): { week: number; year: number } {
  // Move to the Thursday of this week; its year is the week's year.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

// Goals' header: "Q3 ENDS IN 5 DAYS · 97 DAYS LEFT IN 2026".
export function yearProgressLabel(d: Date): string {
  const today = startOfDay(d);
  const q = Math.floor(d.getMonth() / 3);
  const quarterEnd = new Date(d.getFullYear(), q * 3 + 3, 0);
  const yearEnd = new Date(d.getFullYear(), 11, 31);
  const toQ = Math.round((quarterEnd.getTime() - today.getTime()) / DAY);
  const toY = Math.round((yearEnd.getTime() - today.getTime()) / DAY);
  const days = (n: number) => `${n} ${n === 1 ? "DAY" : "DAYS"}`;
  return `Q${q + 1} ENDS IN ${days(toQ)} · ${days(toY)} LEFT IN ${d.getFullYear()}`;
}
