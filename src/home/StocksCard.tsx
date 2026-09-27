import clsx from "clsx";
import { ArrowDown, ArrowUp, CircleMinus, Plus, RefreshCw, SquareArrowOutUpRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { openUrl } from "../lib/api";
import { locale } from "../lib/format";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { Icon } from "../ui/icons";
import { toast } from "../ui/Toast";
import { Card, clock, Empty, useRowMenu } from "./parts";
import {
  cachedQuote,
  expireQuotes,
  INDEXES,
  isFresh,
  loadQuote,
  looksLikeSymbol,
  marketPhase,
  quoteUrl,
  searchSymbols,
  watchlist,
  type Phase,
  type Quote,
  type QuoteResult,
  type SymbolMatch,
} from "./stocks";
import type { HomeData } from "./useHome";

// How often the card looks for stale prices. Nothing is fetched unless a
// price is older than stocks.ts allows (a minute or 15), so this only sets
// how soon after that it happens.
const CHECK_EVERY = 15_000;

const phaseLabel: Record<Phase, string> = { open: "Open", pre: "Pre-market", post: "After hours", closed: "Closed" };

const up = (q: Quote) => q.price >= q.previousClose;
const tone = (q: Quote) => (up(q) ? "var(--gain)" : "var(--loss)");

// "1,234.56"; under 1 (penny stocks, some coins) four places. Dollars go
// without a sign, other currencies with theirs.
function formatPrice(n: number, currency: string, places?: number): string {
  const digits = places ?? (Math.abs(n) < 1 ? 4 : 2);
  const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits };
  if (currency === "USD") return n.toLocaleString(locale(), opts);
  // London prices come in pence.
  if (currency === "GBp" || currency === "GBX") return `${n.toLocaleString(locale(), opts)}p`;
  try {
    return n.toLocaleString(locale(), { ...opts, style: "currency", currency, currencyDisplay: "narrowSymbol" });
  } catch {
    return `${n.toLocaleString(locale(), opts)} ${currency}`;
  }
}

const percent = (q: Quote) => `${up(q) ? "+" : "−"}${Math.abs(q.changePct).toFixed(2)}%`;

// "as of 4:00 PM", or "as of Fri 4:00 PM" when it isn't today's.
function asOf(t: number, now: Date): string {
  if (!t) return "";
  const d = new Date(t);
  const day = d.toDateString() === now.toDateString() ? "" : `${d.toLocaleDateString(locale(), { weekday: "short" })} `;
  return `as of ${day}${clock(d)}`;
}

const snapshot = (symbols: string[]) => Object.fromEntries(symbols.map((s) => [s, cachedQuote(s)]));

// The S&P 500, Dow and Nasdaq, then the watchlist with the day's sparkline,
// price and change. Prices come from Yahoo Finance (stocks.ts).
export default function StocksCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const symbols = useMemo(() => watchlist(settings), [settings.StockSymbols]);
  const wanted = useMemo(() => [...new Set([...INDEXES.map((i) => i.symbol), ...symbols])], [symbols]);
  const [results, setResults] = useState<Record<string, QuoteResult | undefined>>(() => snapshot(wanted));
  const [searching, setSearching] = useState(false);
  // Bumped by Refresh now: everything is marked stale and the effect runs again.
  const [reload, setReload] = useState(0);
  const openMenu = useRowMenu("stocks", "Markets");

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      const now = Date.now();
      setResults(snapshot(wanted));
      for (const s of wanted) {
        if (isFresh(cachedQuote(s), now)) continue;
        void loadQuote(s).then((r) => alive && setResults((prev) => ({ ...prev, [s]: r })));
      }
    };
    refresh();
    const timer = window.setInterval(refresh, CHECK_EVERY);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [wanted, reload]);

  const phase = marketPhase(home.now.getTime());

  const add = (symbol: string) => {
    const list = watchlist(currentSettings());
    setSearching(false);
    if (list.includes(symbol)) {
      toast(`${symbol} is already on your watchlist`);
      return;
    }
    update({ StockSymbols: [...list, symbol] });
    toast(`Added ${symbol}`);
  };

  const move = (symbol: string, by: number) => {
    const list = [...watchlist(currentSettings())];
    const i = list.indexOf(symbol);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    update({ StockSymbols: list });
  };

  const remove = (symbol: string) => {
    const before = watchlist(currentSettings());
    const at = before.indexOf(symbol);
    update({ StockSymbols: before.filter((s) => s !== symbol) });
    toast(`Removed ${symbol}`, () => {
      const now = watchlist(currentSettings());
      if (!now.includes(symbol)) update({ StockSymbols: [...now.slice(0, at), symbol, ...now.slice(at)] });
    });
  };

  const rowMenu = (symbol: string, i: number): MenuItem[] => [
    { label: "Open on Yahoo Finance", icon: <SquareArrowOutUpRight size={13} />, onSelect: () => void openUrl(quoteUrl(symbol)) },
    { type: "separator" },
    { label: "Move up", icon: <ArrowUp size={13} />, disabled: i === 0, onSelect: () => move(symbol, -1) },
    { label: "Move down", icon: <ArrowDown size={13} />, disabled: i === symbols.length - 1, onSelect: () => move(symbol, 1) },
    { type: "separator" },
    { label: "Remove from watchlist", icon: <CircleMinus size={13} />, danger: true, onSelect: () => remove(symbol) },
  ];

  const onRowMenu = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = menuPoint(e);
    openMenu(x, y, items);
  };

  const menu: MenuItem[] = [
    { label: "Add a symbol…", icon: <Plus size={13} />, disabled: searching, onSelect: () => setSearching(true) },
    {
      label: "Refresh now",
      icon: <RefreshCw size={13} />,
      onSelect: () => {
        expireQuotes();
        setReload((n) => n + 1);
      },
    },
  ];

  const loading = symbols.length > 0 && symbols.every((s) => !results[s]);

  return (
    <Card id="stocks" menu={menu} label="Markets" className="@container gap-[14px] p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="m-0 text-16 font-semibold">Markets</h2>
          <PhaseChip phase={phase} />
        </div>
        <button
          type="button"
          onClick={() => setSearching((s) => !s)}
          aria-label={searching ? "Close search" : "Add a symbol"}
          title={searching ? "Close search" : "Add a symbol"}
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] border border-line text-muted transition-colors hover:text-text"
        >
          {searching ? <X size={15} /> : <Plus size={16} strokeWidth={2} />}
        </button>
      </div>

      {searching ? (
        <SymbolSearch have={symbols} onAdd={add} onCancel={() => setSearching(false)} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {INDEXES.map(({ symbol, label }) => {
              const q = results[symbol]?.quote;
              return (
                <button
                  key={symbol}
                  type="button"
                  onClick={() => void openUrl(quoteUrl(symbol))}
                  onContextMenu={(e) =>
                    onRowMenu(e, [{ label: "Open on Yahoo Finance", icon: <SquareArrowOutUpRight size={13} />, onSelect: () => void openUrl(quoteUrl(symbol)) }])
                  }
                  title={q ? `${q.name}, ${asOf(q.marketTime, home.now)}` : label}
                  className="flex min-w-0 flex-col gap-0.5 rounded-[12px] border border-line bg-panel2 px-2.5 py-2 text-left transition-colors hover:border-faint"
                >
                  <span className="truncate font-mono text-11 text-muted">{label}</span>
                  {q ? (
                    <>
                      {/* Whole points when narrow: the Dow's 45,000.00 doesn't fit a third of a small card. */}
                      <span className="truncate font-mono text-14 font-medium tabular-nums">
                        <span className="@md:hidden">{formatPrice(q.price, q.currency, 0)}</span>
                        <span className="hidden @md:inline">{formatPrice(q.price, q.currency)}</span>
                      </span>
                      <span className="truncate font-mono text-11 tabular-nums" style={{ color: tone(q) }}>
                        {up(q) ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
                      </span>
                    </>
                  ) : (
                    <span className="font-mono text-14 text-muted">—</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
            {symbols.length === 0 ? (
              <Empty>No symbols yet. Add one with +.</Empty>
            ) : loading ? (
              <Empty>Loading prices…</Empty>
            ) : (
              symbols.map((symbol, i) => {
                const r = results[symbol];
                const q = r?.quote;
                const note = q ? q.name : r ? "Couldn't load" : "Loading…";
                const title = q ? [q.name, q.exchange, asOf(q.marketTime, home.now), r?.error && "couldn't refresh"].filter(Boolean).join(" · ") : (r?.error ?? symbol);
                return (
                  <button
                    key={symbol}
                    type="button"
                    onClick={() => void openUrl(quoteUrl(symbol))}
                    onContextMenu={(e) => onRowMenu(e, rowMenu(symbol, i))}
                    title={title}
                    className="-mx-2 flex min-h-[52px] shrink-0 items-center gap-3 rounded-[12px] px-2 py-1.5 text-left transition-colors hover:bg-panel2 @lg:min-h-[46px]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col @lg:flex-row @lg:items-center @lg:gap-3">
                      <span className="truncate text-14 font-semibold @lg:w-[76px] @lg:shrink-0">{symbol}</span>
                      <span className="truncate text-12 text-muted @lg:text-13">{note}</span>
                    </span>
                    <Sparkline quote={q} className="h-6 w-12 shrink-0 @md:w-20 @lg:h-7 @lg:w-28" />
                    <span className="flex shrink-0 flex-col items-end gap-1 @lg:flex-row @lg:items-center @lg:gap-3">
                      <span className="font-mono text-13 tabular-nums @lg:min-w-[84px] @lg:text-right @lg:text-14">
                        {q ? formatPrice(q.price, q.currency) : "—"}
                      </span>
                      {q && (
                        <span
                          className="min-w-[64px] rounded-[8px] px-2 py-[3px] text-right font-mono text-12 tabular-nums"
                          style={{ color: tone(q), background: `color-mix(in srgb, ${tone(q)} 14%, transparent)` }}
                        >
                          {percent(q)}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
            <p className="m-0 mt-auto pt-3 text-11 text-muted">Prices from Yahoo Finance, may be delayed.</p>
          </div>
        </>
      )}
    </Card>
  );
}

// Open, Pre-market, After hours or Closed: the US market, by the S&P 500's hours.
function PhaseChip({ phase }: { phase: Phase }) {
  const color = phase === "open" ? "var(--gain)" : phase === "closed" ? "var(--muted)" : "var(--accent)";
  const background = phase === "open" ? "color-mix(in srgb, var(--gain) 14%, transparent)" : phase === "closed" ? "var(--panel2)" : "var(--accent-soft)";
  return (
    <span title="The US stock market" className="flex shrink-0 items-center gap-1.5 rounded-[8px] px-2 py-[3px] font-mono text-11 whitespace-nowrap" style={{ color, background }}>
      {phase !== "closed" && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {phaseLabel[phase]}
    </span>
  );
}

// The day's prices as a line, with the previous close dashed behind it.
// Too few points draws nothing, keeping the space so the columns line up.
function Sparkline({ quote: q, className }: { quote?: Quote; className: string }) {
  if (!q || q.points.length < 2) return <span className={className} aria-hidden="true" />;
  const W = 100;
  const H = 32;
  const lo = Math.min(...q.points, q.previousClose);
  const span = Math.max(...q.points, q.previousClose) - lo || 1;
  const y = (v: number) => (2 + (1 - (v - lo) / span) * (H - 4)).toFixed(2);
  const x = (i: number) => ((i / (q.points.length - 1)) * W * q.progress).toFixed(2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={className} aria-hidden="true">
      <line x1="0" x2={W} y1={y(q.previousClose)} y2={y(q.previousClose)} stroke="var(--faint)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      <polyline
        points={q.points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke={tone(q)}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// Search Yahoo Finance as you type. Enter adds the highlighted match; a
// symbol Yahoo's search doesn't list (some funds, currencies) can still be
// added once its price loads.
function SymbolSearch({ have, onAdd, onCancel }: { have: string[]; onAdd: (symbol: string) => void; onCancel: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SymbolMatch[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [checking, setChecking] = useState(false);
  // The text the results are for; until they catch up with the typing,
  // Enter goes by the text itself.
  const [doneFor, setDoneFor] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim();
  const shown = results.slice(0, 6);
  // Offered when the search finds nothing but the text could be a ticker.
  const direct = !shown.length && doneFor === q && looksLikeSymbol(q) ? q.toUpperCase() : null;

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    setActive(0);
    if (!q) {
      setResults([]);
      setStatus(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setStatus("Searching…");
      searchSymbols(q)
        .then((found) => {
          if (!alive) return;
          setResults(found);
          setDoneFor(q);
          // Start on the first match not already on the watchlist.
          setActive(Math.max(0, found.slice(0, 6).findIndex((m) => !have.includes(m.symbol))));
          setStatus(found.length ? null : "Nothing matches that.");
        })
        .catch(() => {
          if (!alive) return;
          setResults([]);
          setDoneFor(q);
          setStatus("Couldn't search right now.");
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q]);

  const pick = (m: SymbolMatch) => {
    if (have.includes(m.symbol)) setStatus(`${m.symbol} is already on your watchlist.`);
    else onAdd(m.symbol);
  };

  // Only add a symbol nobody listed once Yahoo has a price for it.
  const check = (symbol: string) => {
    if (checking) return;
    if (have.includes(symbol)) {
      setStatus(`${symbol} is already on your watchlist.`);
      return;
    }
    setChecking(true);
    setStatus(`Checking ${symbol}…`);
    void loadQuote(symbol).then((r) => {
      setChecking(false);
      if (r.quote) onAdd(r.quote.symbol);
      else setStatus(`Yahoo Finance has no prices for ${symbol}.`);
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <label className="flex h-10 shrink-0 items-center gap-[10px] rounded-[12px] border border-line bg-panel2 px-3 text-muted focus-within:border-accent">
        <Icon name="search" size={15} stroke={1.9} />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && shown.length) {
              e.preventDefault();
              setActive((a) => (a + 1) % shown.length);
            } else if (e.key === "ArrowUp" && shown.length) {
              e.preventDefault();
              setActive((a) => (a - 1 + shown.length) % shown.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (doneFor === q && shown[active]) pick(shown[active]);
              else if (looksLikeSymbol(q)) check(q.toUpperCase());
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          role="combobox"
          aria-expanded={shown.length > 0}
          aria-controls="stocks-search-results"
          aria-activedescendant={shown[active] ? `stocks-result-${active}` : undefined}
          placeholder="Search for a company or symbol"
          aria-label="Search for a company or symbol"
          className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text"
        />
      </label>
      <div id="stocks-search-results" role="listbox" aria-label="Matches" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {shown.map((m, i) => {
          const added = have.includes(m.symbol);
          return (
            <button
              key={m.symbol}
              id={`stocks-result-${i}`}
              type="button"
              role="option"
              aria-selected={i === active}
              onClick={() => pick(m)}
              onMouseEnter={() => setActive(i)}
              className={clsx("flex min-h-[44px] shrink-0 items-center gap-3 rounded-[10px] px-3 py-1.5 text-left", i === active ? "bg-panel2" : "hover:bg-panel2")}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-13 font-semibold">{m.symbol}</span>
                <span className="truncate text-12 text-muted">{m.name}</span>
              </span>
              <span className="max-w-[45%] shrink-0 truncate font-mono text-11 text-muted">{added ? "Added" : [m.exchange, m.type].filter(Boolean).join(" · ")}</span>
            </button>
          );
        })}
        {direct && (
          <button
            type="button"
            onClick={() => check(direct)}
            disabled={checking}
            className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-[10px] px-3 py-1.5 text-left text-13 hover:bg-panel2"
          >
            <Plus size={14} className="text-muted" />
            Add “{direct}”
          </button>
        )}
        {status && <span className="px-1 pt-1 text-12 text-muted">{status}</span>}
      </div>
      <button type="button" onClick={onCancel} className="self-start text-12 text-muted hover:text-text hover:underline">
        Cancel
      </button>
    </div>
  );
}
