import clsx from "clsx";
import { MapPin, RefreshCw, Thermometer } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MenuItem } from "../components/ContextMenu";
import { useSettings } from "../lib/SettingsContext";
import { Icon } from "../ui/icons";
import { Card, Empty } from "./parts";
import { shortPlace, temperatureUnit, weatherPlace, type Place } from "./prefs";
import { cachedWeather, clearWeatherCache, dayName, describe, forecastText, loadWeather, searchPlaces, weatherIsFresh, type Weather } from "./weather";
import type { HomeData } from "./useHome";

const REFRESH = 30 * 60_000;

// Sun and clear skies in warn, rain and snow in the live color, the rest muted.
function toneOf(code: number): string {
  if (code <= 2) return "var(--warn)";
  if (code === 3 || code === 45 || code === 48) return "var(--muted)";
  return "var(--accent2)";
}

// Open-Meteo weather for the chosen place (Checkpoint's weather.ts): now,
// wind, humidity and rain, and as many days and details as the card's size
// has room for (roomFor, below).
export default function WeatherCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const place = useMemo(() => weatherPlace(settings), [settings.WeatherLocation]);
  const unit = temperatureUnit(settings);
  const [picking, setPicking] = useState(false);
  const [weather, setWeather] = useState<Weather | undefined>(() => (place ? cachedWeather(place, unit) : undefined));
  const [error, setError] = useState<string | null>(null);
  // Bumped by Refresh: the cache is emptied and the effect runs again.
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!place || home.sample) return;
    let alive = true;
    const refresh = () => {
      const cached = cachedWeather(place, unit);
      if (cached) setWeather(cached);
      if (weatherIsFresh(cached)) return;
      setError(null);
      loadWeather(place, unit)
        .then((w) => alive && setWeather(w))
        .catch((e) => alive && setError(typeof e === "string" ? e : "Couldn't reach the weather service."));
    };
    refresh();
    const timer = window.setInterval(refresh, REFRESH);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [place, unit, home.sample, reload]);

  const w = home.sample ? home.sample.weather(unit) : place ? weather : undefined;
  const label = home.sample ? "Yarmouth Port, MA" : place ? shortPlace(place) : null;
  const style = { background: "radial-gradient(420px 220px at 100% 0%, var(--glow), transparent 70%), var(--panel)" };

  const choose = (p: Place) => {
    update({ WeatherLocation: p });
    setWeather(cachedWeather(p, unit));
    setPicking(false);
  };

  const menu: MenuItem[] = [
    { label: "Change place…", icon: <MapPin size={13} />, disabled: picking, onSelect: () => setPicking(true) },
    { label: unit === "F" ? "Show in °C" : "Show in °F", icon: <Thermometer size={13} />, onSelect: () => update({ TemperatureUnit: unit === "F" ? "C" : "F" }) },
    {
      label: "Refresh",
      icon: <RefreshCw size={13} />,
      disabled: !place || Boolean(home.sample),
      onSelect: () => {
        clearWeatherCache();
        setReload((n) => n + 1);
      },
    },
  ];

  return (
    <Card id="weather" menu={menu} label="Weather" className="gap-[14px] px-6 py-[22px]" style={style}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-16 font-semibold tiny:text-14">Weather</h2>
          {label && !picking && (
            <button type="button" onClick={() => setPicking(true)} title="Change place" className="hidden truncate text-left text-12 text-muted hover:text-text hover:underline roomy:block">
              {label}
            </button>
          )}
        </div>
        {!picking && (
          <button
            type="button"
            onClick={() => update({ TemperatureUnit: unit === "F" ? "C" : "F" })}
            aria-label={unit === "F" ? "Show Celsius" : "Show Fahrenheit"}
            className="hidden h-[30px] rounded-[9px] border border-line px-[10px] font-mono text-12 text-muted transition-colors hover:text-text roomy:block"
          >
            °{unit}
          </button>
        )}
      </div>

      {picking || (!place && !home.sample) ? (
        <PlaceSearch onPick={choose} onCancel={place ? () => setPicking(false) : undefined} />
      ) : !w ? (
        <Empty>{error ? `${error} It tries again every half hour.` : "Loading the weather…"}</Empty>
      ) : (
        <Forecast w={w} />
      )}
    </Card>
  );
}

// What a card of this size has room for. Now is always there, and the first
// three numbers whenever they fit; as the card grows it reveals, in this order: the next
// three days, more numbers (feels like, UV, gusts), two more days, today by
// morning, afternoon and evening, the rest of the days, today's forecast in
// words, and last a second line of detail under each day. A wide card puts
// the days beside the rest, so each side fills on its own.
const BASE = 126; // Now (58) + gap + the numbers (54).
const BLOCK = 14; // Between blocks.
const DAY = 26;
const DAY_GAP = 6;
const NUMBERS = 54 + BLOCK;
const PARTS = 64 + BLOCK;
const WORDS = 98 + BLOCK; // Five lines.
const DETAIL = 18; // A day's second line.
const SPREAD = 56; // How much taller a day gets when there's room to spare.
const BLOCK_MAX = 36; // And how far apart the blocks beside the days get.

const nothingElse = { wide: false, stats: false, numbers: false, parts: false, words: false, days: 0, detail: false };

export function roomFor(width: number, height: number, count: number, hasParts: boolean) {
  const wide = width >= 520;
  // The smallest squares only fit the temperature and the conditions.
  const stats = height >= BASE - 6;
  let left = height - BASE;
  // Each step waits for the ones before it, so a bigger card only ever adds.
  let open = stats;
  const take = (cost: number) => (open = open && left >= cost) && ((left -= cost), true);
  if (wide) {
    const numbers = take(NUMBERS);
    const parts = hasParts ? take(PARTS) : false;
    const words = take(WORDS);
    const days = Math.min(count, Math.max(0, Math.floor((height + DAY_GAP) / (DAY + DAY_GAP))));
    const detail = days === count && height >= count * (DAY + DETAIL + DAY_GAP) - DAY_GAP;
    return { wide, stats, numbers, parts, words, days, detail };
  }
  let days = 0;
  const addDays = (upTo: number) => {
    while (days < Math.min(upTo, count) && take(days ? DAY + DAY_GAP : DAY + BLOCK)) days++;
  };
  addDays(3);
  const numbers = take(NUMBERS);
  addDays(5);
  const parts = hasParts ? take(PARTS) : false;
  addDays(count);
  const words = take(WORDS);
  const detail = days === count && take(count * DETAIL);
  return { wide, stats, numbers, parts, words, days, detail };
}

function Forecast({ w }: { w: Weather }) {
  const r = Math.round;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const now = describe(w.current.code, w.current.isDay);
  const today = w.days[0];
  const speed = w.unit === "F" ? "mph" : "km/h";
  // A small card (too narrow for the numbers, or too short for the usual
  // row): just the temperature over the conditions.
  const tiny = size.width > 0 && (size.width < 170 || size.height < 58);
  const show = tiny ? nothingElse : roomFor(size.width, size.height, w.days.length - 1, Boolean(today?.parts.length));
  // A small card (a quarter wide): no big icon, shorter names, closer tiles.
  const tight = size.width > 0 && size.width < 250;
  const tiles = clsx("flex shrink-0", tight ? "gap-1.5 text-11" : "gap-2 text-12");
  const next = w.days.slice(1, 1 + show.days);
  const lo = Math.min(...next.map((d) => d.low));
  const span = Math.max(1, Math.max(...next.map((d) => d.high)) - lo);

  // Room left over once everything fits is shared out: the days spread
  // apart (up to a point), and the rest sits in the middle of the card.
  const dayMax = DAY + (show.detail ? DETAIL : 0) + SPREAD;
  // Beside the days (a wide card), the blocks move apart too.
  const blocks = 2 + Number(show.numbers) + Number(show.parts) + Number(show.words);
  const blocksTall = BASE - BLOCK + Number(show.numbers) * (NUMBERS - BLOCK) + Number(show.parts) * (PARTS - BLOCK) + Number(show.words) * (WORDS - BLOCK);
  const blockGap = show.wide ? Math.min(BLOCK_MAX, Math.max(BLOCK, (size.height - blocksTall) / (blocks + 1))) : BLOCK;
  const days = next.length > 0 && (
    <div className="flex min-w-0 flex-1 flex-col" style={{ gap: DAY_GAP, maxHeight: next.length * (dayMax + DAY_GAP) - DAY_GAP }}>
      {next.map((d, i) => {
        const sky = describe(d.code);
        return (
          <div key={d.date} className="flex flex-1 flex-col justify-center">
            <div className="flex h-[26px] shrink-0 items-center gap-3 text-13">
              <span className="w-[34px] font-medium">{dayName(d.date, i + 1)}</span>
              <span className="flex w-[18px]" style={{ color: toneOf(d.code) }} title={sky.label}>
                <sky.Icon size={18} strokeWidth={1.8} aria-label={sky.label} />
              </span>
              <span className="w-[30px] text-right font-mono text-12 text-muted">{r(d.low)}°</span>
              <span className="relative h-1.5 flex-1 rounded-[6px] bg-panel2">
                <span
                  className="absolute inset-y-0 rounded-[6px] bg-accent2"
                  style={{ left: `${((d.low - lo) / span) * 100}%`, width: `${((d.high - d.low) / span) * 100}%` }}
                />
              </span>
              <span className="w-[30px] font-mono text-12">{r(d.high)}°</span>
            </div>
            {show.detail && (
              <div className="h-[18px] shrink-0 truncate pl-[46px] text-12 leading-[18px] text-muted">
                {[sky.label, d.rain != null ? `${d.rain}% rain` : null, `wind ${r(d.wind)} ${speed}`].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div ref={box} className={clsx("flex min-h-0 flex-1 overflow-hidden", show.wide ? "gap-8" : "flex-col gap-[14px]")}>
      <div className={clsx("flex min-h-0 flex-col", show.wide && "[justify-content:safe_center]", show.wide ? "w-[44%] max-w-[400px] min-w-[280px] shrink-0" : "flex-1")} style={{ gap: blockGap }}>
        {tiny ? (
          <div className="flex shrink-0 flex-col gap-0.5">
            <div className={clsx("font-head leading-none font-bold tracking-[-0.03em]", size.height >= 62 ? "text-40" : "text-28")}>{r(w.current.temperature)}°</div>
            {size.height >= 46 && <span className="truncate text-13 leading-[16px] font-medium">{now.label}</span>}
            {today && size.height >= 82 && (
              <span className="font-mono text-11 whitespace-nowrap text-muted">
                {r(today.high)}° / {r(today.low)}°
              </span>
            )}
          </div>
        ) : (
          <div className="flex h-[58px] shrink-0 items-center gap-4">
            {!tight && (
              <span className="flex" style={{ color: toneOf(w.current.code) }}>
                <now.Icon size={54} strokeWidth={1.5} aria-hidden="true" />
              </span>
            )}
            <div className="font-head text-58 leading-none font-bold tracking-[-0.03em]">{r(w.current.temperature)}°</div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-14 font-medium">{now.label}</span>
              {today && (
                <span className="font-mono text-12 whitespace-nowrap text-muted">
                  {tight ? `${r(today.high)}° / ${r(today.low)}°` : `H ${r(today.high)}° · L ${r(today.low)}°`}
                </span>
              )}
            </div>
          </div>
        )}
        {show.stats && (
          <div className={tiles}>
            <Stat tight={tight} label="Wind" value={`${r(w.current.wind)} ${speed}`} />
            <Stat tight={tight} label={tight ? "Humid." : "Humidity"} value={`${r(w.current.humidity)}%`} />
            <Stat tight={tight} label="Rain" value={today?.rain != null ? `${today.rain}%` : "—"} />
          </div>
        )}
        {show.numbers && (
          <div className={tiles}>
            <Stat tight={tight} label={tight ? "Feels" : "Feels like"} value={`${r(w.current.feelsLike)}°`} />
            <Stat tight={tight} label={tight ? "UV" : "UV index"} value={today?.uv != null ? String(r(today.uv)) : "—"} />
            <Stat tight={tight} label="Gusts" value={today ? `${r(today.gusts)} ${speed}` : "—"} />
          </div>
        )}
        {show.parts && today && (
          <div className={clsx(tiles, "h-16")}>
            {today.parts.map((p) => {
              const sky = describe(p.code, p.isDay);
              return (
                <span key={p.label} title={`${p.label}: ${sky.label}`} className={clsx("flex min-w-0 flex-1 flex-col justify-center gap-1 rounded-[10px] border border-line", tight ? "px-[7px]" : "px-[10px]")}>
                  <span className="truncate text-muted">{tight ? shortPart[p.label] : p.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="flex shrink-0" style={{ color: toneOf(p.code) }}>
                      <sky.Icon size={18} strokeWidth={1.8} aria-label={sky.label} />
                    </span>
                    <span className="font-mono text-13">{r(p.temperature)}°</span>
                  </span>
                </span>
              );
            })}
          </div>
        )}
        {show.words && today && <p className="m-0 line-clamp-5 h-[98px] shrink-0 text-13 leading-[19.5px] text-muted">{forecastText(today, w, 0)}</p>}
        {!show.wide && days}
      </div>
      {show.wide && <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">{days}</div>}
    </div>
  );
}

const shortPart = { Morning: "Morn.", Afternoon: "Aft.", Evening: "Eve." };

function Stat({ label, value, tight }: { label: string; value: string; tight?: boolean }) {
  return (
    <span title={`${label}: ${value}`} className={clsx("flex h-[54px] min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-[10px] bg-panel2", tight ? "px-[7px]" : "px-[10px]")}>
      <span className="truncate text-muted">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </span>
  );
}

// Search Open-Meteo's places by name. Cura never looks up where the
// computer is; the place is only ever one picked here.
export function PlaceSearch({ onPick, onCancel }: { onPick: (p: Place) => void; onCancel?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      setStatus("Searching…");
      searchPlaces(q)
        .then((found) => {
          if (!alive) return;
          setResults(found);
          setStatus(found.length ? null : "No places match that.");
        })
        .catch(() => alive && setStatus("Couldn't search right now."));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <p className="m-0 text-13 text-muted">Which town should the weather and local news follow?</p>
      <label className="flex h-10 items-center gap-[10px] rounded-[12px] border border-line bg-panel2 px-3 text-muted focus-within:border-accent">
        <Icon name="search" size={15} stroke={1.9} />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) onPick(results[0]);
            if (e.key === "Escape" && onCancel) onCancel();
          }}
          placeholder="Search for a town or city"
          aria-label="Search for a town or city"
          className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text"
        />
      </label>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" role="list">
        {results.map((p, i) => (
          <button
            key={`${p.latitude},${p.longitude}`}
            type="button"
            role="listitem"
            onClick={() => onPick(p)}
            className={clsx("flex flex-col rounded-[10px] px-3 py-1.5 text-left hover:bg-panel2", i === 0 && "bg-panel2/60")}
          >
            <span className="text-13 font-medium">{p.name}</span>
            {p.region && <span className="text-12 text-muted">{p.region}</span>}
          </button>
        ))}
        {status && <span className="px-1 text-12 text-muted">{status}</span>}
      </div>
      {onCancel && (
        <button type="button" onClick={onCancel} className="self-start text-12 text-muted hover:text-text hover:underline">
          Cancel
        </button>
      )}
    </div>
  );
}
