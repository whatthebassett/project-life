import { dayLabel, greeting, timeLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import type { Screen } from "../shell/nav";
import Capture from "./Capture";
import HabitsCard from "./HabitsCard";
import NewsCard from "./NewsCard";
import NotesCard from "./NotesCard";
import ScheduleCard from "./ScheduleCard";
import TasksCard from "./TasksCard";
import TodayCard from "./TodayCard";
import UpNext from "./UpNext";
import { useHome } from "./useHome";
import WeatherCard from "./WeatherCard";

interface Props {
  onNavigate: (screen: Screen) => void;
  // Bumped by Ctrl+K to focus quick capture.
  captureSignal: number;
}

// Home (Main.dc.html): a bit of everything. Three rows of cards at the
// mockup's heights; the page scrolls when the window is shorter.
export default function HomeScreen({ onNavigate, captureSignal }: Props) {
  const home = useHome();
  const { settings } = useSettings();
  const name = settings.DisplayName.trim();

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
          <h1 className="m-0 font-head text-50 leading-[1.05] font-bold tracking-[-0.02em]">
            {greeting(home.now)}
            {name ? (
              <>
                , <span className="text-accent">{name}.</span>
              </>
            ) : (
              "."
            )}
          </h1>
        </div>
        <Capture home={home} focusSignal={captureSignal} />
      </header>

      <div className="grid h-[208px] shrink-0 grid-cols-3 gap-5">
        <UpNext home={home} onNavigate={onNavigate} />
        <TodayCard home={home} />
      </div>

      <div className="grid h-[560px] shrink-0 grid-cols-3 gap-5">
        <ScheduleCard home={home} onNavigate={onNavigate} />
        <TasksCard home={home} />
        <div className="flex min-h-0 flex-col gap-5">
          <HabitsCard home={home} onNavigate={onNavigate} />
          <NotesCard home={home} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="grid h-[324px] shrink-0 grid-cols-3 gap-5">
        <NewsCard home={home} />
        <WeatherCard home={home} />
      </div>
    </main>
  );
}
