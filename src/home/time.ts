import { locale } from "../lib/format";
// Short, glanceable times for the Home screen (ported from Checkpoint).
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

// Recent notes: "just now", "5m ago", "2h ago", "Yesterday", "Mon", then a date.
export function ago(when: number, now: number): string {
  if (!when) return "";
  const diff = Math.max(0, now - when);
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  const then = new Date(when);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (diff < 12 * hour || then >= today) return `${Math.floor(diff / hour)}h ago`;
  if (then >= new Date(today.getTime() - day)) return "Yesterday";
  if (then >= new Date(today.getTime() - 6 * day)) return then.toLocaleDateString(locale(), { weekday: "short" });
  const sameYear = then.getFullYear() === today.getFullYear();
  return then.toLocaleDateString(locale(), { month: "short", day: "numeric", year: sameYear ? undefined : "numeric" });
}

// Headlines: "now", "12m", "3h", "2d".
export function age(when: number, now: number): string {
  if (!when) return "";
  const diff = Math.max(0, now - when);
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  return `${Math.floor(diff / day)}d`;
}
