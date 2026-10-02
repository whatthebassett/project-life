// The built-in US Holidays calendar: federal holidays (with the weekday
// they're observed on when they land on a weekend) and the days people mark
// anyway (Valentine's Day, Easter, Halloween, the clock changes). Worked out
// here from the calendar's own rules, so it needs no link and no internet.
// Read-only, like a subscribed calendar; Settings.Holidays turns it off, and
// Settings.HolidayColor recolors it.
import { currentSettings } from "../lib/settings";
import { addDays, ymd } from "../tasks/dates";
import { listColors, setBuiltinCalendars, type ListColor, type TaskList } from "../tasks/lists";
import type { CalEvent } from "./events";

export const HOLIDAYS_CAL = "holidays:us";
// What its events carry in Feed, which makes them read-only.
const FEED = "holidays-us";

interface Holiday {
  date: Date;
  name: string;
  federal: boolean;
}

const SUN = 0, MON = 1, THU = 4, FRI = 5, SAT = 6;

// The nth (1-based) weekday of a month; months are 0-based.
function nth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
}

function last(year: number, month: number, weekday: number): Date {
  const end = new Date(year, month + 1, 0);
  return new Date(year, month, end.getDate() - ((end.getDay() - weekday + 7) % 7));
}

// Easter Sunday (the Gregorian reckoning).
function easter(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Tax Day: April 15, pushed past a weekend and past Emancipation Day in
// Washington, D.C. (April 16, observed on the nearest weekday).
function taxDay(year: number): Date {
  const day = new Date(year, 3, 15).getDay();
  return new Date(year, 3, day === FRI ? 18 : day === SAT ? 18 : day === SUN ? 17 : 15);
}

export function usHolidays(year: number): Holiday[] {
  const out: Holiday[] = [];
  const add = (date: Date, name: string, federal = false) => out.push({ date, name, federal });
  // A federal holiday on a fixed date: on a Saturday the day off is the
  // Friday before, on a Sunday the Monday after.
  const fixed = (month: number, day: number, name: string) => {
    const date = new Date(year, month, day);
    add(date, name, true);
    if (date.getDay() === SAT) add(addDays(date, -1), `${name} (observed)`, true);
    if (date.getDay() === SUN) add(addDays(date, 1), `${name} (observed)`, true);
  };
  const thanksgiving = nth(year, 10, THU, 4);
  const easterDay = easter(year);

  fixed(0, 1, "New Year’s Day");
  add(nth(year, 0, MON, 3), "Martin Luther King Jr. Day", true);
  if (year >= 1937 && year % 4 === 1) add(new Date(year, 0, 20), "Inauguration Day");
  add(new Date(year, 1, 2), "Groundhog Day");
  add(new Date(year, 1, 14), "Valentine’s Day");
  add(nth(year, 1, MON, 3), "Presidents’ Day", true);
  add(addDays(easterDay, -47), "Mardi Gras");
  add(nth(year, 2, SUN, 2), "Daylight saving time starts");
  add(new Date(year, 2, 17), "St. Patrick’s Day");
  add(new Date(year, 3, 1), "April Fools’ Day");
  add(addDays(easterDay, -2), "Good Friday");
  add(easterDay, "Easter Sunday");
  add(taxDay(year), "Tax Day");
  add(new Date(year, 3, 22), "Earth Day");
  add(new Date(year, 4, 5), "Cinco de Mayo");
  add(nth(year, 4, SUN, 2), "Mother’s Day");
  add(last(year, 4, MON), "Memorial Day", true);
  add(new Date(year, 5, 14), "Flag Day");
  if (year >= 2021) fixed(5, 19, "Juneteenth");
  add(nth(year, 5, SUN, 3), "Father’s Day");
  fixed(6, 4, "Independence Day");
  add(nth(year, 8, MON, 1), "Labor Day", true);
  add(new Date(year, 8, 11), "Patriot Day");
  add(nth(year, 9, MON, 2), "Columbus Day / Indigenous Peoples’ Day", true);
  add(new Date(year, 9, 31), "Halloween");
  add(nth(year, 10, SUN, 1), "Daylight saving time ends");
  add(addDays(nth(year, 10, MON, 1), 1), "Election Day");
  fixed(10, 11, "Veterans Day");
  add(thanksgiving, "Thanksgiving", true);
  add(addDays(thanksgiving, 1), "Black Friday");
  add(new Date(year, 11, 24), "Christmas Eve");
  fixed(11, 25, "Christmas Day");
  add(new Date(year, 11, 26), "Kwanzaa begins");
  add(new Date(year, 11, 31), "New Year’s Eve");
  // Next New Year's Day on a Saturday is observed on this year's last day.
  if (new Date(year + 1, 0, 1).getDay() === SAT) add(new Date(year, 11, 31), "New Year’s Day (observed)", true);
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || Number(b.federal) - Number(a.federal));
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// A couple of years back and several ahead of the year it is now.
const BACK = 2;
const AHEAD = 6;
let made: { year: number; events: CalEvent[] } | null = null;

function build(thisYear: number): CalEvent[] {
  const events: CalEvent[] = [];
  for (let year = thisYear - BACK; year <= thisYear + AHEAD; year++) {
    for (const h of usHolidays(year)) {
      const day = ymd(h.date);
      events.push({
        Id: `hol-us-${day}-${slug(h.name)}`,
        Title: h.name,
        Kind: "event",
        Start: `${day}T00:00`,
        End: `${ymd(addDays(h.date, 1))}T00:00`,
        AllDay: true,
        Calendar: HOLIDAYS_CAL,
        Description: h.federal ? "Federal holiday in the United States." : "Observed in the United States (not a federal holiday).",
        Call: null,
        Reminders: [],
        Repeat: null,
        Skip: [],
        Feed: FEED,
        Created: `${year}-01-01T00:00:00.000Z`,
      });
    }
  }
  return events;
}

export const holidaysOn = (): boolean => currentSettings().Holidays !== false;

// The holidays as events, or none when the calendar is turned off.
export function holidayEvents(on = holidaysOn()): CalEvent[] {
  if (!on) return none;
  const year = new Date().getFullYear();
  if (made?.year !== year) made = { year, events: build(year) };
  return made.events;
}
const none: CalEvent[] = [];

export const isHoliday = (e: CalEvent): boolean => e.Feed === FEED;

export function holidayColor(): ListColor {
  const c = currentSettings().HolidayColor;
  return listColors.some((x) => x.id === c) ? (c as ListColor) : "danger";
}

export function holidayCalendar(): TaskList {
  const tone = holidayColor();
  return { id: HOLIDAYS_CAL, name: "US Holidays", color: `var(--${tone})`, tone, inTasks: false };
}

// So its events get a name and color wherever calendars are looked up.
setBuiltinCalendars(() => [holidayCalendar()]);
