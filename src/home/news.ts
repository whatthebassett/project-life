// News headlines from RSS 2.0, RSS 1.0 (RDF) and Atom feeds. Feeds are
// fetched through Rust (no CORS), parsed with DOMParser, and kept in memory
// for the session so going back to Home is instant.
import { fetchText } from "../lib/api";

export interface Headline {
  title: string;
  link: string;
  // Milliseconds since 1970; 0 when the feed gives no date.
  published: number;
  source: string; // the feed's URL
  // The story's own publication, when the feed gathers several (Google News).
  publisher?: string;
  image?: string;
}

export interface Feed {
  title: string;
  items: Headline[];
}

export interface FeedResult {
  url: string;
  fetchedAt: number;
  feed?: Feed;
  error?: string;
}

// Feeds older than this are fetched again when Home is shown.
export const staleAfter = 30 * 60_000;
// Enough for a day's headlines from even a busy feed.
const perFeed = 40;

const cache = new Map<string, FeedResult>();
const inFlight = new Map<string, Promise<FeedResult>>();

export const cachedFeed = (url: string) => cache.get(url);
export const isFresh = (r: FeedResult | undefined, now = Date.now()) => !!r && now - r.fetchedAt < staleAfter;

export function loadFeed(url: string): Promise<FeedResult> {
  const pending = inFlight.get(url);
  if (pending) return pending;
  const job = fetchText(url)
    .then((text): FeedResult => ({ url, fetchedAt: Date.now(), feed: parseFeed(text, url) }))
    .catch((e): FeedResult => ({ url, fetchedAt: Date.now(), error: message(e) }))
    .then((result) => {
      // A failed refresh keeps the headlines from the last good fetch.
      const previous = cache.get(url);
      const kept = result.error && previous?.feed ? { ...previous, error: result.error, fetchedAt: result.fetchedAt } : result;
      cache.set(url, kept);
      inFlight.delete(url);
      return kept;
    });
  inFlight.set(url, job);
  return job;
}

const message = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Couldn't load this feed.");

// Check an address someone typed: a feed, or a web page that links to one.
// Returns the feed's own address (after discovery) and its title.
export async function probeFeed(input: string): Promise<{ url: string; title: string }> {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    url = new URL(url).toString();
  } catch {
    throw "That isn't a web address.";
  }
  const text = await fetchText(url);
  const direct = tryParse(text, url);
  if (direct) return { url, title: direct.title };
  const found = discoverFeed(text, url);
  if (!found) throw "No RSS or Atom feed was found at that address.";
  const feed = tryParse(await fetchText(found), found);
  if (!feed) throw "No RSS or Atom feed was found at that address.";
  return { url: found, title: feed.title };
}

function tryParse(text: string, url: string): Feed | null {
  try {
    return parseFeed(text, url);
  } catch {
    return null;
  }
}

// <link rel="alternate" type="application/rss+xml" href="…"> on a web page.
function discoverFeed(html: string, base: string): string | null {
  if (!/<html[\s>]/i.test(html)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const link of Array.from(doc.querySelectorAll('link[rel~="alternate"][href]'))) {
    const type = (link.getAttribute("type") ?? "").toLowerCase();
    if (type.includes("rss") || type.includes("atom")) return absolute(link.getAttribute("href")!, base) ?? null;
  }
  return null;
}

// ---------- Parsing ----------

// Named HTML entities feeds sometimes use in XML, where they aren't defined.
const entities: Record<string, string> = {
  nbsp: "#160", ndash: "#8211", mdash: "#8212", hellip: "#8230", lsquo: "#8216", rsquo: "#8217",
  ldquo: "#8220", rdquo: "#8221", copy: "#169", reg: "#174", trade: "#8482", eacute: "#233", euro: "#8364",
};

function parseXml(text: string): Document | null {
  // trim() also drops a byte-order mark, which would break the XML parser.
  const clean = text.trim();
  const parse = (s: string) => {
    const doc = new DOMParser().parseFromString(s, "application/xml");
    return doc.getElementsByTagName("parsererror").length ? null : doc;
  };
  return (
    parse(clean) ??
    parse(clean.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)(\w*;?)/gi, (_, name: string) => {
      const known = entities[name.replace(/;$/, "")];
      return known && name.endsWith(";") ? `&${known};` : `&amp;${name}`;
    }))
  );
}

// Throws when the text isn't a feed.
export function parseFeed(text: string, url: string): Feed {
  const doc = parseXml(text);
  const root = doc?.documentElement;
  if (!doc || !root || !["rss", "RDF", "feed"].includes(root.localName)) throw "That address isn't an RSS or Atom feed.";

  const atom = root.localName === "feed";
  const channel = atom ? root : (child(root, "channel") ?? root);
  const title = plain(text_(child(channel, "title")));
  const entries = Array.from(doc.getElementsByTagNameNS("*", atom ? "entry" : "item"));

  const items: Headline[] = [];
  for (const entry of entries) {
    const publisher = plain(text_(child(entry, "source"))) || undefined;
    let headline = plain(text_(child(entry, "title")));
    // Aggregators end each title with " - Publisher"; the card shows it apart.
    if (publisher && headline.endsWith(` - ${publisher}`)) headline = headline.slice(0, -(publisher.length + 3));
    const link = atom ? atomLink(entry, url) : rssLink(entry, url);
    if (!headline || !link) continue;
    items.push({ title: headline, link, published: dateOf(entry), source: url, publisher, image: imageOf(entry, url) });
    if (items.length >= perFeed) break;
  }
  if (!title && items.length === 0) throw "That feed has no headlines.";
  return { title, items };
}

const children = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name);
const child = (el: Element, name: string): Element | undefined => children(el, name)[0];
const text_ = (el: Element | undefined) => el?.textContent?.trim() ?? "";

// Titles are often escaped HTML ("Q&amp;A", "<b>…</b>"); reduce them to text.
function plain(s: string): string {
  if (!/[<&]/.test(s)) return s.replace(/\s+/g, " ");
  const doc = new DOMParser().parseFromString(s, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

function absolute(href: string, base: string): string | undefined {
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

function rssLink(item: Element, base: string): string | undefined {
  const link = text_(child(item, "link")) || child(item, "link")?.getAttribute("href") || "";
  if (link) return absolute(link, base);
  const guid = child(item, "guid");
  if (guid && guid.getAttribute("isPermaLink") !== "false" && /^https?:/i.test(text_(guid))) return absolute(text_(guid), base);
  return undefined;
}

function atomLink(entry: Element, base: string): string | undefined {
  const links = children(entry, "link");
  const best = links.find((l) => (l.getAttribute("rel") ?? "alternate") === "alternate") ?? links[0];
  const href = best?.getAttribute("href");
  return href ? absolute(href, base) : undefined;
}

// Zone names Date.parse doesn't know (it only knows GMT/UTC and the US ones),
// as they appear at the end of RSS pubDates: "… 14:05:00 CEST".
const zones: Record<string, string> = {
  CET: "+0100", CEST: "+0200", BST: "+0100", IST: "+0530", WET: "+0000", WEST: "+0100", EET: "+0200", EEST: "+0300",
  MSK: "+0300", JST: "+0900", KST: "+0900", HKT: "+0800", SGT: "+0800", AEST: "+1000", AEDT: "+1100", ACST: "+0930",
  AWST: "+0800", NZST: "+1200", NZDT: "+1300",
};

function parseDate(s: string): number {
  const t = Date.parse(s);
  if (!Number.isNaN(t) || !s) return t;
  const zoned = s.trim().replace(/\b([A-Z]{3,4})$/, (z) => zones[z] ?? z);
  return Date.parse(zoned);
}

// A few feeds carry mistyped dates far in the future; since headlines are
// newest first, one of those would sit at the top for months. Anything more
// than a day and a half ahead (time zones, clock drift) counts as undated.
const FUTURE_SLACK = 36 * 3600 * 1000;

function dateOf(entry: Element): number {
  for (const name of ["pubDate", "published", "date", "updated", "issued"]) {
    const t = parseDate(text_(child(entry, name)));
    if (!Number.isNaN(t)) return t > Date.now() + FUTURE_SLACK ? 0 : t;
  }
  return 0;
}

// media:content / media:thumbnail (Media RSS), an image enclosure, or the
// first <img> in the item's HTML.
function imageOf(entry: Element, base: string): string | undefined {
  const media = Array.from(entry.getElementsByTagNameNS("*", "content"))
    .concat(Array.from(entry.getElementsByTagNameNS("*", "thumbnail")))
    .filter((m) => (m.namespaceURI ?? "").includes("search.yahoo.com/mrss") && m.getAttribute("url"))
    .filter((m) => {
      const medium = m.getAttribute("medium");
      const type = m.getAttribute("type");
      return m.localName === "thumbnail" || medium === "image" || type?.startsWith("image/") || (!medium && !type && looksLikeImage(m.getAttribute("url")!));
    });
  // Several sizes are common; the one nearest a small card is plenty.
  const sized = media
    .map((m) => ({ url: m.getAttribute("url")!, width: Number(m.getAttribute("width")) || 0 }))
    .sort((a, b) => Math.abs(a.width - 300) - Math.abs(b.width - 300));
  if (sized.length) return absolute(sized[0].url, base);

  const enclosure = children(entry, "enclosure").find((e) => e.getAttribute("type")?.startsWith("image/") && e.getAttribute("url"));
  if (enclosure) return absolute(enclosure.getAttribute("url")!, base);
  const atomEnclosure = children(entry, "link").find((l) => l.getAttribute("rel") === "enclosure" && l.getAttribute("type")?.startsWith("image/"));
  if (atomEnclosure?.getAttribute("href")) return absolute(atomEnclosure.getAttribute("href")!, base);

  for (const name of ["encoded", "content", "description", "summary"]) {
    for (const tag of text_(child(entry, name)).match(/<img\b[^>]*>/gi) ?? []) {
      // Skip the 1x1 tracking pixels some feeds append to every story.
      if (/\b(width|height)\s*=\s*["']?1["'\s/>]|pixel|tracking/i.test(tag)) continue;
      const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (src) return absolute(src.replace(/&amp;/g, "&"), base);
    }
  }
  return undefined;
}

const looksLikeImage = (url: string) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);

// ---------- Merging ----------

// The newest headlines across sources. With several sources, each gives at
// most `fromEach` so one busy feed can't fill the list; duplicates (the same
// story in two feeds) show once.
export function mergeHeadlines(feeds: Feed[], fromEach: number): Headline[] {
  const seen = new Set<string>();
  const all: Headline[] = [];
  for (const feed of feeds) {
    const newest = [...feed.items].sort((a, b) => b.published - a.published).slice(0, fromEach);
    for (const h of newest) {
      const key = h.link.replace(/#.*$/, "").toLowerCase();
      const titleKey = h.title.toLowerCase();
      if (seen.has(key) || seen.has(titleKey)) continue;
      seen.add(key);
      seen.add(titleKey);
      all.push(h);
    }
  }
  return all.sort((a, b) => b.published - a.published);
}
