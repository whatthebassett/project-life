// What the right panel and status bar show about a note, read from its
// Markdown: the headings (On this page), words, and to-dos done.
export interface Heading {
  level: number;
  text: string;
}

// Markdown marks and HTML tags out of a line, for plain words.
const plain = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`|]+/g, "")
    .trim();

// Headings outside code blocks, in order.
export function headingsOf(body: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: plain(m[2]) || "Untitled heading" });
  }
  return out;
}

// Checkpoint's count: whitespace-separated words in the body.
export function wordCount(body: string): number {
  const t = body.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function todoCount(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const m of body.matchAll(/^\s*[-*+]\s+\[([ xX])\]/gm)) {
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}
