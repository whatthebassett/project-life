// Home's settings, read through these accessors so a hand-edited or older
// settings file can't hand the screen a wrong shape.
import type { Settings } from "../lib/settings";
import { catalogSource, LOCAL } from "./feeds";

// A place for the weather and local news. Lowercase keys, the same shape as
// Checkpoint's, so Import from Checkpoint can bring it straight across.
export interface Place {
  name: string;
  region?: string;
  latitude: number;
  longitude: number;
}

// A chosen news source: a catalog feed, one added by address, or LOCAL.
export interface NewsSource {
  Url: string;
  Name: string;
  Topic: string;
}

const source = (url: string): NewsSource => {
  const c = catalogSource(url)!;
  return { Url: url, Name: c.name, Topic: c.topic };
};

// What Home shows before anyone picks: gaming, tech and local, like the mockup.
export const defaultSources: NewsSource[] = [
  source("https://feeds.feedburner.com/ign/all"),
  source("https://www.pcgamer.com/rss/"),
  source("https://www.gamespot.com/feeds/mashup/"),
  source("https://www.theverge.com/rss/index.xml"),
  source("https://feeds.arstechnica.com/arstechnica/index"),
  { Url: LOCAL, Name: "Local news", Topic: "Local" },
];

export function newsSources(s: Settings): NewsSource[] {
  const raw = s.NewsSources;
  if (!Array.isArray(raw)) return defaultSources;
  return raw.filter((f): f is NewsSource => typeof f?.Url === "string" && typeof f?.Name === "string" && typeof f?.Topic === "string");
}

export function weatherPlace(s: Settings): Place | null {
  const p = s.WeatherLocation as Place | null | undefined;
  return p && typeof p.name === "string" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) ? p : null;
}

// °F where the US customary units are the norm, °C everywhere else, until
// someone flips the card's toggle.
export function temperatureUnit(s: Settings): "C" | "F" {
  if (s.TemperatureUnit === "F" || s.TemperatureUnit === "C") return s.TemperatureUnit;
  return /-(US|LR|MM)$/i.test(navigator.language) ? "F" : "C";
}

export function newsTopic(s: Settings): string {
  return typeof s.HomeNewsTopic === "string" ? s.HomeNewsTopic : "All";
}

const usStates: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

// The weather card's short label: "Yarmouth Port, MA", "Leeds, England".
export function shortPlace(p: Place): string {
  const first = p.region?.split(", ")[0];
  if (!first) return p.name;
  return `${p.name}, ${p.region?.endsWith("United States") ? (usStates[first] ?? first) : first}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
