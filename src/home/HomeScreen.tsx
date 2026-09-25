import type { ReactNode } from "react";
import { dayLabel, greeting, timeLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import type { Screen } from "../shell/nav";
import Capture from "./Capture";
import GoalsCard from "./GoalsCard";
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
        <Capture home={home} focusSignal={captureSignal} />
      </header>

      <Row height={208} cards={[show("up") && { span: 2, node: <UpNext home={home} onNavigate={onNavigate} /> }, show("today") && { span: 1, node: <TodayCard home={home} /> }]} />

      <Row
        height={560}
        cards={[
          show("schedule") && { span: 1, node: <ScheduleCard home={home} onNavigate={onNavigate} /> },
          (show("tasks") || show("goals")) && {
            span: 1,
            column: true,
            alone: !(show("tasks") && show("goals")),
            node: (
              <>
                {show("tasks") && <TasksCard home={home} />}
                {show("goals") && <GoalsCard home={home} onNavigate={onNavigate} />}
              </>
            ),
          },
          (show("habits") || show("notes")) && {
            span: 1,
            column: true,
            alone: !(show("habits") && show("notes")),
            node: (
              <>
                {show("habits") && <HabitsCard home={home} onNavigate={onNavigate} />}
                {show("notes") && <NotesCard home={home} onNavigate={onNavigate} />}
              </>
            ),
          },
        ]}
      />

      <Row height={324} cards={[show("news") && { span: 2, node: <NewsCard home={home} /> }, show("weather") && { span: 1, node: <WeatherCard home={home} /> }]} />
    </main>
  );
}

interface RowCard {
  span: number;
  // Two cards stacked in one column; one left alone fills it.
  column?: boolean;
  alone?: boolean;
  node: ReactNode;
}

// A row of cards on the three-column grid. When some are hidden, the ones
// left take their space; a row with none left isn't shown.
function Row({ height, cards }: { height: number; cards: (RowCard | false)[] }) {
  const shown = cards.filter((c): c is RowCard => Boolean(c));
  if (!shown.length) return null;
  const total = shown.reduce((n, c) => n + c.span, 0);
  // The first card takes up whatever the hidden ones left.
  const spans = shown.map((c, i) => (i === 0 ? c.span + 3 - total : c.span));
  return (
    <div className="grid shrink-0 grid-cols-3 gap-5" style={{ height }}>
      {shown.map((c, i) => (
        <div key={i} className={c.column && !c.alone ? "flex min-h-0 min-w-0 flex-col gap-5" : c.column ? "flex min-h-0 min-w-0 flex-col *:flex-1" : "flex min-h-0 min-w-0 *:flex-1"} style={{ gridColumn: `span ${spans[i]}` }}>
          {c.node}
        </div>
      ))}
    </div>
  );
}
