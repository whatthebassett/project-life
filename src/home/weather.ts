// Weather from Open-Meteo (free, no key), fetched through Rust like the news.
// The place is only ever one that was searched for and chosen; Project Life never
// looks up where the computer is.
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudMoonRain,
  CloudRain,
  CloudRainWind,
  CloudSnow,
  CloudSun,
  CloudSunRain,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { fetchText } from "../lib/api";
import type { Place } from "./prefs";

// A reading at one time of day, for the detailed forecast.
export interface DayPart {
  label: "Morning" | "Afternoon" | "Evening";
  // The place's local time, "2026-09-24T09:00".
  time: string;
  temperature: number;
  code: number;
  isDay: boolean;
  rain: number | null;
}

export interface Day {
  // The place's own calendar day, "2026-09-24".
  date: string;
  code: number;
  high: number;
  low: number;
  feelsHigh: number;
  // Chance (%) and amount (mm, or inches for °F).
  rain: number | null;
  precipitation: number;
  // Strongest wind and gusts (km/h, or mph for °F), and where it mostly comes from (degrees).
  wind: number;
  gusts: number;
  windFrom: number;
  uv: number | null;
  parts: DayPart[];
}

export interface Weather {
  unit: "C" | "F";
  fetchedAt: number;
  // `time` is the place's local time now, "2026-09-24T10:15".
  current: { time: string; temperature: number; feelsLike: number; code: number; isDay: boolean; wind: number; humidity: number };
  // Today first.
  days: Day[];
}

interface Forecast {
  error?: boolean;
  reason?: string;
  current?: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    is_day: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
  };
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    apparent_temperature_max: number[];
    precipitation_probability_max: (number | null)[];
    precipitation_sum: (number | null)[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    uv_index_max: (number | null)[];
  };
  hourly?: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: (number | null)[];
    is_day: number[];
  };
}

// The hours that stand for each part of the day.
const partHours: [DayPart["label"], string][] = [
  ["Morning", "09:00"],
  ["Afternoon", "15:00"],
  ["Evening", "21:00"],
];

const staleAfter = 30 * 60_000;
const cache = new Map<string, Weather>();
const keyOf = (place: Place, unit: "C" | "F") => `${place.latitude.toFixed(3)},${place.longitude.toFixed(3)},${unit}`;

export const cachedWeather = (place: Place, unit: "C" | "F") => cache.get(keyOf(place, unit));
// Fresh: fetched recently, and today (after midnight the forecast's "Today"
// would be yesterday).
export const weatherIsFresh = (w: Weather | undefined) =>
  !!w && Date.now() - w.fetchedAt < staleAfter && new Date(w.fetchedAt).toDateString() === new Date().toDateString();

export async function loadWeather(place: Place, unit: "C" | "F"): Promise<Weather> {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m",
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "apparent_temperature_max",
      "precipitation_probability_max",
      "precipitation_sum",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
      "wind_direction_10m_dominant",
      "uv_index_max",
    ].join(","),
    hourly: "temperature_2m,weather_code,precipitation_probability,is_day",
    timezone: "auto",
    forecast_days: "5",
  });
  if (unit === "F") {
    params.set("temperature_unit", "fahrenheit");
    params.set("wind_speed_unit", "mph");
    params.set("precipitation_unit", "inch");
  }
  const data = JSON.parse(await fetchText(`https://api.open-meteo.com/v1/forecast?${params}`)) as Forecast;
  if (data.error || !data.current || !data.daily) throw data.reason ?? "The weather service sent something unexpected.";
  const c = data.current;
  const d = data.daily;
  const h = data.hourly;
  // Hourly readings by local time, to pick out morning, afternoon and evening.
  const hourIndex = new Map((h?.time ?? []).map((t, i) => [t, i]));
  const partsOf = (date: string): DayPart[] =>
    partHours.flatMap(([label, hour]) => {
      const time = `${date}T${hour}`;
      const i = hourIndex.get(time);
      if (!h || i === undefined) return [];
      return [{ label, time, temperature: h.temperature_2m[i], code: h.weather_code[i], isDay: h.is_day[i] === 1, rain: h.precipitation_probability[i] ?? null }];
    });
  const weather: Weather = {
    unit,
    fetchedAt: Date.now(),
    current: {
      time: c.time,
      temperature: c.temperature_2m,
      feelsLike: c.apparent_temperature,
      code: c.weather_code,
      isDay: c.is_day === 1,
      wind: c.wind_speed_10m,
      humidity: c.relative_humidity_2m,
    },
    days: d.time.map((date, i) => ({
      date,
      code: d.weather_code[i],
      high: d.temperature_2m_max[i],
      low: d.temperature_2m_min[i],
      feelsHigh: d.apparent_temperature_max?.[i] ?? d.temperature_2m_max[i],
      rain: d.precipitation_probability_max[i] ?? null,
      precipitation: d.precipitation_sum?.[i] ?? 0,
      wind: d.wind_speed_10m_max?.[i] ?? 0,
      gusts: d.wind_gusts_10m_max?.[i] ?? 0,
      windFrom: d.wind_direction_10m_dominant?.[i] ?? 0,
      uv: d.uv_index_max?.[i] ?? null,
      parts: partsOf(date),
    })),
  };
  cache.set(keyOf(place, unit), weather);
  return weather;
}

interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: "8", language: "en", format: "json" });
  const data = JSON.parse(await fetchText(`https://geocoding-api.open-meteo.com/v1/search?${params}`)) as { results?: GeoResult[] };
  return (data.results ?? []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter((p) => p && p !== r.name).join(", ") || undefined,
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

// WMO weather codes (what Open-Meteo reports) in plain words, with an icon.
export function describe(code: number, isDay = true): { label: string; Icon: LucideIcon } {
  const sky = (day: LucideIcon, night: LucideIcon) => (isDay ? day : night);
  switch (code) {
    case 0:
      return { label: "Clear", Icon: sky(Sun, Moon) };
    case 1:
      return { label: "Mostly clear", Icon: sky(Sun, Moon) };
    case 2:
      return { label: "Partly cloudy", Icon: sky(CloudSun, CloudMoon) };
    case 3:
      return { label: "Overcast", Icon: Cloud };
    case 45:
    case 48:
      return { label: "Fog", Icon: CloudFog };
    case 51:
      return { label: "Light drizzle", Icon: CloudDrizzle };
    case 53:
      return { label: "Drizzle", Icon: CloudDrizzle };
    case 55:
      return { label: "Heavy drizzle", Icon: CloudDrizzle };
    case 56:
    case 57:
      return { label: "Freezing drizzle", Icon: CloudDrizzle };
    case 61:
      return { label: "Light rain", Icon: CloudRain };
    case 63:
      return { label: "Rain", Icon: CloudRain };
    case 65:
      return { label: "Heavy rain", Icon: CloudRainWind };
    case 66:
    case 67:
      return { label: "Freezing rain", Icon: CloudHail };
    case 71:
      return { label: "Light snow", Icon: CloudSnow };
    case 73:
      return { label: "Snow", Icon: CloudSnow };
    case 75:
      return { label: "Heavy snow", Icon: CloudSnow };
    case 77:
      return { label: "Snow grains", Icon: Snowflake };
    case 80:
      return { label: "Light showers", Icon: sky(CloudSunRain, CloudMoonRain) };
    case 81:
      return { label: "Showers", Icon: sky(CloudSunRain, CloudMoonRain) };
    case 82:
      return { label: "Heavy showers", Icon: CloudRainWind };
    case 85:
    case 86:
      return { label: "Snow showers", Icon: CloudSnow };
    case 95:
      return { label: "Thunderstorms", Icon: CloudLightning };
    case 96:
    case 99:
      return { label: "Thunderstorms with hail", Icon: CloudLightning };
    default:
      return { label: "Unknown", Icon: Cloud };
  }
}

// "Today", then short weekday names, for the place's own calendar days.
export function dayName(date: string, index: number): string {
  if (index === 0) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short" });
}

export const placeLabel = (p: Place) => (p.region ? `${p.name}, ${p.region}` : p.name);

// "Tomorrow", then the weekday, for the detailed forecast's cards.
export function longDayName(date: string, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "long" });
}

// Where the wind comes from, in words: "north-northeast".
function windFrom(degrees: number): string {
  const points = [
    "north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast", "southeast", "south-southeast",
    "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest",
  ];
  return points[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

// The UV index as the World Health Organization names its bands.
function uvBand(uv: number): string {
  if (uv < 3) return "low";
  if (uv < 6) return "moderate";
  if (uv < 8) return "high";
  if (uv < 11) return "very high";
  return "extreme";
}

const isSnow = (code: number) => (code >= 71 && code <= 77) || code === 85 || code === 86;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// A written forecast for one day, in the style of a weather service's text
// forecast: the sky through the day, temperatures, wind, rain, and UV when
// it matters. `index` 0 is today, which only talks about what's still ahead.
export function forecastText(d: Day, w: Weather, index: number): string {
  const r = Math.round;
  const speed = w.unit === "F" ? "mph" : "km/h";
  const out: string[] = [];
  const ahead = index === 0 ? d.parts.filter((p) => p.time >= w.current.time) : d.parts;

  // The sky, and how it changes: "Clear in the morning, then showers in the evening."
  const changes: { label: string; part: string }[] = [];
  for (const p of ahead) {
    const label = describe(p.code, p.isDay).label;
    if (changes[changes.length - 1]?.label !== label) changes.push({ label, part: p.label.toLowerCase() });
  }
  // A sky that stays the same is just named; the rain sentence below says when
  // any rain is likely (the day's own code names its worst hour, which would
  // make a mostly dry day sound wet).
  out.push(
    changes.length >= 2
      ? `${changes.map((c, i) => `${i ? "then " + lower(c.label) : c.label} in the ${c.part}`).join(", ")}.`
      : `${changes[0]?.label ?? describe(d.code).label}.`,
  );

  // Temperatures. Late in the day only the night's low is still to come.
  const lateToday = index === 0 && ahead.length === 0;
  out.push(lateToday ? `Low around ${r(d.low)}° tonight.` : `High near ${r(d.high)}°, low around ${r(d.low)}°.`);
  if (!lateToday && Math.abs(d.feelsHigh - d.high) >= 4) out.push(`It will feel more like ${r(d.feelsHigh)}° at its warmest.`);

  // Wind: say so when it's light; mention gusts when they're well above the wind.
  const breezy = w.unit === "F" ? 8 : 13;
  if (d.wind < breezy) out.push("Light winds.");
  else {
    const gusty = d.gusts >= d.wind + (w.unit === "F" ? 8 : 13);
    out.push(`${upper(windFrom(d.windFrom))} wind up to ${r(d.wind)} ${speed}${gusty ? `, with gusts as high as ${r(d.gusts)} ${speed}` : ""}.`);
  }

  // Rain or snow: the chance, when, and how much.
  if (d.rain != null && d.rain >= 20) {
    const kind = isSnow(d.code) ? "snow" : "rain";
    const wet = ahead.filter((p) => (p.rain ?? 0) >= 30).map((p) => p.label.toLowerCase());
    const when = wet.length === 0 ? "" : wet.length === ahead.length && wet.length > 1 ? " throughout the day" : `, mainly in the ${wet.join(" and ")}`;
    // "0.14 inch", "1 inch", "1.09 inches"; millimetres to one place.
    const inches = Number(d.precipitation.toFixed(2));
    const amount = w.unit === "F" ? `${inches} ${inches > 1 ? "inches" : "inch"}` : `${d.precipitation.toFixed(1)} mm`;
    const much = d.precipitation > 0 ? `, around ${amount}` : "";
    out.push(`Chance of ${kind} ${d.rain}%${when}${much}.`);
  } else out.push(d.rain != null && d.rain >= 10 ? "Slight chance of rain." : "No rain expected.");

  if (d.uv != null && d.uv >= 6 && !lateToday) out.push(`UV index ${r(d.uv)}, ${uvBand(d.uv)}.`);
  return out.join(" ");
}
