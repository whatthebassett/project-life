import { EyeOff, Filter, Link2, ListFilter, Newspaper, SquareArrowOutUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { previewFor } from "../editor/linkPreviews";
import { api, openUrl } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import { Chip } from "../ui/Chip";
import { toast } from "../ui/Toast";
import { LOCAL, localFeedUrl, topics } from "./feeds";
import { cachedFeed, isFresh, loadFeed, mergeHeadlines, staleAfter, type Feed, type FeedResult } from "./news";
import { copyLink } from "./menus";
import NewsSourcesPopup from "./NewsSourcesPopup";
import { Card, CardLink, Empty, useRowMenu } from "./parts";
import { newsSources, newsTopic, weatherPlace, type NewsSource } from "./prefs";
import { age } from "./time";
import type { HomeData } from "./useHome";

// The color a topic's initials and label take.
function topicColor(topic: string): string {
  if (topic === "Gaming") return "var(--accent)";
  if (topic === "Tech") return "var(--accent2)";
  if (topic === "Local") return "var(--warn)";
  return "var(--muted)";
}

// "PC Gamer" → "PG", "GameSpot" → "GS", "IGN" → "IG".
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const caps = name.match(/[A-Z]/g);
  return (caps && caps.length > 1 ? caps.join("") : name).slice(0, 2).toUpperCase();
}

interface Shown {
  key: string;
  title: string;
  link: string;
  topic: string;
  source: string;
  published: number;
  // The story's picture, from the feed.
  image?: string;
  // The chosen source it came from (not for sample headlines).
  from?: NewsSource;
}

// Headlines from the chosen sources, newest first, filtered by topic.
export default function NewsCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const [managing, setManaging] = useState(false);
  const openMenu = useRowMenu("news", "News");
  // Settings objects are replaced on every change, so these only change when
  // the sources or the place do.
  const sources = useMemo(() => newsSources(settings), [settings.NewsSources]);
  const place = useMemo(() => weatherPlace(settings), [settings.WeatherLocation]);

  // Each source's feed address (Local depends on the weather's place).
  const feeds = useMemo(
    () =>
      sources.flatMap((s): { source: NewsSource; url: string }[] => {
        if (s.Url !== LOCAL) return [{ source: s, url: s.Url }];
        return place ? [{ source: s, url: localFeedUrl(place) }] : [];
      }),
    [sources, place],
  );

  const [results, setResults] = useState<Record<string, FeedResult | undefined>>(() => Object.fromEntries(feeds.map((f) => [f.url, cachedFeed(f.url)])));

  useEffect(() => {
    if (home.sample) return;
    let alive = true;
    const refresh = () => {
      for (const { url } of feeds) {
        if (isFresh(cachedFeed(url))) {
          setResults((r) => ({ ...r, [url]: cachedFeed(url) }));
          continue;
        }
        void loadFeed(url).then((res) => alive && setResults((r) => ({ ...r, [url]: res })));
      }
    };
    refresh();
    const timer = window.setInterval(refresh, staleAfter);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [feeds, home.sample]);

  const available = home.sample ? ["Gaming", "Tech", "Local"] : topics.filter((t) => sources.some((s) => s.Topic === t));
  const chosen = newsTopic(settings);
  const topic = available.includes(chosen) ? chosen : "All";

  let shown: Shown[];
  if (home.sample) {
    shown = home.sample.headlines
      .filter((h) => topic === "All" || h.topic === topic)
      .map((h, i) => ({ key: String(i), title: h.title, link: h.link, topic: h.topic, source: h.sourceName, published: h.published }));
  } else {
    const inTopic = feeds.filter((f) => topic === "All" || f.source.Topic === topic);
    const loaded = inTopic.flatMap((f) => (results[f.url]?.feed ? [results[f.url]!.feed as Feed] : []));
    const byUrl = new Map(inTopic.map((f) => [f.url, f.source]));
    shown = mergeHeadlines(loaded, 6).map((h) => {
      const s = byUrl.get(h.source)!;
      return { key: h.link, title: h.title, link: h.link, topic: s.Topic, source: h.publisher ?? s.Name, published: h.published, image: h.image, from: s };
    });
  }
  // A row each, newest first; the list scrolls inside the card.
  shown = shown.slice(0, 24);

  const inTopic = feeds.filter((f) => topic === "All" || f.source.Topic === topic);
  const pending = !home.sample && inTopic.some((f) => !results[f.url]);
  const failed = !home.sample && inTopic.length > 0 && inTopic.every((f) => results[f.url]?.error && !results[f.url]?.feed);
  const now = home.now.getTime();

  const hideSource = (from: NewsSource) => {
    const before = sources;
    update({ NewsSources: sources.filter((s) => s.Url !== from.Url) });
    toast(`Hid ${from.Name}`, () => update({ NewsSources: before }));
  };

  // A headline: open or copy it, narrow the card to its topic, or drop its
  // source.
  const headlineMenu = (h: Shown): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "Open", icon: <SquareArrowOutUpRight size={13} />, onSelect: () => void openUrl(h.link) },
      { label: "Copy link", icon: <Link2 size={13} />, onSelect: () => copyLink(h.link) },
      { type: "separator" },
    ];
    if (topic === "All" && available.length > 1) items.push({ label: `Show only ${h.topic}`, icon: <Filter size={13} />, onSelect: () => update({ HomeNewsTopic: h.topic }) });
    if (topic !== "All") items.push({ label: "Show all topics", icon: <ListFilter size={13} />, onSelect: () => update({ HomeNewsTopic: "All" }) });
    if (h.from) {
      const from = h.from;
      items.push({ label: `Hide ${from.Name}`, icon: <EyeOff size={13} />, onSelect: () => hideSource(from) });
    }
    return items[items.length - 1]?.type === "separator" ? items.slice(0, -1) : items;
  };

  let empty: React.ReactNode = null;
  if (!shown.length) {
    if (!sources.length) empty = "No news sources yet. Pick some with Manage sources.";
    else if (topic === "Local" && !place) empty = "Choose a place in the Weather card to get local news.";
    else if (pending) empty = "Loading headlines…";
    else if (failed) empty = "Couldn't load the news. Check your connection; it tries again every half hour.";
    else empty = "No headlines right now.";
  }

  return (
    <Card
      id="news"
      menu={[{ label: "Manage sources…", icon: <Newspaper size={13} />, onSelect: () => setManaging(true) }]}
      label="News"
      className="col-span-2 gap-4 px-6 py-[22px]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <h2 className="m-0 shrink-0 text-16 font-semibold">News</h2>
          {/* On a narrow card the topics scroll sideways, without a scrollbar in the way. */}
          <div role="group" aria-label="News topics" className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {["All", ...available].map((t) => (
              <Chip key={t} variant="pill" selected={t === topic} onClick={() => update({ HomeNewsTopic: t })}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
        <span className="shrink-0 whitespace-nowrap">
          <CardLink onClick={() => setManaging(true)}>Manage sources</CardLink>
        </span>
      </div>
      {empty ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="-mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2">
          {shown.map((h, i) => {
            const color = topicColor(h.topic);
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => void openUrl(h.link)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const { x, y } = menuPoint(e);
                  openMenu(x, y, headlineMenu(h));
                }}
                title={h.title}
                className="flex min-w-0 shrink-0 items-center gap-[14px] rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-panel2"
              >
                <Thumb headline={h} color={color} sample={Boolean(home.sample)} lookUp={i < 8} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex gap-2 font-mono text-11 text-muted">
                    <span style={{ color }}>{h.topic}</span>
                    <span className="truncate">{h.source}</span>
                    <span className="shrink-0">{age(h.published, now)}</span>
                  </span>
                  <span className="line-clamp-2 text-14 leading-[1.4] font-medium text-text">{h.title}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {managing && <NewsSourcesPopup onClose={() => setManaging(false)} />}
    </Card>
  );
}

// The story's picture: the one in the feed, else the one its page offers for
// link previews (looked up, and cached, only for the top headlines so a long
// list doesn't fetch dozens of pages). No picture, or one that won't load,
// shows the source's initials instead.
function Thumb({ headline: h, color, sample, lookUp }: { headline: Shown; color: string; sample: boolean; lookUp: boolean }) {
  const [src, setSrc] = useState<string | null>(h.image ?? null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
    if (h.image) {
      setSrc(h.image);
      return;
    }
    setSrc(null);
    // Google News links go through a redirect page that has no picture of its own.
    if (sample || !lookUp || /^https?:\/\/news\.google\./i.test(h.link)) return;
    let alive = true;
    void previewFor(h.link, api.fetchLinkPreview).then((p) => alive && p?.image && setSrc(p.image));
    return () => {
      alive = false;
    };
  }, [h.link, h.image, sample, lookUp]);

  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} className="h-[60px] w-[84px] shrink-0 rounded-[12px] border border-line bg-bg object-cover" />;
  }
  return (
    <span className="flex h-[60px] w-[84px] shrink-0 items-center justify-center rounded-[12px] bg-panel2 font-mono text-13 font-medium" style={{ color }}>
      {initials(h.source)}
    </span>
  );
}
