import clsx from "clsx";
import { CheckSquare } from "lucide-react";
import { go } from "../shell/go";
import { openCount, todaysTasks } from "../tasks/model";
import { ProgressRing } from "../ui/Progress";
import { Card, isMicro, isTiny, useCardSize } from "./parts";
import type { HomeData } from "./useHome";

// The ring at its biggest, and the least room the words need beside it.
const RING = 132;
const WORDS = 104;

// Today: a ring for today's tasks done, and what's left of the day. The card
// measures itself and fits what it can: the ring as big as there's room for
// (up to 132px), with the day's three counts beside it, or one line of them
// beside or under it, or nothing but the ring.
export default function TodayCard({ home }: { home: HomeData }) {
  const today = todaysTasks(home.tasks, home.now);
  const total = today.length;
  const done = total - openCount(today);
  const pct = total ? done / total : 0;
  const habitsDone = home.habits.filter((h) => h.doneToday).length;
  const eventsLeft = home.events.filter((e) => e.end > home.now && e.start.toDateString() === home.now.toDateString()).length;

  const [ref, size] = useCardSize();
  // Until it's measured: the size it first comes at.
  const box = size.width ? size : { width: 343, height: 252 };
  const pad = isMicro(box) ? 12 : isTiny(box) ? 16 : 26;
  const W = box.width - 2 - pad * 2;
  const H = box.height - 2 - pad * 2;
  const beside = W - Math.min(H, RING) - 24 >= WORDS;
  const under = !beside && Math.min(W, RING, H - 26) >= 64;
  const ring = Math.max(40, Math.floor(beside ? Math.min(H, RING) : under ? Math.min(W, RING, H - 26) : Math.min(W, H, RING)));
  const stroke = Math.max(5, Math.round(ring * 0.09));
  const words = beside ? (H >= 110 ? "all" : H >= 80 ? "lines" : "one") : under ? "one" : "none";

  return (
    <Card
      ref={ref}
      id="today"
      menu={[{ label: "Open Tasks", icon: <CheckSquare size={13} />, onSelect: () => go("tasks") }]}
      label="Today"
      // A small card's ring sits at the top, like the other small cards' content.
      className={clsx("items-center p-[26px]", beside ? "flex-row! gap-6" : isTiny(box) ? "gap-2.5" : "justify-center gap-2.5")}
    >
      <ProgressRing value={pct} size={ring} radius={ring / 2 - stroke / 2 - Math.round(ring * 0.045)} stroke={stroke} label={`${done} of ${total} of today's tasks done`}>
        <span className={clsx("font-mono font-medium", ring >= 120 ? "text-26" : ring >= 96 ? "text-22" : ring >= 64 ? "text-16" : "text-12")}>{Math.round(pct * 100)}%</span>
        {ring >= 96 && <span className={clsx("tracking-[0.08em] text-muted", ring >= 120 ? "text-11" : "text-10")}>DONE</span>}
      </ProgressRing>
      {words === "one" && (
        <div className="max-w-full truncate text-12 text-muted">
          <span className="font-mono text-accent">
            {done}/{total}
          </span>{" "}
          tasks
          {home.habits.length > 0 && (
            <>
              {" · "}
              <span className="font-mono text-accent2">
                {habitsDone}/{home.habits.length}
              </span>{" "}
              habits
            </>
          )}
        </div>
      )}
      {(words === "all" || words === "lines") && (
        <div className="flex min-w-0 flex-col gap-3">
          {words === "all" && <div className="font-mono text-12 tracking-[0.14em] text-muted">TODAY</div>}
          <div className="flex flex-col gap-2 text-14">
            <Line value={`${done}/${total}`} color="text-accent" label="tasks" />
            <Line value={home.habits.length ? `${habitsDone}/${home.habits.length}` : "—"} color="text-accent2" label="habits" />
            <Line value={home.events.length ? String(eventsLeft) : "—"} color="text-warn" label="events left" />
          </div>
        </div>
      )}
    </Card>
  );
}

function Line({ value, color, label }: { value: string; color: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-mono font-medium ${color}`}>{value}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}
