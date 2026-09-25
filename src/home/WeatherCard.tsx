import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "../lib/SettingsContext";
import { Icon } from "../ui/icons";
import { Card, Empty } from "./parts";
import { shortPlace, temperatureUnit, weatherPlace, type Place } from "./prefs";
import { cachedWeather, dayName, describe, loadWeather, searchPlaces, weatherIsFresh, type Weather } from "./weather";
import type { HomeData } from "./useHome";

const REFRESH = 30 * 60_000;

// Sun and clear skies in warn, rain and snow in the live color, the rest muted.
function toneOf(code: number): string {
  if (code <= 2) return "var(--warn)";
  if (code === 3 || code === 45 || code === 48) return "var(--muted)";
  return "var(--accent2)";
}

// Open-Meteo weather for the chosen place (Checkpoint's weather.ts): now,
// wind, humidity and rain, and the next three days.
export default function WeatherCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const place = useMemo(() => weatherPlace(settings), [settings.WeatherLocation]);
  const unit = temperatureUnit(settings);
  const [picking, setPicking] = useState(false);
  const [weather, setWeather] = useState<Weather | undefined>(() => (place ? cachedWeather(place, unit) : undefined));
  const [error, setError] = useState<string | null>(null);

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
  }, [place, unit, home.sample]);

  const w = home.sample ? home.sample.weather(unit) : place ? weather : undefined;
  const label = home.sample ? "Yarmouth Port, MA" : place ? shortPlace(place) : null;
  const style = { background: "radial-gradient(420px 220px at 100% 0%, var(--glow), transparent 70%), var(--panel)" };

  const choose = (p: Place) => {
    update({ WeatherLocation: p });
    setWeather(cachedWeather(p, unit));
    setPicking(false);
  };

  return (
    <Card label="Weather" className="gap-[14px] px-6 py-[22px]" style={style}>
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="m-0 text-16 font-semibold">Weather</h2>
          {label && !picking && (
            <button type="button" onClick={() => setPicking(true)} title="Change place" className="truncate text-left text-12 text-muted hover:text-text hover:underline">
              {label}
            </button>
          )}
        </div>
        {!picking && (
          <button
            type="button"
            onClick={() => update({ TemperatureUnit: unit === "F" ? "C" : "F" })}
            aria-label={unit === "F" ? "Show Celsius" : "Show Fahrenheit"}
            className="h-[30px] rounded-[9px] border border-line px-[10px] font-mono text-12 text-muted transition-colors hover:text-text"
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

function Forecast({ w }: { w: Weather }) {
  const r = Math.round;
  const now = describe(w.current.code, w.current.isDay);
  const today = w.days[0];
  const next = w.days.slice(1, 4);
  const lo = Math.min(...next.map((d) => d.low));
  const span = Math.max(1, Math.max(...next.map((d) => d.high)) - lo);
  return (
    <>
      <div className="flex items-center gap-4">
        <span className="flex" style={{ color: toneOf(w.current.code) }}>
          <now.Icon size={54} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <div className="font-head text-58 leading-none font-bold tracking-[-0.03em]">{r(w.current.temperature)}°</div>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-14 font-medium">{now.label}</span>
          {today && (
            <span className="font-mono text-12 text-muted">
              H {r(today.high)}° · L {r(today.low)}°
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-2 text-12">
        <Stat label="Wind" value={`${r(w.current.wind)} ${w.unit === "F" ? "mph" : "km/h"}`} />
        <Stat label="Humidity" value={`${r(w.current.humidity)}%`} />
        <Stat label="Rain" value={today?.rain != null ? `${today.rain}%` : "—"} />
      </div>
      <div className="flex flex-col gap-1.5">
        {next.map((d, i) => {
          const sky = describe(d.code);
          return (
            <div key={d.date} className="flex h-[26px] items-center gap-3 text-13">
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
          );
        })}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-1 flex-col gap-0.5 rounded-[10px] bg-panel2 px-[10px] py-2">
      <span className="text-muted">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}

// Search Open-Meteo's places by name. Project Life never looks up where the
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
