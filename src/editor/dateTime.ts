import { Node } from "@tiptap/core";
import { daysBetween, formatTime, fromYmd, isTime, isYmd, nowTime, ymd } from "../tasks/dates";

// A date, and optionally a time, as a chip in the text. It's saved as
//   <time datetime="2026-09-24T14:30">Thu, Sep 24, 2026, 2:30 PM</time>
// so other Markdown apps show the readable part and Checkpoint reads it back.

export interface DateTimeAttrs {
  date: string;
  time: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    dateTime: {
      insertDateTime: (attrs: DateTimeAttrs) => ReturnType;
    };
  }
}

export function nowAttrs(withTime: boolean): DateTimeAttrs {
  const now = new Date();
  return { date: ymd(now), time: withTime ? nowTime(now) : null };
}

const stamp = ({ date, time }: DateTimeAttrs) => (time ? `${date}T${time}` : date);

function parseStamp(value: string | null): DateTimeAttrs | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/.exec(value ?? "");
  if (!m || !isYmd(m[1])) return null;
  return { date: m[1], time: m[2] && isTime(m[2]) ? m[2] : null };
}

// What's written into the file: the full date, so it reads the same next year.
function fullLabel({ date, time }: DateTimeAttrs): string {
  const day = fromYmd(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return time ? `${day}, ${formatTime(time)}` : day;
}

// What the chip shows: the year only when it isn't this one.
export function chipLabel({ date, time }: DateTimeAttrs): string {
  const d = fromYmd(date);
  const day = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  return time ? `${day}, ${formatTime(time)}` : day;
}

// Past, today or still to come, for the chip's color.
function when({ date }: DateTimeAttrs): "past" | "today" | "future" {
  const diff = daysBetween(ymd(new Date()), date);
  return diff < 0 ? "past" : diff === 0 ? "today" : "future";
}

export const DateTime = Node.create({
  name: "dateTime",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      date: { default: ymd(new Date()) },
      time: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "time[datetime]", getAttrs: (el) => parseStamp((el as HTMLElement).getAttribute("datetime")) ?? false }];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as DateTimeAttrs;
    return [
      "time",
      { datetime: stamp(attrs), class: "date-chip", "data-when": when(attrs), title: `${fullLabel(attrs)}. Click to change.` },
      chipLabel(attrs),
    ];
  },

  renderText({ node }) {
    return fullLabel(node.attrs as DateTimeAttrs);
  },

  addCommands() {
    return {
      insertDateTime:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs }, { type: "text", text: " " }]),
    };
  },

  markdownTokenName: "dateTime",
  markdownTokenizer: {
    name: "dateTime",
    level: "inline",
    start: (src: string) => src.search(/<time\s/i),
    tokenize: (src) => {
      const m = /^<time\s+datetime="([^"]+)"[^>]*>[^<]*<\/time>/i.exec(src);
      const attrs = m && parseStamp(m[1]);
      if (!m || !attrs) return;
      return { type: "dateTime", raw: m[0], ...attrs };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("dateTime", { date: token.date, time: token.time ?? null }),
  renderMarkdown: (node) => {
    const attrs = node.attrs as DateTimeAttrs;
    return `<time datetime="${stamp(attrs)}">${fullLabel(attrs)}</time>`;
  },
});
