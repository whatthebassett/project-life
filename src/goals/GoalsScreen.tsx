import { locale } from "../lib/format";
import clsx from "clsx";
import { Check, Copy, FolderInput, Maximize2, Minus, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import ContextMenu, { menuPoint, type MenuItem, type MenuState } from "../components/ContextMenu";
import { hueColor, hueNames, hueSoft, type Habit } from "../habits/model";
import { rulesOf, useHabits } from "../habits/useHabits";
import { habitDay } from "../habits/model";
import { useNow, yearProgressLabel } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import { useAllEvents } from "../schedule/useEvents";
import { clearGoal, peekGoal } from "../shell/go";
import { daysBetween, fromYmd } from "../tasks/dates";
import { useTasks } from "../tasks/useTasks";
import { SectionLabel } from "../ui/bits";
import { addArea, blankGoal, deleteArea, deleteGoal, duplicateGoal, logProgress, moveToArea, patchArea, saveGoal, setDone } from "./actions";
import GoalDetails from "./GoalDetails";
import GoalPopup from "./GoalPopup";
import { fmt, paceOn, progressOn, statusLabel, statusOf, statusStyle, stepLabel, valueOn, type Area, type Goal } from "./model";
import { useGoals } from "./useGoals";

type View = "active" | "behind" | "done";

// The Goals screen (Goals.dc.html): views, areas and the year so far on the
// left, goal cards with pace in the middle, the selected goal's progress on
// the right.
export default function GoalsScreen() {
  const { goals, areas, error } = useGoals();
  const { habits } = useHabits();
  const { tasks } = useTasks();
  const { events } = useAllEvents();
  const { settings, update } = useSettings();
  const now = useNow();
  const rules = rulesOf(settings);
  const today = habitDay(now, rules);
  const view: View = settings.GoalsView === "behind" || settings.GoalsView === "done" ? settings.GoalsView : "active";
  const areaFilter = settings.GoalsArea && areas.some((a) => a.Id === settings.GoalsArea) ? settings.GoalsArea : null;
  const sort = settings.GoalsSort === "risk" ? "risk" : "due";
  const [selectedId, setSelectedId] = useState<string | null>(peekGoal);
  useEffect(() => clearGoal(), []);
  const [editing, setEditing] = useState<{ goal: Goal; isNew: boolean } | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [areaEdit, setAreaEdit] = useState<string | "new" | null>(null);
  const [confirmArea, setConfirmArea] = useState<Area | null>(null);
  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);
  const menuAt = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    e.preventDefault();
    const { x, y } = menuPoint(e);
    openMenu(x, y, items);
  };

  const rows = useMemo(
    () =>
      goals.map((g) => {
        const pct = progressOn(g, habits, today);
        const pace = paceOn(g, today);
        return { g, pct, pace, status: statusOf(pct, pace) };
      }),
    [goals, habits, today],
  );
  const areaOf = (id: string) => areas.find((a) => a.Id === id) ?? areas[0];

  let list = rows.filter((r) => (view === "done" ? r.pct >= 100 : view === "behind" ? r.status === "behind" : r.pct < 100));
  if (areaFilter) list = list.filter((r) => r.g.Area === areaFilter);
  list = [...list].sort((a, b) => (sort === "due" ? a.g.Due.localeCompare(b.g.Due) : a.pct - a.pace - (b.pct - b.pace)));
  const selected = rows.find((r) => r.g.Id === selectedId) ?? list[0] ?? null;

  const year = now.getFullYear();
  const yearStart = `${year}-01-01`;
  const yearPct = Math.round((daysBetween(yearStart, today) / daysBetween(yearStart, `${year + 1}-01-01`)) * 100);
  const activeRows = rows.filter((r) => r.pct < 100);
  const tally = {
    on: activeRows.filter((r) => r.status === "on").length,
    ahead: activeRows.filter((r) => r.status === "ahead").length,
    behind: activeRows.filter((r) => r.status === "behind").length,
  };

  const heading = areaFilter ? `${areaOf(areaFilter).Name} goals` : view === "done" ? "Completed" : view === "behind" ? "Needs attention" : "Your goals";

  const areaMenu = (a: Area): MenuItem[] => [
    { label: "Rename", onSelect: () => setAreaEdit(a.Id) },
    {
      label: "Color",
      children: hueNames.map((name, i) => ({
        label: name,
        checked: a.Hue === i,
        icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: hueColor(i) }} />,
        onSelect: () => patchArea(a.Id, { Hue: i }),
      })),
    },
    { type: "separator" },
    { label: "Delete area…", danger: true, disabled: areas.length <= 1, onSelect: () => setConfirmArea(a) },
  ];

  const goalMenu = (g: Goal): MenuItem[] => [
    { label: "Open", icon: <Maximize2 size={13} />, onSelect: () => setSelectedId(g.Id) },
    { label: "Edit…", icon: <Pencil size={13} />, onSelect: () => setEditing({ goal: g, isNew: false }) },
    ...(g.Kind === "number"
      ? [
          { label: `Log ${stepLabel(g)}`, icon: <Plus size={13} />, onSelect: () => logProgress(g, g.Step) },
          { label: `Take back ${stepLabel(g)}`, icon: <Minus size={13} />, onSelect: () => logProgress(g, -g.Step) },
        ]
      : g.Kind === "once"
        ? [
            g.Done
              ? { label: "Mark not done", icon: <RotateCcw size={13} />, onSelect: () => setDone(g, false) }
              : { label: "Mark done", icon: <Check size={13} />, onSelect: () => setDone(g, true) },
          ]
        : []),
    { type: "separator" },
    {
      label: "Move to area",
      icon: <FolderInput size={13} />,
      children: areas.map<MenuItem>((a) => ({
        label: a.Name,
        checked: g.Area === a.Id,
        icon: <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: hueColor(a.Hue) }} />,
        onSelect: () => moveToArea(g, a.Id),
      })),
    },
    { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => setSelectedId(duplicateGoal(g).Id) },
    { type: "separator" },
    { label: "Delete goal", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteGoal(g) },
  ];

  return (
    <>
      <aside className="flex w-64 shrink-0 flex-col gap-[22px] overflow-y-auto border-r border-line bg-side px-4 pt-[22px] pb-[18px]">
        <div className="flex items-center justify-between px-1.5">
          <h1 className="m-0 font-head text-24 font-bold tracking-[-0.01em]">Goals</h1>
          <button
            aria-label="New goal"
            title="New goal"
            onClick={() => setEditing({ goal: blankGoal(areaFilter ?? areas[0]?.Id ?? "projects"), isNew: true })}
            className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink"
          >
            <Plus size={18} strokeWidth={2.2} />
          </button>
        </div>

        <nav aria-label="Goal views" className="flex flex-col gap-0.5">
          {(
            [
              ["active", "Active", rows.filter((r) => r.pct < 100).length],
              ["behind", "Needs attention", rows.filter((r) => r.status === "behind").length],
              ["done", "Completed", rows.filter((r) => r.pct >= 100).length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => update({ GoalsView: id })}
              data-row="nav"
              className={clsx("flex h-[42px] items-center gap-3 rounded-[12px] px-3 text-left text-14 font-medium", view === id ? "bg-panel text-text" : "text-muted hover:text-text")}
            >
              <span className="flex-1">{label}</span>
              <span className="font-mono text-12 text-muted">{count}</span>
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-0.5">
          <SectionLabel className="px-3 pb-1.5">AREAS</SectionLabel>
          {areas.map((a) =>
            areaEdit === a.Id ? (
              <AreaName key={a.Id} hue={a.Hue} initial={a.Name} onDone={(name) => (setAreaEdit(null), name?.trim() && patchArea(a.Id, { Name: name.trim() }))} />
            ) : (
              <button
                key={a.Id}
                aria-pressed={areaFilter === a.Id}
                onClick={() => update({ GoalsArea: areaFilter === a.Id ? null : a.Id })}
                onDoubleClick={() => setAreaEdit(a.Id)}
                onContextMenu={(e) => menuAt(e, areaMenu(a))}
                className={clsx("flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-left text-14", areaFilter === a.Id ? "bg-panel text-text" : "text-muted hover:text-text")}
              >
                <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: hueColor(a.Hue) }} />
                <span className="min-w-0 flex-1 truncate">{a.Name}</span>
                <span className="font-mono text-12 text-muted">{goals.filter((g) => g.Area === a.Id).length}</span>
              </button>
            ),
          )}
          {areaEdit === "new" ? (
            <AreaName
              hue={[0, 1, 2, 3, 4, 5].find((h) => !areas.some((a) => a.Hue === h)) ?? 0}
              initial=""
              onDone={(name) => {
                setAreaEdit(null);
                if (name?.trim()) update({ GoalsArea: addArea(name.trim(), areas).Id });
              }}
            />
          ) : (
            <button onClick={() => setAreaEdit("new")} className="flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-left text-13 text-muted hover:text-text">
              <Plus size={14} strokeWidth={2} className="-mx-[2px]" />
              New area
            </button>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-3 rounded-[18px] border border-line bg-panel p-4">
          <SectionLabel>{year} SO FAR</SectionLabel>
          <div className="flex items-baseline gap-2">
            <span className="font-head text-36 font-bold tracking-[-0.02em]">{yearPct}%</span>
            <span className="text-13 text-muted">of {year} is behind you</span>
          </div>
          <div className="h-2 overflow-hidden rounded-[8px] bg-panel2">
            <div className="h-full rounded-[8px] bg-faint" style={{ width: `${yearPct}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-12">
            <span className="flex h-[26px] items-center rounded-[8px] bg-panel2 px-[9px]">{tally.on} on track</span>
            <span className="flex h-[26px] items-center rounded-[8px] bg-accent2-soft px-[9px] text-accent2">{tally.ahead} ahead</span>
            <span className="flex h-[26px] items-center rounded-[8px] bg-warn-soft px-[9px] text-warn">{tally.behind} behind</span>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-[26px]">
        <header className="flex items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="font-mono text-12 tracking-[0.14em] text-muted">{yearProgressLabel(now)}</span>
            <h2 className="m-0 font-head text-40 leading-none font-bold tracking-[-0.02em]">{heading}</h2>
          </div>
          <div role="group" aria-label="Sort" className="flex shrink-0 rounded-[12px] border border-line bg-panel p-[3px]">
            {(
              [
                ["due", "By due date"],
                ["risk", "Most behind"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={sort === id}
                onClick={() => update({ GoalsSort: id })}
                className={clsx("h-8 rounded-[9px] px-3.5 text-13 font-medium whitespace-nowrap", sort === id ? "bg-panel2 text-text" : "text-muted hover:text-text")}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {error && <div className="rounded-[12px] border border-danger/40 bg-danger/10 px-4 py-3 text-13 text-danger">{error}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <div className="grid grid-cols-2 gap-4">
            {list.map((r) => (
              <GoalCard
                key={r.g.Id}
                r={r}
                area={areaOf(r.g.Area)}
                habits={habits}
                today={today}
                selected={r.g.Id === selected?.g.Id}
                onPick={() => setSelectedId(r.g.Id)}
                onMenu={(e) => menuAt(e, goalMenu(r.g))}
              />
            ))}
          </div>
          {goals.length === 0 ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-line px-8 text-center">
              <span className="text-15 font-medium">No goals yet</span>
              <span className="max-w-[400px] text-13 leading-[1.5] text-muted">Pick something you want to get done this year, and a way to know you got there. Habits you already track can move it along.</span>
              <button onClick={() => setEditing({ goal: blankGoal(areas[0]?.Id ?? "projects"), isNew: true })} className="mt-1 h-10 rounded-[12px] bg-accent px-4 text-13 font-semibold text-accent-ink">
                Add a goal
              </button>
            </div>
          ) : (
            list.length === 0 && (
              <div className="flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-line px-8 text-center text-14 text-muted">
                {view === "behind" ? "Nothing's behind. Nice." : view === "done" ? "Nothing completed yet." : "No goals here."}
              </div>
            )
          )}
        </div>
      </main>

      <GoalDetails
        goal={selected?.g ?? null}
        area={selected ? areaOf(selected.g.Area) : null}
        habits={habits}
        tasks={tasks}
        events={events}
        today={today}
        rules={rules}
        openMenu={openMenu}
        onEdit={() => selected && setEditing({ goal: selected.g, isNew: false })}
      />

      {editing && (
        <GoalPopup
          goal={editing.goal}
          isNew={editing.isNew}
          areas={areas}
          habits={habits}
          tasks={tasks}
          events={events}
          today={today}
          onClose={() => setEditing(null)}
          onSave={(g) => {
            saveGoal(g);
            setSelectedId(g.Id);
            setEditing(null);
          }}
        />
      )}
      {confirmArea && (
        <ConfirmDialog
          title={`Delete “${confirmArea.Name}”?`}
          message={(() => {
            const count = goals.filter((g) => g.Area === confirmArea.Id).length;
            const to = areas.find((a) => a.Id !== confirmArea.Id);
            return count ? `Its ${count} ${count === 1 ? "goal moves" : "goals move"} to ${to?.Name}.` : "It has no goals.";
          })()}
          okLabel="Delete area"
          cancelLabel="Cancel"
          danger
          onResult={(ok) => {
            const to = areas.find((a) => a.Id !== confirmArea.Id);
            if (ok && to) {
              deleteArea(confirmArea.Id, to.Id);
              if (areaFilter === confirmArea.Id) update({ GoalsArea: null });
            }
            setConfirmArea(null);
          }}
        />
      )}
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </>
  );
}

function GoalCard({
  r,
  area,
  habits,
  today,
  selected,
  onPick,
  onMenu,
}: {
  r: { g: Goal; pct: number; pace: number; status: ReturnType<typeof statusOf> };
  area: Area;
  habits: Habit[];
  today: string;
  selected: boolean;
  onPick: () => void;
  onMenu: (e: React.MouseEvent<HTMLElement>) => void;
}) {
  const { g, pct, pace, status } = r;
  const color = hueColor(area.Hue);
  const detail = g.Kind === "number" ? `${fmt(valueOn(g, habits, today))} / ${fmt(g.Target)} ${g.Unit}` : g.Kind === "milestones" ? `${g.Milestones.filter((m) => m.Done).length} of ${g.Milestones.length} milestones` : g.Done ? "Done" : "Not done yet";
  const links = [
    ...g.Habits.map((l) => {
      const h = habits.find((x) => x.Id === l.Id);
      return h ? { text: `Habit: ${h.Name}`, dot: hueColor(h.Hue) } : null;
    }),
    ...(g.Tasks.length ? [{ text: `${g.Tasks.length} ${g.Tasks.length === 1 ? "task" : "tasks"}`, dot: "var(--accent)" }] : []),
    ...(g.Events.length ? [{ text: `${g.Events.length} ${g.Events.length === 1 ? "event" : "events"}`, dot: "var(--accent2)" }] : []),
    ...(g.Notes.length ? [{ text: `${g.Notes.length} ${g.Notes.length === 1 ? "note" : "notes"}`, dot: "var(--warn)" }] : []),
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  return (
    <button
      aria-pressed={selected}
      onClick={onPick}
      onContextMenu={onMenu}
      data-row="card"
      className="flex flex-col gap-3.5 rounded-[22px] border-[1.5px] bg-panel p-[18px] text-left"
      style={{ borderColor: selected ? color : "var(--line)" }}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-12 text-muted">
          <span className="h-2 w-2 shrink-0 rounded-[3px]" style={{ background: color }} />
          <span className="truncate">
            {area.Name} · Due {fromYmd(g.Due).toLocaleDateString(locale(), { month: "short", day: "numeric" })}
          </span>
        </span>
        <span className="flex h-6 shrink-0 items-center rounded-[8px] px-[9px] text-11 font-semibold" style={{ background: statusStyle[status].bg, color: statusStyle[status].fg }}>
          {statusLabel[status]}
        </span>
      </span>
      <span className="text-18 leading-[1.3] font-semibold tracking-[-0.01em]">{g.Title}</span>
      <span className="flex w-full flex-col gap-2">
        <span className="flex items-baseline justify-between text-12 text-muted">
          <b className="font-head text-26 font-bold tracking-[-0.02em] text-text">{pct}%</b>
          <span>{detail}</span>
        </span>
        <span className="relative block h-2.5 rounded-[10px] bg-panel2">
          <span className="absolute inset-y-0 left-0 rounded-[10px]" style={{ width: `${pct}%`, background: color }} />
          <span title="Where you'd be at an even pace" className="absolute -top-1 -bottom-1 w-0.5 rounded-[2px] bg-text opacity-55" style={{ left: `${pace}%` }} />
        </span>
      </span>
      {links.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {links.slice(0, 2).map((l) => (
            <span key={l.text} className="flex h-[26px] items-center gap-1.5 rounded-[8px] bg-panel2 px-[9px] text-11 text-muted">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.dot }} />
              {l.text}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function AreaName({ hue, initial, onDone }: { hue: number; initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <label className="flex h-[38px] items-center gap-3 rounded-[10px] bg-panel px-3 text-14">
      <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: hueColor(hue), boxShadow: `0 0 0 3px ${hueSoft(hue)}` }} />
      <input
        autoFocus
        value={value}
        aria-label="Area name"
        placeholder="Area name"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onDone(value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onDone(null);
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-faint"
      />
    </label>
  );
}
