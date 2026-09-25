// Dates and times the way Settings → General says: English (US) or (UK), 12-
// or 24-hour time, the date format, and the day weeks start on. Everything
// that shows a date or time goes through here.
import { currentSettings } from "./settings";

export const locale = (): string => currentSettings().Language ?? "en-US";
export const hour12 = (): boolean => currentSettings().Clock !== "24";
export const weekStartsMonday = (): boolean => currentSettings().WeekStart !== "sunday";

// "5:30 PM" / "17:30".
export function clockText(d: Date): string {
  return d.toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit", hour12: hour12() });
}

// "5 PM" / "17:00": on the hour, the minutes go (12-hour only).
export function clockShort(d: Date): string {
  const text = clockText(d);
  return hour12() ? text.replace(/:00(?=\s)/, "") : text;
}

// A date on its own, in the chosen format: "Fri, Sep 25" (the year when it
// isn't this one), "25 Sep 2026", or "2026-09-25".
export function dateText(d: Date, today = new Date(), format?: "short" | "dmy" | "iso"): string {
  const f = format ?? currentSettings().DateFormat ?? "short";
  if (f === "iso") return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (f === "dmy") return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return d.toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

// 0 for Monday-first weeks, 6 for Sunday-first: how far a day sits from the
// start of its week.
export function dayOfWeek(d: Date): number {
  return weekStartsMonday() ? (d.getDay() + 6) % 7 : d.getDay();
}

// "M T W T F S S" or "S M T W T F S".
export function weekLetters(): string[] {
  return weekStartsMonday() ? ["M", "T", "W", "T", "F", "S", "S"] : ["S", "M", "T", "W", "T", "F", "S"];
}
