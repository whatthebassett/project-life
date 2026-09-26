import { locale } from "../lib/format";
import { Check, Maximize2, Minus, Plus, RotateCcw, Target } from "lucide-react";
import { useMemo } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { logProgress, setDone } from "../goals/actions";
import { fmt, paceOn, progressOn, statusLabel, statusOf, statusStyle, type Goal } from "../goals/model";
import { useGoals } from "../goals/useGoals";
import { habitDay, hueColor } from "../habits/model";
import { rulesOf, useHabits } from "../habits/useHabits";
import { useSettings } from "../lib/SettingsContext";
import { useNotes } from "../notes/NotesContext";
import { showGoal } from "../shell/go";
import type { Screen } from "../shell/nav";
import { fromYmd } from "../tasks/dates";
import { toast } from "../ui/Toast";
import { Card, CardHeader, CardLink, Empty } from "./parts";
import type { HomeData } from "./useHome";

const SHOWN = 3;

// Open, and Log a step (number goals) or Mark done ("done or not" goals), as
// in the goal's details.
function goalMenu(g: Goal): MenuItem[] {
  const items: MenuItem[] = [{ label: "Open", icon: <Maximize2 size={13} />, onSelect: () => showGoal(g.Id) }];
  if (g.Kind === "number") {
    const step = `${fmt(g.Step)} ${g.Step === 1 ? g.Unit.replace(/s$/, "") : g.Unit}`.trim();
    items.push(
      { type: "separator" },
      { label: `Log ${step}`, icon: <Plus size={13} />, onSelect: () => logProgress(g, g.Step) },
      { label: `Take back ${step}`, icon: <Minus size={13} />, onSelect: () => logProgress(g, -g.Step) },
    );
  }
  if (g.Kind === "once") {
    items.push(
      { type: "separator" },
      g.Done
        ? { label: "Mark not done", icon: <RotateCcw size={13} />, onSelect: () => setDone(g, false) }
        : {
            label: "Mark done",
            icon: <Check size={13} />,
            // Done goals leave the card, so say so.
            onSelect: () => {
              setDone(g, true);
              toast(`Marked “${g.Title}” done`, () => setDone(g, false));
            },
          },
    );
  }
  return items;
}

// Goals on Home, under Tasks: the active ones that most need a look (the
// furthest behind an even pace first), each with its status, percent and a
// bar with the pace marker. Clicking one opens it in Goals.
export default function GoalsCard({ home, onNavigate }: { home: HomeData; onNavigate: (s: Screen) => void }) {
  const { goals, areas } = useGoals();
  const { habits } = useHabits();
  const { settings } = useSettings();
  const { openMenu } = useNotes();
  const today = habitDay(home.now, rulesOf(settings));

  const rows = useMemo(
    () =>
      goals
        .map((g) => {
          const pct = progressOn(g, habits, today);
          const pace = paceOn(g, today);
          return { g, pct, pace, status: statusOf(pct, pace) };
        })
        .filter((r) => r.pct < 100)
        .sort((a, b) => a.pct - a.pace - (b.pct - b.pace) || a.g.Due.localeCompare(b.g.Due)),
    [goals, habits, today],
  );
  const behind = rows.filter((r) => r.status === "behind").length;

  return (
    <Card id="goals" menu={[{ label: "Open Goals", icon: <Target size={13} />, onSelect: () => onNavigate("goals") }]} label="Goals" className="shrink-0 gap-2 px-6 pt-5 pb-4">
      <CardHeader title="Goals">
        <span className="flex items-center gap-3">
          {behind > 0 && <span className="text-12 text-warn">{behind} behind</span>}
          <CardLink onClick={() => onNavigate("goals")}>All goals</CardLink>
        </span>
      </CardHeader>
      {rows.slice(0, SHOWN).map(({ g, pct, pace, status }) => {
        const area = areas.find((a) => a.Id === g.Area) ?? areas[0];
        const color = hueColor(area?.Hue ?? 0);
        return (
          <button
            key={g.Id}
            type="button"
            title={`${area?.Name} · due ${fromYmd(g.Due).toLocaleDateString(locale(), { month: "short", day: "numeric" })}`}
            onClick={() => showGoal(g.Id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const { x, y } = menuPoint(e);
              openMenu(x, y, goalMenu(g));
            }}
            className="-mx-3 flex w-[calc(100%+24px)] flex-col gap-1.5 rounded-[12px] px-3 py-1.5 text-left transition-colors hover:bg-panel2"
          >
            <span className="flex w-full items-center gap-2">
              <span className="h-[7px] w-[7px] shrink-0 rounded-[2px]" style={{ background: color }} />
              <span className="min-w-0 flex-1 truncate text-14 font-medium">{g.Title}</span>
              <span className="flex h-5 shrink-0 items-center rounded-[6px] px-1.5 text-11 font-semibold" style={{ background: statusStyle[status].bg, color: statusStyle[status].fg }}>
                {statusLabel[status]}
              </span>
            </span>
            <span className="flex w-full items-center gap-3">
              <span className="relative block h-1.5 flex-1 rounded-full bg-panel2">
                <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
                <span title="Where you'd be at an even pace" className="absolute -top-[3px] -bottom-[3px] w-0.5 rounded-[2px] bg-text opacity-55" style={{ left: `${pace}%` }} />
              </span>
              <span className="w-9 shrink-0 text-right font-mono text-11 text-muted">{pct}%</span>
            </span>
          </button>
        );
      })}
      {rows.length === 0 && (
        <Empty>
          {goals.length ? "Every goal is done. Time to set a new one in " : "No goals yet. Set one in "}
          <CardLink onClick={() => onNavigate("goals")}>Goals</CardLink>.
        </Empty>
      )}
    </Card>
  );
}
