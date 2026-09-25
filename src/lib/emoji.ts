// Every emoji Windows 11 can draw (Emoji 15), with names, keywords and skin
// tones. The data is ~430 KB, so it loads the first time anything asks for it.

export interface Emoji {
  // The shortcode: "heart_eyes" for :heart_eyes:.
  id: string;
  name: string;
  keywords: string[];
  aliases: string[];
  // Native characters: the default, then the five skin tones when it has them.
  skins: string[];
  category: string;
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: Emoji[];
}

export interface EmojiData {
  emojis: Emoji[];
  categories: EmojiCategory[];
  // Shortcodes and aliases → emoji.
  byCode: Map<string, Emoji>;
  // Any native character (every skin) → emoji.
  byNative: Map<string, Emoji>;
}

interface RawData {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: { native: string }[] }>;
  aliases: Record<string, string>;
}

const categoryNames: Record<string, string> = {
  people: "Smileys & people",
  nature: "Animals & nature",
  foods: "Food & drink",
  activity: "Activities",
  places: "Travel & places",
  objects: "Objects",
  symbols: "Symbols",
  flags: "Flags",
};

let loaded: EmojiData | null = null;
let loading: Promise<EmojiData> | null = null;

function build(raw: RawData): EmojiData {
  const aliasesOf = new Map<string, string[]>();
  for (const [alias, id] of Object.entries(raw.aliases)) aliasesOf.set(id, [...(aliasesOf.get(id) ?? []), alias]);
  const emojis: Emoji[] = [];
  const categories: EmojiCategory[] = raw.categories.map((c) => {
    const list = c.emojis.flatMap((id) => {
      const e = raw.emojis[id];
      if (!e) return [];
      const emoji: Emoji = {
        id: e.id,
        name: e.name,
        keywords: e.keywords,
        aliases: aliasesOf.get(e.id) ?? [],
        skins: e.skins.map((s) => s.native),
        category: c.id,
      };
      emojis.push(emoji);
      return [emoji];
    });
    return { id: c.id, name: categoryNames[c.id] ?? c.id, emojis: list };
  });
  const byCode = new Map<string, Emoji>();
  const byNative = new Map<string, Emoji>();
  for (const e of emojis) {
    byCode.set(e.id, e);
    for (const a of e.aliases) if (!byCode.has(a)) byCode.set(a, e);
    for (const s of e.skins) byNative.set(s, e);
  }
  return { emojis, categories, byCode, byNative };
}

export function loadEmoji(): Promise<EmojiData> {
  loading ??= import("@emoji-mart/data/sets/15/native.json").then((m) => {
    loaded = build((m as unknown as { default: RawData }).default);
    return loaded;
  });
  return loading;
}

// The data if it has already loaded (for the synchronous ":code:" rule).
export const emojiNow = () => loaded;

// An emoji as drawn in text: a pictograph shown in emoji style, with its skin
// tone, joined parts (👩‍💻), flag pairs, keycaps and tag flags. Plain-text
// symbols like © and ™ don't count unless they ask to be emoji (U+FE0F).
// Flag pairs come first: each half is an emoji on its own and would split.
export const emojiPattern =
  /\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:\p{Emoji_Modifier}|️|[\u{E0020}-\u{E007F}]|‍(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️?)\p{Emoji_Modifier}?)*|[#*0-9]️?⃣/gu;

// ----- skin tone and recents -----

let skin = 0;
export const skinTone = () => skin;
export const setSkinTone = (tone: number) => void (skin = Math.min(5, Math.max(0, tone | 0)));

export function nativeOf(e: Emoji, tone = skin): string {
  return e.skins[tone] ?? e.skins[0];
}

let recents: string[] = [];
let saveRecents: ((r: string[]) => void) | null = null;

export function initRecents(list: string[] | undefined, save: (r: string[]) => void) {
  recents = list ?? [];
  saveRecents = save;
}
export const recentEmoji = () => recents;

// Remember an emoji the writer just used, newest first.
export function rememberEmoji(native: string) {
  recents = [native, ...recents.filter((r) => r !== native)].slice(0, 32);
  saveRecents?.(recents);
}

// ----- search -----

// Best matches first: the exact shortcode, then shortcodes, names and
// keywords that start with the query, then ones that merely contain it.
// Recently used emoji win ties.
export function searchEmoji(data: EmojiData, query: string, limit = 60): Emoji[] {
  const q = query.trim().toLowerCase().replace(/^:|:$/g, "").replace(/\s+/g, "_");
  if (!q) return [];
  const words = q.split(/[_-]+/).filter(Boolean);
  const recent = new Map(recents.map((r, i) => [data.byNative.get(r)?.id, i]));
  const scored: { e: Emoji; score: number; order: number }[] = [];
  data.emojis.forEach((e, order) => {
    const name = e.name.toLowerCase();
    const codes = [e.id, ...e.aliases];
    let score: number;
    if (codes.includes(q)) score = 0;
    else if (codes.some((c) => c.startsWith(q))) score = 1;
    else if (name.replace(/\s+/g, "_").startsWith(q)) score = 2;
    else if (e.keywords.includes(q)) score = 3;
    else if (words.every((w) => name.split(/[\s-]+/).some((n) => n.startsWith(w)) || e.keywords.some((k) => k.startsWith(w)))) score = 4;
    else if (codes.some((c) => c.includes(q)) || name.includes(q.replace(/_/g, " "))) score = 5;
    else return;
    scored.push({ e, score, order });
  });
  scored.sort((a, b) => a.score - b.score || (recent.get(a.e.id) ?? 99) - (recent.get(b.e.id) ?? 99) || a.order - b.order);
  return scored.slice(0, limit).map((s) => s.e);
}
