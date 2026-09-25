import { useEffect, useMemo, useState } from "react";
import { openUrl } from "../lib/api";
import { useSettings } from "../lib/SettingsContext";
import { Chip } from "../ui/Chip";
import { LOCAL, localFeedUrl, topics } from "./feeds";
import { cachedFeed, isFresh, loadFeed, mergeHeadlines, staleAfter, type Feed, type FeedResult } from "./news";
import NewsSourcesPopup from "./NewsSourcesPopup";
import { Card, CardLink, Empty } from "./parts";
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
}

// Headlines from the chosen sources, newest first, filtered by topic.
export default function NewsCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const [managing, setManaging] = useState(false);
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
    shown = mergeHeadlines(loaded, 2).map((h) => {
      const s = byUrl.get(h.source)!;
      return { key: h.link, title: h.title, link: h.link, topic: s.Topic, source: h.publisher ?? s.Name, published: h.published };
    });
  }
  shown = shown.slice(0, 4);

  const inTopic = feeds.filter((f) => topic === "All" || f.source.Topic === topic);
  const pending = !home.sample && inTopic.some((f) => !results[f.url]);
  const failed = !home.sample && inTopic.length > 0 && inTopic.every((f) => results[f.url]?.error && !results[f.url]?.feed);
  const now = home.now.getTime();

  let empty: React.ReactNode = null;
  if (!shown.length) {
    if (!sources.length) empty = "No news sources yet. Pick some with Manage sources.";
    else if (topic === "Local" && !place) empty = "Choose a place in the Weather card to get local news.";
    else if (pending) empty = "Loading headlines…";
    else if (failed) empty = "Couldn't load the news. Check your connection; it tries again every half hour.";
    else empty = "No headlines right now.";
  }

  return (
    <Card label="News" className="col-span-2 gap-4 px-6 py-[22px]">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <h2 className="m-0 text-16 font-semibold">News</h2>
          <div role="group" aria-label="News topics" className="flex gap-1.5 overflow-x-auto">
            {["All", ...available].map((t) => (
              <Chip key={t} variant="pill" selected={t === topic} onClick={() => update({ HomeNewsTopic: t })}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
        <CardLink onClick={() => setManaging(true)}>Manage sources</CardLink>
      </div>
      {empty ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-3">
          {shown.map((h) => {
            const color = topicColor(h.topic);
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => void openUrl(h.link)}
                title={h.title}
                className="flex min-w-0 gap-[14px] rounded-[16px] border border-line bg-panel2 p-[14px] text-left transition-colors hover:border-faint"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-bg font-mono text-13 font-medium" style={{ color }}>
                  {initials(h.source)}
                </span>
                <span className="flex min-w-0 flex-col gap-1.5">
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
