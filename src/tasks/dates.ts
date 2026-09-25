// Dates for the task manager. Due dates are your own calendar days,
// stored as "YYYY-MM-DD" (no time zone, so a task due Friday stays due Friday
// wherever the laptop travels); an optional time is "HH:MM", 24-hour.

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local midnight of a "YYYY-MM-DD" day.
export function fromYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isYmd(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Calendar arithmetic through the Date constructor, which rolls months and
// years over and never lands on the wrong day across a DST change.
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addMonths(d: Date, n: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

// Whole days from a to b (positive when b is later).
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function nowTime(now: Date): string {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// The Monday after today (tomorrow, on a Sunday).
export function nextMonday(today: Date): Date {
  return addDays(today, (8 - today.getDay()) % 7 || 7);
}

// The coming weekend's Saturday. Typed ("this weekend") on a Saturday or
// Sunday it is that same day; as a delay it must move the task later, so
// Saturday goes to Sunday and Sunday to next Saturday.
export function weekend(today: Date, later: boolean): Date {
  const day = today.getDay();
  if (day === 6) return later ? addDays(today, 1) : today;
  if (day === 0) return later ? addDays(today, 6) : today;
  return addDays(today, 6 - day);
}

// "5pm", "5:30 pm", "17:30", "noon" → "HH:MM".
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, "");
  if (t === "noon") return "12:00";
  let m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)$/.exec(t);
  if (m) {
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    if (h < 1 || h > 12 || min > 59) return null;
    const hour = (h % 12) + (m[3].startsWith("p") ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m && Number(m[1]) < 24 && Number(m[2]) < 60) return `${m[1].padStart(2, "0")}:${m[2]}`;
  return null;
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "Sat, Sep 26" (and the year, when it isn't this one).
export function formatDate(due: string, today: Date): string {
  const d = fromYmd(due);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

// How a due date reads in the list: near days by name, the rest as dates.
export function formatDue(due: string, time: string | null | undefined, today: Date): string {
  const diff = daysBetween(ymd(today), due);
  let day: string;
  if (diff === 0) day = "Today";
  else if (diff === 1) day = "Tomorrow";
  else if (diff === -1) day = "Yesterday";
  else if (diff > 1 && diff < 7) day = fromYmd(due).toLocaleDateString(undefined, { weekday: "short" });
  else {
    const d = fromYmd(due);
    day = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  }
  return time ? `${day} ${formatTime(time)}` : day;
}

// ----- quick-add parsing -----

const weekdays: [RegExp, number][] = [
  [/^sun(day)?$/, 0],
  [/^mon(day)?$/, 1],
  [/^tue(s|sday)?$/, 2],
  [/^wed(s|nesday)?$/, 3],
  [/^thu(r|rs|rsday)?$/, 4],
  [/^fri(day)?$/, 5],
  [/^sat(urday)?$/, 6],
];
const WEEKDAY = "sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:s|nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?";
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const counts: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

const weekdayOf = (word: string) => weekdays.find(([re]) => re.test(word))?.[1] ?? 0;
const monthOf = (word: string) => months.indexOf(word.slice(0, 3));

// Whether this locale writes 3/4 as the 3rd of April rather than March 4th.
function dayFirst(): boolean {
  const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "numeric" }).formatToParts(new Date(2000, 2, 4));
  return parts.findIndex((p) => p.type === "day") < parts.findIndex((p) => p.type === "month");
}

// A real calendar day, or null for things like Feb 30. Without a year it's
// the next one to come: a day already gone this year means next year's, and
// Feb 29 the next leap year's.
function calendarDay(year: number | null, month: number, day: number, today: Date): Date | null {
  const real = (y: number) => {
    const d = new Date(y, month, day);
    return d.getMonth() === month && d.getDate() === day ? d : null;
  };
  if (year !== null) return real(year);
  for (let y = today.getFullYear(); y <= today.getFullYear() + 8; y++) {
    const d = real(y);
    if (d && d >= today) return d;
  }
  return null;
}

const fullYear = (y: string | undefined) => (y === undefined ? null : y.length === 2 ? 2000 + Number(y) : Number(y));

type DateRule = [pattern: string, toDate: (m: RegExpExecArray, today: Date) => Date | null];

const dateRules: DateRule[] = [
  ["today|tonight", (_, t) => t],
  ["tomorrow|tomorow|tmrw|tmr", (_, t) => addDays(t, 1)],
  ["next\\s+week", (_, t) => nextMonday(t)],
  ["(?:this\\s+)?weekend", (_, t) => weekend(t, false)],
  [
    `(next|this)?\\s*(${WEEKDAY})`,
    (m, t) => {
      const target = weekdayOf(m[2].toLowerCase());
      const ahead = (target - t.getDay() + 7) % 7;
      // "next fri" is Friday of next week (weeks start on Monday);
      // "this fri" can be today; plain "fri" is the next one to come.
      if (m[1]?.toLowerCase() === "next") return addDays(nextMonday(t), (target + 6) % 7);
      if (m[1]) return addDays(t, ahead);
      return addDays(t, ahead || 7);
    },
  ],
  [
    "in\\s+(\\d{1,3}|an?|one|two|three|four|five|six|seven)\\s+(days?|weeks?|months?)",
    (m, t) => {
      const n = counts[m[1].toLowerCase()] ?? Number(m[1]);
      const unit = m[2].toLowerCase();
      return unit.startsWith("month") ? addMonths(t, n) : addDays(t, unit.startsWith("week") ? n * 7 : n);
    },
  ],
  ["(\\d{4})-(\\d{1,2})-(\\d{1,2})", (m, t) => calendarDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]), t)],
  [
    "(\\d{1,2})[/.](\\d{1,2})(?:[/.](\\d{4}|\\d{2}))?\\.?",
    (m, t) => {
      // A dot only separates dates where people write them day-first (30.9.),
      // so "v1.5" stays a version number elsewhere.
      const first = dayFirst();
      if (m[0].includes(".") && !first) return null;
      const [a, b] = [Number(m[1]), Number(m[2])];
      return first ? calendarDay(fullYear(m[3]), b - 1, a, t) : calendarDay(fullYear(m[3]), a - 1, b, t);
    },
  ],
  [
    `(${MONTH})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`,
    (m, t) => calendarDay(fullYear(m[3]), monthOf(m[1].toLowerCase()), Number(m[2]), t),
  ],
  [
    `(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH})\\.?(?:,?\\s+(\\d{4}))?`,
    (m, t) => calendarDay(fullYear(m[3]), monthOf(m[2].toLowerCase()), Number(m[1]), t),
  ],
];

// Each rule must end the text, after a space (or be all of it), optionally
// introduced by "on", "by" or "due".
const dateMatchers = dateRules.map(([p, f]) => [new RegExp(`(?:^|\\s)(?:(?:due|on|by)\\s+)?(?:${p})\\s*$`, "i"), f] as const);
// "5pm", "5 pm", "5p", "5:30pm", "17:30", "noon"; a lone "a"/"p" must touch the number.
const timeMatcher = /(?:^|\s)(?:(?:at|@|by)\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)|\d{1,2}(?::\d{2})?[ap]|\d{1,2}:\d{2}|noon)\s*$/i;

export interface QuickParse {
  title: string;
  due: string | null;
  time: string | null;
  // The words that were read as the date, as typed, for the chip's tooltip.
  phrase: string | null;
}

// "Pay rent fri", "Call Sam tomorrow at 3pm", "Dentist 10/14 9:30" → the
// title and the due date and time at its end. Nothing is taken when it would
// leave the title empty.
export function parseQuick(text: string, now: Date): QuickParse {
  const today = startOfDay(now);
  const none: QuickParse = { title: text.trim(), due: null, time: null, phrase: null };
  let rest = text.trim();
  let due: Date | null = null;
  let time: string | null = null;
  const taken: string[] = [];
  for (let pass = 0; pass < 2; pass++) {
    if (!time) {
      const m = timeMatcher.exec(rest);
      const parsed = m && parseTime(m[1]);
      if (m && parsed) {
        time = parsed;
        taken.unshift(m[0].trim());
        rest = rest.slice(0, m.index).trimEnd();
        continue;
      }
    }
    if (!due) {
      let found = false;
      for (const [re, toDate] of dateMatchers) {
        const m = re.exec(rest);
        const d = m && toDate(m, today);
        if (m && d) {
          due = d;
          taken.unshift(m[0].trim());
          rest = rest.slice(0, m.index).trimEnd();
          found = true;
          break;
        }
      }
      if (found) continue;
    }
    break;
  }
  if (!taken.length || !rest) return none;
  // A time alone means today, or tomorrow once that time has passed.
  if (!due) due = time! <= nowTime(now) ? addDays(today, 1) : today;
  return { title: rest, due: ymd(due), time, phrase: taken.join(" ") };
}

// ----- delaying -----

export interface DelayChoice {
  id: "later" | "tomorrow" | "weekend" | "nextweek" | "dayLater" | "weekLater";
  label: string;
  due: string;
  time: string | null;
}

// Where Delay can move a task: always later than it's due now. A task due in
// the future moves on from its own date; one due today, overdue or undated
// moves on from today. It keeps its time of day. "Later today" is for timed
// tasks, three hours on (on the hour) while that's still today and still
// after the task's own time.
export function delayChoices(due: string | null | undefined, time: string | null | undefined, now: Date): DelayChoice[] {
  const today = startOfDay(now);
  const keep = time ?? null;
  const current = isYmd(due) ? fromYmd(due) : null;
  if (current && current > today) {
    return [
      { id: "dayLater", label: "A day later", due: ymd(addDays(current, 1)), time: keep },
      { id: "weekLater", label: "A week later", due: ymd(addDays(current, 7)), time: keep },
    ];
  }
  const choices: DelayChoice[] = [];
  if (time) {
    const later = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 3 + (now.getMinutes() > 0 ? 1 : 0));
    const dueToday = current !== null && ymd(current) === ymd(today);
    if (ymd(later) === ymd(today) && (!dueToday || nowTime(later) > time)) {
      choices.push({ id: "later", label: "Later today", due: ymd(today), time: nowTime(later) });
    }
  }
  choices.push({ id: "tomorrow", label: "Tomorrow", due: ymd(addDays(today, 1)), time: keep });
  choices.push({ id: "weekend", label: today.getDay() === 0 ? "Next weekend" : "This weekend", due: ymd(weekend(today, true)), time: keep });
  choices.push({ id: "nextweek", label: "Next week", due: ymd(nextMonday(today)), time: keep });
  return choices;
}
