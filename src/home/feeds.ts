// The built-in news sources, by topic, ported from Checkpoint (every address
// was checked there to return a readable RSS or Atom feed, September 2026).
// "Tech" is Checkpoint's "Technology", named as Home's filters show it.
// Local news isn't a fixed feed: it's a Google News search for the place
// chosen for the weather (localFeedUrl).
import type { Place } from "./prefs";

export interface FeedSource {
  url: string;
  name: string;
}

export interface FeedCategory {
  name: string;
  sources: FeedSource[];
}

export const catalog: FeedCategory[] = [
  {
    name: "Top stories",
    sources: [
      { url: "https://feeds.bbci.co.uk/news/rss.xml", name: "BBC News" },
      { url: "https://feeds.npr.org/1001/rss.xml", name: "NPR News" },
      { url: "https://www.theguardian.com/international/rss", name: "The Guardian" },
      { url: "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml", name: "The New York Times" },
      { url: "https://feeds.washingtonpost.com/rss/national", name: "The Washington Post" },
      { url: "https://www.cbsnews.com/latest/rss/main", name: "CBS News" },
      { url: "https://abcnews.com/abcnews/topstories", name: "ABC News" },
      { url: "https://www.pbs.org/newshour/feeds/rss/headlines", name: "PBS NewsHour" },
      { url: "https://feeds.skynews.com/feeds/rss/home.xml", name: "Sky News" },
    ],
  },
  {
    name: "World",
    sources: [
      { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World" },
      { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
      { url: "https://www.theguardian.com/world/rss", name: "The Guardian World" },
      { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", name: "NYT World" },
      { url: "https://rss.dw.com/xml/rss-en-world", name: "DW" },
      { url: "https://www.france24.com/en/rss", name: "France 24" },
      { url: "https://feeds.npr.org/1004/rss.xml", name: "NPR World" },
    ],
  },
  {
    // The biggest gaming news sites (each checked with the Home parser, September 2026).
    name: "Gaming",
    sources: [
      { url: "https://feeds.feedburner.com/ign/all", name: "IGN" },
      { url: "https://www.gamespot.com/feeds/mashup/", name: "GameSpot" },
      { url: "https://www.polygon.com/feed/", name: "Polygon" },
      { url: "https://kotaku.com/feed", name: "Kotaku" },
      { url: "https://www.pcgamer.com/rss/", name: "PC Gamer" },
      { url: "https://www.eurogamer.net/feed", name: "Eurogamer" },
      { url: "https://www.gamesradar.com/feeds.xml", name: "GamesRadar+" },
      { url: "https://gameinformer.com/news.xml", name: "Game Informer" },
      { url: "https://www.videogameschronicle.com/feed/", name: "Video Games Chronicle" },
      { url: "https://www.theverge.com/rss/games/index.xml", name: "The Verge Games" },
    ],
  },
  {
    name: "Tech",
    sources: [
      { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars Technica" },
      { url: "https://www.theverge.com/rss/index.xml", name: "The Verge" },
      { url: "https://techcrunch.com/feed/", name: "TechCrunch" },
      { url: "https://www.wired.com/feed/rss", name: "Wired" },
      { url: "https://www.engadget.com/rss.xml", name: "Engadget" },
      { url: "https://www.technologyreview.com/feed/", name: "MIT Technology Review" },
      { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", name: "BBC Technology" },
      { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", name: "NYT Technology" },
      { url: "https://hnrss.org/frontpage", name: "Hacker News" },
    ],
  },
  {
    name: "Science",
    sources: [
      { url: "https://www.sciencedaily.com/rss/all.xml", name: "ScienceDaily" },
      { url: "https://www.nasa.gov/news-release/feed/", name: "NASA" },
      { url: "https://www.nature.com/nature.rss", name: "Nature" },
      { url: "https://www.newscientist.com/feed/", name: "New Scientist" },
      { url: "https://www.scientificamerican.com/platform/syndication/rss/", name: "Scientific American" },
      { url: "https://www.quantamagazine.org/feed/", name: "Quanta Magazine" },
      { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", name: "BBC Science" },
      { url: "https://feeds.npr.org/1007/rss.xml", name: "NPR Science" },
    ],
  },
  {
    name: "Business",
    sources: [
      { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business" },
      { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", name: "CNBC" },
      { url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", name: "MarketWatch" },
      { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", name: "NYT Business" },
      { url: "https://www.theguardian.com/uk/business/rss", name: "The Guardian Business" },
      { url: "https://feeds.npr.org/1006/rss.xml", name: "NPR Business" },
      { url: "https://finance.yahoo.com/news/rssindex", name: "Yahoo Finance" },
    ],
  },
  {
    name: "Health",
    sources: [
      { url: "https://feeds.bbci.co.uk/news/health/rss.xml", name: "BBC Health" },
      { url: "https://feeds.npr.org/1128/rss.xml", name: "NPR Health" },
      { url: "https://rss.nytimes.com/services/xml/rss/nyt/Health.xml", name: "NYT Health" },
    ],
  },
  {
    name: "Sports",
    sources: [
      { url: "https://www.espn.com/espn/rss/news", name: "ESPN" },
      { url: "https://feeds.bbci.co.uk/sport/rss.xml", name: "BBC Sport" },
      { url: "https://www.cbssports.com/rss/headlines/", name: "CBS Sports" },
      { url: "https://www.theguardian.com/uk/sport/rss", name: "The Guardian Sport" },
    ],
  },
  {
    name: "Culture",
    sources: [
      { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Entertainment & Arts" },
      { url: "https://www.theguardian.com/uk/culture/rss", name: "The Guardian Culture" },
      { url: "https://variety.com/feed/", name: "Variety" },
    ],
  },
];

// Stands for the local feed in the list of chosen sources.
export const LOCAL = "local";

// Google News' RSS search for a town: free, no account, and it names each
// story's own paper.
export function localFeedUrl(place: Place): string {
  const q = [place.name, place.region?.split(",")[0]].filter(Boolean).join(" ");
  return `https://news.google.com/rss/search?${new URLSearchParams({ q, hl: "en-US", gl: "US", ceid: "US:en" })}`;
}

const byUrl = new Map(catalog.flatMap((c) => c.sources.map((s) => [s.url, { ...s, topic: c.name }] as const)));

export const catalogSource = (url: string): (FeedSource & { topic: string }) | undefined => byUrl.get(url);

// The topics, in the order the filters show them.
export const topics = ["Gaming", "Tech", "Local", ...catalog.map((c) => c.name).filter((n) => n !== "Gaming" && n !== "Tech")];
