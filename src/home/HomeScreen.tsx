import { Lock, LockOpen } from "lucide-react";
import { dayLabel, greeting, timeLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import type { Screen } from "../shell/nav";
import Capture from "./Capture";
import GoalsCard from "./GoalsCard";
import HabitsCard from "./HabitsCard";
import HomeGrid from "./HomeGrid";
import NewsCard from "./NewsCard";
import NotesCard from "./NotesCard";
import ScheduleCard from "./ScheduleCard";
import SportsCard from "./SportsCard";
import StocksCard from "./StocksCard";
import TasksCard from "./TasksCard";
import TodayCard from "./TodayCard";
import UpNext from "./UpNext";
import { useHome } from "./useHome";
import WeatherCard from "./WeatherCard";

interface Props {
  onNavigate: (screen: Screen) => void;
}

// Home (Main.dc.html): a bit of everything. The cards start in the mockup's
// three rows and can be moved and resized (HomeGrid.tsx); the page scrolls
// when they don't fit.
export default function HomeScreen({ onNavigate }: Props) {
  const home = useHome();
  const { settings, update } = useSettings();
  const locked = settings.HomeLocked === true;
  const name = settings.DisplayName.trim();
  // Settings → Home screen can hide any card; the rest spread out.
  const hidden = new Set(settings.HiddenCards ?? []);
  const show = (id: string) => !hidden.has(id);
  const hello = settings.Greeting === "hey" ? "Hey" : greeting(home.now);

  return (
    <main
      className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-10 py-8"
      style={{ background: "radial-gradient(900px 520px at 88% -12%, var(--glow), transparent 62%), var(--bg)" }}
    >
      <header className="flex items-end justify-between gap-8">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="font-mono text-12 tracking-[0.14em] text-muted">
            {dayLabel(home.now)} · {timeLabel(home.now)}
          </div>
          {settings.Greeting !== "off" && (
            <h1 className="m-0 font-head text-50 leading-[1.05] font-bold tracking-[-0.02em]">
              {hello}
              {name ? (
                <>
                  , <span className="text-accent">{name}.</span>
                </>
              ) : (
                "."
              )}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Capture />
          <button
            type="button"
            aria-pressed={locked}
            aria-label={locked ? "Unlock the layout" : "Lock the layout"}
            title={locked ? "Cards are locked. Unlock to move and resize them" : "Lock the cards where they are"}
            onClick={() => update({ HomeLocked: !locked })}
            className={
              locked
                ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-transparent bg-accent-soft text-accent"
                : "flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] border border-line bg-panel text-muted hover:text-text"
            }
          >
            {locked ? <Lock size={18} strokeWidth={2} /> : <LockOpen size={18} strokeWidth={2} />}
          </button>
        </div>
      </header>

      <HomeGrid
        cards={[
          { id: "up", node: <UpNext home={home} onNavigate={onNavigate} /> },
          { id: "today", node: <TodayCard home={home} /> },
          { id: "schedule", node: <ScheduleCard home={home} onNavigate={onNavigate} /> },
          { id: "tasks", node: <TasksCard home={home} /> },
          { id: "goals", node: <GoalsCard home={home} onNavigate={onNavigate} /> },
          { id: "habits", node: <HabitsCard home={home} onNavigate={onNavigate} /> },
          { id: "notes", node: <NotesCard home={home} onNavigate={onNavigate} /> },
          { id: "news", node: <NewsCard home={home} /> },
          { id: "weather", node: <WeatherCard home={home} /> },
          { id: "sports", node: <SportsCard home={home} /> },
          { id: "stocks", node: <StocksCard home={home} /> },
        ].filter((c) => show(c.id))}
      />
    </main>
  );
}
