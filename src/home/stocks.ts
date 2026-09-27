// Stock prices for Home's Markets card, from Yahoo Finance's chart and search
// endpoints (unofficial, so fetched gently: one request per symbol, at most
// once a minute while the US market trades and every 15 minutes otherwise).
// Quotes are kept in memory for the session so going back to Home is instant.
import { fetchData } from "../lib/api";
import type { Settings } from "../lib/settings";

export const DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN"];

// The strip along the top of the card. ^GSPC's trading hours also decide
// whether the market is open.
export const INDEXES = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^IXIC", label: "Nasdaq" },
];
const MARKET = "^GSPC";

// Times in milliseconds since 1970.
export interface Period {
  start: number;
  end: number;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  currency: string;
  exchange: string;
  // The day's prices, oldest first, gaps dropped.
  points: number[];
  // How much of the trading day the points cover (0 to 1), so an hour into
  // the day the sparkline only reaches part way across.
  progress: number;
  // When the price was set.
  marketTime: number;
  periods: { pre?: Period; regular?: Period; post?: Period };
  // When this quote was fetched.
  loadedAt: number;
}

export interface QuoteResult {
  symbol: string;
  // When it was last tried, whether or not that worked.
  fetchedAt: number;
  quote?: Quote;
  error?: string;
}

export interface SymbolMatch {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

// The watchlist; an empty one stays empty.
export const watchlist = (s: Settings): string[] => s.StockSymbols ?? DEFAULT_SYMBOLS;

// Tickers are letters and digits with a few joiners: BRK-B, ^GSPC, EURUSD=X, RY.TO.
export const looksLikeSymbol = (text: string) => /^[\^]?[A-Z0-9][A-Z0-9.\-=]{0,19}$/i.test(text.trim());

export const quoteUrl = (symbol: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;

// ---------- Cache ----------

const cache = new Map<string, QuoteResult>();
const inFlight = new Map<string, Promise<QuoteResult>>();

export const cachedQuote = (symbol: string) => cache.get(symbol);
export const isFresh = (r: QuoteResult | undefined, now = Date.now()) => !!r && now - r.fetchedAt < refreshAfter(now);

// Refresh now: everything counts as stale, but the prices stay on show.
export function expireQuotes() {
  for (const [symbol, r] of cache) cache.set(symbol, { ...r, fetchedAt: 0 });
}

export function loadQuote(symbol: string): Promise<QuoteResult> {
  const pending = inFlight.get(symbol);
  if (pending) return pending;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
  const job = fetchData(url)
    .then((text): QuoteResult => ({ symbol, fetchedAt: Date.now(), quote: parseChart(text, symbol) }))
    .catch((e): QuoteResult => ({ symbol, fetchedAt: Date.now(), error: message(e) }))
    .then((result) => {
      // A failed refresh keeps the last good price.
      const previous = cache.get(symbol);
      const kept = result.error && previous?.quote ? { ...previous, error: result.error, fetchedAt: result.fetchedAt } : result;
      cache.set(symbol, kept);
      inFlight.delete(symbol);
      return kept;
    });
  inFlight.set(symbol, job);
  return job;
}

const message = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Couldn't load this price.");

// ---------- Market hours ----------

export type Phase = "pre" | "open" | "post" | "closed";

// A minute while the US market trades (pre-market to after hours), else 15.
export const refreshAfter = (now = Date.now()) => (marketPhase(now) === "closed" ? 15 * 60_000 : 60_000);

const nyParts = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function inNewYork(t: number) {
  const p = Object.fromEntries(nyParts.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekend: p.weekday === "Sat" || p.weekday === "Sun", minutes: Number(p.hour) * 60 + Number(p.minute) };
}

// The usual hours (4:00 pre-market, 9:30 open, 4:00 close, 8:00 PM end of
// after hours, New York time), for when Yahoo's own aren't known.
function clockPhase(now: number): Phase {
  const { weekend, minutes: m } = inNewYork(now);
  if (weekend || m < 240 || m >= 1200) return "closed";
  return m < 570 ? "pre" : m < 960 ? "open" : "post";
}

// From the S&P 500's trading hours as Yahoo gives them, which know about
// holidays and early closes.
export function marketPhase(now = Date.now()): Phase {
  const ny = inNewYork(now);
  if (ny.weekend) return "closed";
  const q = cache.get(MARKET)?.quote;
  const { pre, regular, post } = q?.periods ?? {};
  if (!q || !regular) return clockPhase(now);
  const within = (p?: Period) => !!p && now >= p.start && now < p.end;
  if (within(regular)) return "open";
  if (within(pre)) return "pre";
  if (within(post)) return "post";
  // Today's hours say it's closed. Another day's hours that were just fetched
  // mean today isn't a trading day (a holiday); older ones are only left
  // over from yesterday, so go by the clock until they're fetched again.
  if (inNewYork(regular.start).day === ny.day || now - q.loadedAt < 20 * 60_000) return "closed";
  return clockPhase(now);
}

// ---------- Parsing ----------

// Yahoo's answers, loosely: every field is checked before it's used.
interface RawChart {
  chart?: {
    error?: { description?: unknown } | null;
    result?: {
      meta?: Record<string, unknown> & { currentTradingPeriod?: Record<string, unknown> };
      timestamp?: unknown;
      indicators?: { quote?: { close?: unknown }[] };
    }[] | null;
  };
}

interface RawSearch {
  quotes?: Record<string, unknown>[];
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);

function period(v: unknown): Period | undefined {
  const p = v as { start?: unknown; end?: unknown } | null | undefined;
  const start = num(p?.start);
  const end = num(p?.end);
  return start !== undefined && end !== undefined && end > start ? { start: start * 1000, end: end * 1000 } : undefined;
}

function json<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw "Yahoo Finance sent something unexpected.";
  }
}

// Throws when Yahoo has no price for the symbol.
export function parseChart(text: string, symbol: string): Quote {
  const chart = json<RawChart>(text)?.chart;
  const result = Array.isArray(chart?.result) ? chart.result[0] : undefined;
  const meta = result?.meta;
  if (!meta) throw str(chart?.error?.description) ?? `No prices for ${symbol}.`;

  const closes = result.indicators?.quote?.[0]?.close;
  const times = Array.isArray(result.timestamp) ? (result.timestamp as unknown[]) : [];
  const points = (Array.isArray(closes) ? (closes as unknown[]) : []).map(num).filter((n): n is number => n !== undefined);
  const price = num(meta.regularMarketPrice) ?? points[points.length - 1];
  if (price === undefined) throw `No prices for ${symbol}.`;
  const previousClose = num(meta.chartPreviousClose) ?? num(meta.previousClose) ?? points[0] ?? price;

  const tp = meta.currentTradingPeriod;
  const periods = { pre: period(tp?.pre), regular: period(tp?.regular), post: period(tp?.post) };

  // While the day's session is under way the points only cover part of it.
  let progress = 1;
  const last = num(times[times.length - 1]);
  const r = periods.regular;
  if (r && last !== undefined && last * 1000 >= r.start && last * 1000 < r.end) progress = Math.max(0.02, (last * 1000 - r.start) / (r.end - r.start));

  const change = price - previousClose;
  return {
    symbol: str(meta.symbol) ?? symbol,
    name: str(meta.shortName) ?? str(meta.longName) ?? symbol,
    price,
    previousClose,
    change,
    changePct: previousClose ? (change / previousClose) * 100 : 0,
    currency: str(meta.currency) ?? "USD",
    exchange: str(meta.exchangeName) ?? "",
    points,
    progress,
    marketTime: (num(meta.regularMarketTime) ?? 0) * 1000,
    periods,
    loadedAt: Date.now(),
  };
}

// ---------- Search ----------

const typeNames: Record<string, string> = {
  EQUITY: "Stock",
  ETF: "ETF",
  INDEX: "Index",
  MUTUALFUND: "Fund",
  CRYPTOCURRENCY: "Crypto",
  FUTURE: "Future",
  CURRENCY: "Currency",
  OPTION: "Option",
};

export async function searchSymbols(text: string): Promise<SymbolMatch[]> {
  const q = encodeURIComponent(text.trim());
  const data = json<RawSearch>(await fetchData(`https://query1.finance.yahoo.com/v1/finance/search?q=${q}&quotesCount=8&newsCount=0`));
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  return quotes.flatMap((x): SymbolMatch[] => {
    const symbol = str(x?.symbol);
    // Yahoo also lists private companies it has no prices for.
    if (!symbol || x.isYahooFinance === false) return [];
    const type = str(x.quoteType) ?? "";
    return [
      {
        symbol,
        name: str(x.shortname) ?? str(x.longname) ?? symbol,
        exchange: str(x.exchDisp) ?? str(x.exchange) ?? "",
        type: typeNames[type] ?? type.charAt(0) + type.slice(1).toLowerCase(),
      },
    ];
  });
}
