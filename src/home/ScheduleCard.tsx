import clsx from "clsx";
import { CalendarDays } from "lucide-react";
import { Fragment } from "react";
import { menuPoint } from "../components/ContextMenu";
import { useNotes } from "../notes/NotesContext";
import type { Screen } from "../shell/nav";
import { eventMenu } from "./menus";
import { Card, CardHeader, CardLink, clock, Empty } from "./parts";
import type { HomeData } from "./useHome";

// Today's timeline, with a "now" line between what's done and what's next.
// Past events dim; the next one is highlighted; later ones get the live color.
export default function ScheduleCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const { openMenu, activate } = useNotes();
  const now = home.now;
  const events = home.events.filter((e) => e.start.toDateString() === now.toDateString()).sort((a, b) => a.start.getTime() - b.start.getTime());
  const nextIndex = events.findIndex((e) => e.end > now);
  // The now line goes before the first event that hasn't started.
  const lineBefore = events.findIndex((e) => e.start > now);
  const nowLine = (
    <div className="flex h-[26px] items-center gap-[10px]" aria-label={`Now, ${clock(now)}`}>
      <span className="min-w-16 font-mono text-11 tracking-[0.1em] whitespace-nowrap text-accent2">NOW {clock(now).slice(0, -3)}</span>
      <span className="h-2 w-2 rounded-full bg-accent2" />
      <span className="h-[1.5px] flex-1 bg-accent2" />
    </div>
  );

  return (
    <Card
      id="schedule"
      menu={[{ label: "Open Schedule", icon: <CalendarDays size={13} />, onSelect: () => onNavigate("schedule") }]}
      label="Schedule"
      className="gap-[18px] p-6"
    >
      <CardHeader title="Schedule">
        <CardLink onClick={() => onNavigate("schedule")}>View week</CardLink>
      </CardHeader>
      <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {events.map((e, i) => {
          const past = e.end <= now;
          const next = i === nextIndex;
          return (
            <Fragment key={e.id}>
              {i === lineBefore && nowLine}
              <div
                onContextMenu={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                  const { x, y } = menuPoint(ev);
                  openMenu(x, y, eventMenu(e, Boolean(home.sample), (name) => void activate(name)));
                }}
                className={clsx("flex min-h-[58px] items-center gap-[10px] rounded-[14px] py-2 pr-[10px]", next && "bg-accent-soft")}
              >
                <div className={clsx("min-w-16 shrink-0 pr-0.5 text-right font-mono text-12 whitespace-nowrap", next ? "text-accent" : "text-muted")}>{clock(e.start)}</div>
                <span className={clsx("mx-1 my-1 w-1 self-stretch rounded-[4px]", past ? "bg-panel2" : next ? "bg-accent" : "bg-accent2")} />
                <div className="flex min-w-0 flex-col gap-[3px]">
                  <div className={clsx("truncate text-14 font-medium", past ? "text-muted" : "text-text")}>{e.title}</div>
                  {e.meta && <div className="truncate text-12 text-muted">{e.meta}</div>}
                </div>
              </div>
            </Fragment>
          );
        })}
        {(lineBefore === -1 || events.length === 0) && nowLine}
        {events.length === 0 && <Empty className="mt-2">Nothing on your schedule today. Press Ctrl+E to add an event.</Empty>}
      </div>
    </Card>
  );
}
