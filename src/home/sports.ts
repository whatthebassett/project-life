// Scores for Home's Sports card, from ESPN's public scoreboards (one per
// league, today's games or the next day that has some). Fetched through Rust
// and kept in memory for the session so going back to Home is instant.
import { fetchData } from "../lib/api";

export interface League {
  id: string;
  name: string;
  // The scoreboard's path on ESPN.
  path: string;
}

export const leagues: League[] = [
  { id: "nfl", name: "NFL", path: "football/nfl" },
  { id: "nba", name: "NBA", path: "basketball/nba" },
  { id: "mlb", name: "MLB", path: "baseball/mlb" },
  { id: "nhl", name: "NHL", path: "hockey/nhl" },
];

export const leagueName = (id: string) => leagues.find((l) => l.id === id)?.name ?? id.toUpperCase();

export interface Team {
  abbr: string;
  name: string; // "Buffalo Bills"
  short: string; // "Bills"
  logo?: string;
  score?: string;
  winner: boolean;
}

export interface Game {
  // League and ESPN's id: "nfl:401872953".
  key: string;
  league: string;
  // Milliseconds since 1970.
  start: number;
  state: "pre" | "in" | "post";
  // ESPN's short status: "9:13 - 4th", "Top 6th", "Final/OT", "Rain Delay".
  detail: string;
  // False for a game that hasn't started but isn't simply scheduled either
  // (a rain delay, a postponement): the card shows its status, not a time.
  scheduled: boolean;
  away: Team;
  home: Team;
  link: string;
  network?: string;
}

export interface LeagueResult {
  league: string;
  fetchedAt: number;
  games?: Game[];
  error?: string;
}

// How long a league's scores stay fresh: half a minute while a game is on,
// five minutes otherwise, or until just after the next game starts.
const LIVE = 30_000;
const QUIET = 5 * 60_000;

export function freshFor(r: LeagueResult): number {
  const games = r.games ?? [];
  if (games.some((g) => g.state === "in")) return LIVE;
  const next = Math.min(...games.filter((g) => g.state === "pre" && g.start > r.fetchedAt).map((g) => g.start));
  const until = next - r.fetchedAt + LIVE;
  return until < QUIET ? Math.max(LIVE, until) : QUIET;
}

const cache = new Map<string, LeagueResult>();
const inFlight = new Map<string, Promise<LeagueResult>>();

export const cachedLeague = (league: string) => cache.get(league);
export const leagueIsFresh = (r: LeagueResult | undefined, now = Date.now()) => !!r && now - r.fetchedAt < freshFor(r);

export function loadLeague(league: string): Promise<LeagueResult> {
  const pending = inFlight.get(league);
  if (pending) return pending;
  const path = leagues.find((l) => l.id === league)?.path;
  const url = `https://site.web.api.espn.com/apis/site/v2/sports/${path}/scoreboard`;
  const job = (path ? fetchData(url) : Promise.reject("That league isn't one the card knows."))
    .then((text): LeagueResult => ({ league, fetchedAt: Date.now(), games: parseScoreboard(JSON.parse(text), league) }))
    .catch((e): LeagueResult => ({ league, fetchedAt: Date.now(), error: typeof e === "string" ? e : e instanceof Error ? e.message : "Couldn't load scores." }))
    .then((result) => {
      // A failed refresh keeps the scores from the last good fetch.
      const previous = cache.get(league);
      const kept = result.error && previous?.games ? { ...previous, error: result.error, fetchedAt: result.fetchedAt } : result;
      cache.set(league, kept);
      inFlight.delete(league);
      return kept;
    });
  inFlight.set(league, job);
  return job;
}

// ---------- Parsing ----------

// ESPN's JSON is read as unknown and checked field by field: an event that
// lacks what a row needs is skipped rather than breaking the card.
type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function parseScoreboard(data: unknown, league: string): Game[] {
  const games: Game[] = [];
  for (const raw of arr(obj(data)?.events)) {
    const game = parseEvent(obj(raw), league);
    if (game) games.push(game);
  }
  return games;
}

function parseEvent(e: Json | undefined, league: string): Game | undefined {
  const id = str(e?.id);
  const start = Date.parse(str(e?.date) ?? "");
  const status = obj(obj(e?.status)?.type);
  const state = str(status?.state);
  const competition = obj(arr(e?.competitions)[0]);
  const sides = arr(competition?.competitors).map(obj);
  const away = team(sides.find((c) => c?.homeAway === "away"));
  const home = team(sides.find((c) => c?.homeAway === "home"));
  if (!e || !id || Number.isNaN(start) || (state !== "pre" && state !== "in" && state !== "post") || !away || !home) return undefined;
  return {
    key: `${league}:${id}`,
    league,
    start,
    state,
    detail: str(status?.shortDetail) ?? str(status?.detail) ?? "",
    scheduled: str(status?.name) === "STATUS_SCHEDULED",
    away,
    home,
    link: gameLink(e, league, id),
    network: network(competition),
  };
}

function team(c: Json | undefined): Team | undefined {
  const t = obj(c?.team);
  const abbr = str(t?.abbreviation);
  if (!c || !abbr) return undefined;
  const name = str(t?.displayName) ?? abbr;
  const logo = str(t?.logo);
  return {
    abbr,
    name,
    short: str(t?.shortDisplayName) ?? name,
    logo: logo && /^https:\/\//.test(logo) ? logo : undefined,
    score: str(c.score),
    winner: c.winner === true,
  };
}

// The game's page: its summary or gamecast link, else any link to the event,
// else the page ESPN keeps at a fixed address (some games come with no links).
function gameLink(e: Json, league: string, id: string): string {
  const links = arr(e.links)
    .map(obj)
    .filter((l) => /^https:\/\//.test(str(l?.href) ?? ""));
  const rels = (l: Json | undefined) => arr(l?.rel).filter((r): r is string => typeof r === "string");
  const best = links.find((l) => rels(l).some((r) => r === "summary" || r === "gamecast")) ?? links.find((l) => rels(l).includes("event")) ?? links[0];
  return str(best?.href) ?? `https://www.espn.com/${league}/game/_/gameId/${id}`;
}

// The national broadcast when there is one, else the first listed.
function network(competition: Json | undefined): string | undefined {
  const all = arr(competition?.broadcasts).map(obj);
  const pick = all.find((b) => b?.market === "national") ?? all[0];
  return str(arr(pick?.names)[0]);
}

// ---------- Order and text ----------

// Day by day, so the date labels read in order: today, then the days ahead,
// then earlier days (a week's NFL scoreboard has Thursday's game). Within a
// day: followed teams' games first, then live, then upcoming by start time,
// then finished (the latest first).
export function orderGames(games: Game[], followed: (g: Game) => boolean, now = new Date()): Game[] {
  const rank = { in: 0, pre: 1, post: 2 };
  const midnight = (t: number | Date) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const today = midnight(now);
  const when = (g: Game) => {
    const days = Math.round((midnight(g.start) - today) / 86_400_000);
    // Live games count as today, even one that began before midnight.
    return g.state === "in" ? 0 : days >= 0 ? days : 1000 - days;
  };
  return [...games].sort((a, b) => {
    const d = when(a) - when(b);
    if (d) return d;
    const f = Number(followed(b)) - Number(followed(a));
    if (f) return f;
    if (a.state !== b.state) return rank[a.state] - rank[b.state];
    return a.state === "post" ? b.start - a.start : a.start - b.start;
  });
}

// Whether the game has a score worth showing: it's on, or it was played (a
// postponed or canceled game also ends as "post", with 0–0 and no winner).
export const scored = (g: Game) => g.state === "in" || (g.state === "post" && (g.away.winner || g.home.winner || /^f/i.test(g.detail)));

// "9:13 - 4th" → "9:13 · 4th"
export const liveText = (g: Game) => g.detail.replace(/\s+-\s+/, " · ");

// "LAC 13 – BUF 10, 9:13 4th"; before the start, "LAC @ BUF, 4:05 PM".
export function scoreLine(g: Game, when: string): string {
  if (!scored(g)) return `${g.away.abbr} @ ${g.home.abbr}, ${when}`;
  const status = g.state === "in" ? g.detail.replace(/\s+-\s+/, " ") : g.detail || "Final";
  return `${g.away.abbr} ${g.away.score ?? 0} – ${g.home.abbr} ${g.home.score ?? 0}, ${status}`;
}
