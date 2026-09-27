import clsx from "clsx";
import { Copy, ListFilter, RefreshCw, SquareArrowOutUpRight, Star, StarOff } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { openUrl } from "../lib/api";
import { clockText, dateText, locale } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";
import { Chip } from "../ui/Chip";
import { toast } from "../ui/Toast";
import { Card, Empty, useRowMenu } from "./parts";
import {
  cachedLeague,
  leagueIsFresh,
  leagueName,
  leagues,
  liveText,
  loadLeague,
  orderGames,
  scoreLine,
  scored,
  type Game,
  type LeagueResult,
  type Team,
} from "./sports";
import type { HomeData } from "./useHome";

// The card checks this often; each league is only fetched again once its
// scores are stale (sports.ts: 30 seconds while a game is on, else 5 minutes).
const TICK = 30_000;
const DAY = 86_400_000;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysFrom = (now: Date, t: number) => Math.round((midnight(new Date(t)) - midnight(now)) / DAY);

// "Today", "Tomorrow", "Yesterday", else "Sat, Oct 3" (the chosen date format).
function dayText(t: number, now: Date): string {
  const n = daysFrom(now, t);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return dateText(new Date(t), now);
}

// What a game that hasn't been played says instead of a score: its start
// ("7:00 PM", with the weekday when it isn't today), or ESPN's status when
// it isn't simply scheduled ("Rain Delay", "Postponed").
function whenText(g: Game, now: Date): string {
  if (g.state !== "pre" || !g.scheduled) return g.detail || "Final";
  const d = new Date(g.start);
  const time = clockText(d);
  return daysFrom(now, g.start) === 0 ? time : `${d.toLocaleDateString(locale(), { weekday: "short" })} ${time}`;
}

// Scores from ESPN for the chosen leagues: followed teams first, then live
// games, upcoming ones and finished ones. A row opens the game on ESPN.
export default function SportsCard({ home }: { home: HomeData }) {
  const { settings, update } = useSettings();
  const openMenu = useRowMenu("sports", "Sports");

  // In the card's own order, whatever order settings lists them in.
  const chosen = leagues.filter((l) => (settings.SportsLeagues ?? leagues.map((x) => x.id)).includes(l.id));
  const picked = chosen.some((l) => l.id === settings.SportsLeague) ? settings.SportsLeague! : "all";
  const shownIds = picked === "all" ? chosen.map((l) => l.id) : [picked];
  // Settings objects are replaced on every change; this only changes with the leagues.
  const key = shownIds.join(",");
  const shown = useMemo(() => (key ? key.split(",") : []), [key]);
  const followed = useMemo(() => new Set(settings.SportsTeams ?? []), [settings.SportsTeams]);

  const [results, setResults] = useState<Record<string, LeagueResult | undefined>>(() => Object.fromEntries(leagues.map((l) => [l.id, cachedLeague(l.id)])));

  const fetchLeague = (league: string, alive: () => boolean) =>
    void loadLeague(league).then((r) => alive() && setResults((all) => ({ ...all, [league]: r })));

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      for (const league of shown) {
        const cached = cachedLeague(league);
        if (cached) setResults((all) => (all[league] === cached ? all : { ...all, [league]: cached }));
        if (!leagueIsFresh(cached)) fetchLeague(league, () => alive);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, TICK);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [shown]);

  const isFollowed = (league: string, t: Team) => followed.has(`${league}:${t.abbr}`);
  const games = orderGames(
    shown.flatMap((l) => results[l]?.games ?? []),
    (g) => isFollowed(g.league, g.away) || isFollowed(g.league, g.home),
    home.now,
  );
  const pending = shown.some((l) => !results[l]);
  const failed = shown.length > 0 && shown.every((l) => results[l]?.error && !results[l]?.games);
  const now = home.now;

  const follow = (league: string, t: Team) => {
    const id = `${league}:${t.abbr}`;
    const before = settings.SportsTeams ?? [];
    if (before.includes(id)) {
      update({ SportsTeams: before.filter((x) => x !== id) });
      toast(`Unfollowed the ${t.short}`, () => update({ SportsTeams: before }));
    } else update({ SportsTeams: [...before, id] });
  };

  const copyScore = (g: Game) => {
    navigator.clipboard.writeText(scoreLine(g, whenText(g, new Date()))).then(
      () => toast("Copied the score"),
      () => toast("Couldn't copy the score"),
    );
  };

  const gameMenu = (g: Game): MenuItem[] => [
    { label: "Open on ESPN", icon: <SquareArrowOutUpRight size={13} />, onSelect: () => void openUrl(g.link) },
    { type: "separator" },
    ...[g.away, g.home].map<MenuItem>((t) =>
      isFollowed(g.league, t)
        ? { label: `Unfollow ${t.short}`, icon: <StarOff size={13} />, onSelect: () => follow(g.league, t) }
        : { label: `Follow ${t.short}`, icon: <Star size={13} />, onSelect: () => follow(g.league, t) },
    ),
    { type: "separator" },
    { label: "Copy score", icon: <Copy size={13} />, onSelect: () => copyScore(g) },
  ];

  const toggleLeague = (id: string) => {
    const on = chosen.map((l) => l.id);
    update({ SportsLeagues: on.includes(id) ? on.filter((x) => x !== id) : leagues.map((l) => l.id).filter((x) => x === id || on.includes(x)) });
  };

  const menu: MenuItem[] = [
    {
      label: "Leagues",
      icon: <ListFilter size={13} />,
      // At least one stays on, or the card would have nothing to show.
      children: leagues.map<MenuItem>((l) => {
        const on = chosen.some((c) => c.id === l.id);
        return { label: l.name, checked: on, disabled: on && chosen.length === 1, onSelect: () => toggleLeague(l.id) };
      }),
    },
    {
      label: "Refresh now",
      icon: <RefreshCw size={13} />,
      onSelect: () => {
        for (const league of shown) fetchLeague(league, () => true);
      },
    },
  ];

  let empty: string | null = null;
  if (!games.length) {
    if (pending) empty = "Loading scores…";
    else if (failed) empty = "Couldn't load scores. It tries again in a few minutes.";
    else if (picked !== "all") empty = `No ${leagueName(picked)} games scheduled right now.`;
    else empty = "No games scheduled right now.";
  }

  return (
    <Card id="sports" menu={menu} label="Sports" className="gap-[14px] px-6 py-[22px]">
      {/* On a narrow card the pills drop below the title, and scroll sideways
          if they still don't fit. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="m-0 shrink-0 text-16 font-semibold">Sports</h2>
        {chosen.length > 1 && (
          <div role="group" aria-label="Leagues" className="flex min-w-0 gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {[{ id: "all", name: "All" }, ...chosen].map((l) => (
              <Chip key={l.id} variant="pill" selected={l.id === picked} onClick={() => update({ SportsLeague: l.id })}>
                {l.name}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {empty ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="@container -mx-3 min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-x-3 @xl:grid-cols-2">
            {games.flatMap((g, i) => {
              // A day label wherever the day changes, except before today's
              // games at the top.
              const day = midnight(new Date(g.start));
              const changed = i === 0 ? daysFrom(now, g.start) !== 0 : day !== midnight(new Date(games[i - 1].start));
              const row = (
                <GameRow
                  key={g.key}
                  game={g}
                  now={now}
                  showLeague={picked === "all" && chosen.length > 1}
                  followed={(t) => isFollowed(g.league, t)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const { x, y } = menuPoint(e);
                    openMenu(x, y, gameMenu(g));
                  }}
                />
              );
              if (!changed) return [row];
              const label = (
                <div key={`${g.key}-day`} className="col-span-full flex h-7 items-center px-3 font-mono text-11 tracking-[0.12em] text-muted uppercase">
                  {dayText(g.start, now)}
                </div>
              );
              return [label, row];
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

interface RowProps {
  game: Game;
  now: Date;
  showLeague: boolean;
  followed: (t: Team) => boolean;
  onContextMenu: (e: MouseEvent<HTMLButtonElement>) => void;
}

// Away team over home team, like a scoreboard, with the status on the right.
function GameRow({ game: g, now, showLeague, followed, onContextMenu }: RowProps) {
  const withScore = scored(g);
  const tag = showLeague ? leagueName(g.league) : null;
  const label = `${g.away.name} at ${g.home.name}, ${withScore ? scoreLine(g, "") : whenText(g, now)}`;
  return (
    <button
      type="button"
      onClick={() => void openUrl(g.link)}
      onContextMenu={onContextMenu}
      aria-label={label}
      title="Open on ESPN"
      className="@container flex min-w-0 items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-panel2"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {[g.away, g.home].map((t, i) => (
          <TeamLine key={i} team={t} final={g.state === "post" && withScore} showScore={withScore} followed={followed(t)} />
        ))}
      </span>
      <span className="flex w-[96px] shrink-0 flex-col items-end gap-1 text-right text-12">
        {g.state === "in" ? (
          <span className="flex max-w-full items-center gap-1.5 font-medium text-text">
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-danger" />
            <span className="truncate">{liveText(g)}</span>
          </span>
        ) : (
          <span className={clsx("max-w-full truncate", g.state === "pre" && g.scheduled ? "font-medium text-text" : "text-muted")}>{whenText(g, now)}</span>
        )}
        {(tag || (g.state === "pre" && g.network)) && (
          <span className="max-w-full truncate text-11 text-muted">
            {tag && <span className="font-mono">{tag}</span>}
            {tag && g.state === "pre" && g.network && " · "}
            {g.state === "pre" && g.network}
          </span>
        )}
      </span>
    </button>
  );
}

// Logo, abbreviation (the short name when the row has room) and score. When
// the game is over, the winner's score is bold and the loser's dimmer.
function TeamLine({ team: t, final, showScore, followed }: { team: Team; final: boolean; showScore: boolean; followed: boolean }) {
  const [broken, setBroken] = useState(false);
  const lost = final && !t.winner;
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {t.logo && !broken && <img src={t.logo} alt="" onError={() => setBroken(true)} className="h-5 w-5 object-contain" />}
      </span>
      <span title={t.name} className={clsx("min-w-0 flex-1 truncate text-13 font-medium", followed ? "text-accent" : lost ? "text-muted" : "text-text")}>
        <span className="@[20rem]:hidden">{t.abbr}</span>
        <span className="hidden @[20rem]:inline">{t.short}</span>
      </span>
      {showScore && (
        <span className={clsx("shrink-0 text-14 tabular-nums", final && t.winner ? "font-bold text-text" : lost ? "text-muted" : "font-semibold text-text")}>
          {t.score ?? "0"}
        </span>
      )}
    </span>
  );
}
