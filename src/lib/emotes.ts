import { fetchData } from "./api";

// BetterTTV and 7TV emotes, for notes: the global sets, and the ones on a
// Twitch channel picked in Settings → Notes. In a note an emote is kept as
// :Name: and drawn as its picture (editor/emotes.ts).
//
// The lists come from the two services' public APIs (through fetch_data,
// under Project Life's name). A channel is named by its login; its Twitch id,
// which the services ask for, comes from api.ivr.fi. The last lists are kept
// in the browser's storage, so emotes show at once next time, and refreshed
// in the background.

export type EmoteSource = "BetterTTV" | "7TV";

export interface Emote {
  name: string;
  url: string;
  source: EmoteSource;
  // On the channel picked in Settings, rather than a global one.
  channel: boolean;
  animated: boolean;
}

interface Saved {
  channel: string;
  at: number;
  emotes: Emote[];
  error?: string | null;
}

const KEY = "project-life:emotes";
// A name that can stand as :Name: in a note.
const NAME = /^[A-Za-z0-9_]{2,40}$/;
const STALE = 6 * 60 * 60_000;

let byName = new Map<string, Emote>();
let list: Emote[] = [];
let status: { channel: string; at: number; error: string | null; loading: boolean } = { channel: "", at: 0, error: null, loading: false };
const listeners = new Set<() => void>();

function publish(emotes: Emote[]) {
  list = emotes;
  byName = new Map();
  // The first of a name wins: the channel's 7TV, then its BetterTTV, then the globals.
  for (const e of emotes) if (!byName.has(e.name)) byName.set(e.name, e);
  listeners.forEach((l) => l());
}

// What was loaded last time, straight away.
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
  if (saved?.emotes?.length) {
    status = { channel: saved.channel, at: saved.at, error: saved.error ?? null, loading: false };
    publish(saved.emotes);
  }
} catch {
  // Nothing saved, or storage is off: they load when asked.
}

export const emoteNamed = (name: string): Emote | undefined => byName.get(name);
export const allEmotes = (): Emote[] => [...byName.values()];
export const emoteStatus = () => status;

export function onEmotesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// Emotes whose name has every word of the query in it: names that start with
// it first, then shorter names.
export function searchEmotes(query: string, limit = 40): Emote[] {
  const q = query.trim().replace(/^:|:$/g, "").toLowerCase();
  if (!q) return [];
  return allEmotes()
    .map((e) => ({ e, n: e.name.toLowerCase() }))
    .filter(({ n }) => n.includes(q))
    .sort((a, b) => Number(b.n.startsWith(q)) - Number(a.n.startsWith(q)) || Number(b.e.channel) - Number(a.e.channel) || a.n.length - b.n.length)
    .slice(0, limit)
    .map(({ e }) => e);
}

async function json<T>(url: string): Promise<T> {
  return JSON.parse(await fetchData(url)) as T;
}

interface BttvEmote {
  id: string;
  code: string;
  animated?: boolean;
}

interface SevenEmote {
  name: string;
  data?: { animated?: boolean; host?: { url?: string } };
}

const bttv = (list: BttvEmote[] | undefined, channel: boolean): Emote[] =>
  (list ?? [])
    .filter((e) => NAME.test(e.code))
    .map((e) => ({ name: e.code, url: `https://cdn.betterttv.net/emote/${e.id}/2x`, source: "BetterTTV" as const, channel, animated: Boolean(e.animated) }));

const seven = (list: SevenEmote[] | undefined, channel: boolean): Emote[] =>
  (list ?? [])
    .filter((e) => NAME.test(e.name) && e.data?.host?.url)
    .map((e) => ({ name: e.name, url: `https:${e.data!.host!.url}/2x.webp`, source: "7TV" as const, channel, animated: Boolean(e.data?.animated) }));

// Loads the lists (again, if they're older than a few hours, the channel
// changed, or `force`). A list that won't load is skipped, and said so.
export async function loadEmotes(channelLogin: string | undefined, force = false): Promise<void> {
  const channel = (channelLogin ?? "").trim().replace(/^@/, "").toLowerCase();
  const fresh = status.channel === channel && Date.now() - status.at < STALE && list.length > 0;
  if ((fresh && !force) || status.loading) return;
  status = { ...status, loading: true };
  listeners.forEach((l) => l());
  const problems: string[] = [];
  const attempt = async <T>(what: string, run: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await run();
    } catch {
      problems.push(what);
      return fallback;
    }
  };

  let channelEmotes: Emote[] = [];
  if (channel) {
    const users = await attempt("the Twitch channel", () => json<{ id: string }[]>(`https://api.ivr.fi/v2/twitch/user?login=${encodeURIComponent(channel)}`), []);
    const id = users[0]?.id;
    if (!id && !problems.length) problems.push(`a Twitch channel called “${channel}”`);
    if (id) {
      const [sevenUser, bttvUser] = await Promise.all([
        attempt("the channel's 7TV emotes", () => json<{ emote_set?: { emotes?: SevenEmote[] } }>(`https://7tv.io/v3/users/twitch/${id}`), {}),
        attempt("the channel's BetterTTV emotes", () => json<{ channelEmotes?: BttvEmote[]; sharedEmotes?: BttvEmote[] }>(`https://api.betterttv.net/3/cached/users/twitch/${id}`), {}),
      ]);
      channelEmotes = [...seven(sevenUser.emote_set?.emotes, true), ...bttv([...(bttvUser.channelEmotes ?? []), ...(bttvUser.sharedEmotes ?? [])], true)];
    }
  }
  const [sevenGlobal, bttvGlobal] = await Promise.all([
    attempt("7TV's global emotes", () => json<{ emotes?: SevenEmote[] }>("https://7tv.io/v3/emote-sets/global"), {}),
    attempt("BetterTTV's global emotes", () => json<BttvEmote[]>("https://api.betterttv.net/3/cached/emotes/global"), []),
  ]);
  const emotes = [...channelEmotes, ...seven(sevenGlobal.emotes, false), ...bttv(bttvGlobal, false)];
  const error = problems.length ? `Couldn't find ${problems.join(", ")}.` : null;
  // Nothing at all came back: keep what was there.
  if (emotes.length) publish(emotes);
  status = { channel, at: emotes.length ? Date.now() : status.at, error, loading: false };
  listeners.forEach((l) => l());
  try {
    if (emotes.length) localStorage.setItem(KEY, JSON.stringify({ channel, at: status.at, emotes, error } satisfies Saved));
  } catch {
    // Storage off: they load again next time.
  }
}
