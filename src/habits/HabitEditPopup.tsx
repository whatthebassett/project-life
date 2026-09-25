import { weekStartsMonday } from "../lib/format";
import { locale } from "../lib/format";
import clsx from "clsx";
import { Archive, Check, ChevronDown, Minus, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog";
import { Button } from "../ui/Button";
import { Popup } from "../ui/Popup";
import { SectionLabel } from "../ui/bits";
import { archiveHabit, deleteHabit } from "./actions";
import { HabitIcon, iconNames } from "./icons";
import { currentStreak, goalLabel, hueColor, hueNames, hueSoft, iconIds, todLabel, type Habit, type HabitKind, type HabitReminderAt, type HabitRules } from "./model";

interface Props {
  habit: Habit;
  isNew: boolean;
  today: string;
  rules: HabitRules;
  onSave: (h: Habit) => void;
  onClose: () => void;
}

const letters = ["M", "T", "W", "T", "F", "S", "S"];
const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Days are stored Monday first; they're shown in the order weeks start on.
const weekOrder = () => (weekStartsMonday() ? [0, 1, 2, 3, 4, 5, 6] : [6, 0, 1, 2, 3, 4, 5]);
const remTexts: Record<HabitReminderAt, string> = { every2: "every 2 hours", "09:00": "at 9 AM", "12:00": "at noon", "19:00": "at 7 PM" };

// The habit pop-up (HabitEdit.dc.html), for new habits too: name, icon and
// color, the goal, how often, time of day, reminder, where it shows, and a
// live preview with the plan in plain English.
export default function HabitEditPopup({ habit, isNew, today, rules, onSave, onClose }: Props) {
  const [h, setH] = useState<Habit>(habit);
  const [confirm, setConfirm] = useState(false);
  const set = (fields: Partial<Habit>) => setH((cur) => ({ ...cur, ...fields }));
  const color = hueColor(h.Hue);
  const hasTarget = h.Kind !== "check";

  const pickKind = (k: HabitKind) => {
    if (k === h.Kind) return;
    if (k === "check") set({ Kind: k, Target: 1 });
    else if (k === "time") set({ Kind: k, Target: 20, Unit: "minutes" });
    else set({ Kind: k, Target: 8, Unit: h.Kind === "time" || !h.Unit ? "times" : h.Unit });
  };

  const freqText =
    h.Frequency === "daily"
      ? "every day"
      : h.Frequency === "weekly"
        ? `${h.PerWeek} times a week`
        : h.Days.slice(0, 5).every(Boolean) && !h.Days[5] && !h.Days[6]
          ? "on weekdays"
          : `on ${letters.filter((_, i) => h.Days[i]).length} days a week`;
  const todText = { morning: "in the morning", anytime: "any time of day", evening: "in the evening" }[h.TimeOfDay];
  const name = h.Name.trim() || "New habit";
  const lead = hasTarget ? (h.Kind === "time" ? `${h.Target} ${h.Unit} of ${name.toLowerCase()}` : `${h.Target} ${h.Unit}`.trim()) : name;
  const sentence = `${lead}, ${freqText}, ${todText}.${h.Reminder.On ? ` Reminds you ${remTexts[h.Reminder.At]}.` : " No reminders."}`;
  const summary = `${name} · ${goalLabel(h)} · ${freqText}`;
  const streak = currentStreak(h, today, rules);
  const started = new Date(h.Created).toLocaleDateString(locale(), { month: "short", day: "numeric" });

  const save = () => {
    if (!h.Name.trim()) return;
    onSave({ ...h, Name: h.Name.trim(), Unit: h.Unit.trim() });
  };

  const seg = <T extends string>(options: [T, string][], value: T, onPick: (v: T) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-[13px] border border-line bg-panel p-1">
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onPick(v)} className={clsx("h-[38px] rounded-[10px] text-13 font-medium", value === v ? "bg-panel2 text-text" : "text-muted hover:text-text")}>
          {text}
        </button>
      ))}
    </div>
  );

  return (
    <Popup onClose={onClose} onSubmit={save} width={1060} height={920} labelledBy="pl-hb-name">
      <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-line bg-side pr-4 pl-6">
        <div className="flex items-center gap-3">
          <span className="flex h-[30px] items-center rounded-[9px] border border-line bg-panel px-2.5 font-mono text-11 tracking-[0.08em] text-muted">{isNew ? "NEW HABIT" : "EDIT HABIT"}</span>
          <span className="text-13 text-muted">{isNew ? "Something small you want to do regularly." : "Changes apply from today. Your streak and history stay."}</span>
        </div>
        <button aria-label="Close" title="Close (Esc)" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line text-muted hover:text-text">
          <X size={16} strokeWidth={2.2} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-7 py-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="pl-hb-name">
              <SectionLabel>NAME</SectionLabel>
            </label>
            <input
              id="pl-hb-name"
              autoFocus={isNew}
              value={h.Name}
              onChange={(e) => set({ Name: e.target.value })}
              placeholder="What do you want to do?"
              className="h-[54px] rounded-[14px] border border-line bg-panel px-4 font-head text-22 font-bold text-text outline-none placeholder:text-faint focus:border-faint"
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>ICON AND COLOR</SectionLabel>
            <div role="radiogroup" aria-label="Icon" className="flex gap-1.5">
              {iconIds.map((id) => {
                const on = id === h.Icon;
                return (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={on}
                    aria-label={iconNames[id]}
                    onClick={() => set({ Icon: id })}
                    className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px]"
                    style={on ? { background: hueSoft(h.Hue, 18), color, borderColor: color } : { background: "var(--panel)", color: "var(--muted)", borderColor: "var(--line)" }}
                  >
                    <HabitIcon id={id} />
                  </button>
                );
              })}
            </div>
            <div role="radiogroup" aria-label="Color" className="flex items-center gap-2.5">
              {hueNames.map((n, i) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={i === h.Hue}
                  aria-label={n}
                  onClick={() => set({ Hue: i })}
                  className="h-[34px] w-[34px] rounded-full"
                  style={{ background: hueColor(i), boxShadow: `0 0 0 3px var(--bg), 0 0 0 5px ${i === h.Hue ? hueColor(i) : "transparent"}` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>GOAL</SectionLabel>
            {seg<HabitKind>(
              [
                ["check", "Just check it off"],
                ["count", "Count it"],
                ["time", "Time it"],
              ],
              h.Kind,
              pickKind,
              "Goal type",
            )}
            {hasTarget && (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-1 rounded-[14px] border border-line bg-panel p-[3px]">
                  <button aria-label="Lower target" onClick={() => setH((cur) => ({ ...cur, Target: Math.max(1, cur.Target - (cur.Kind === "time" ? 5 : 1)) }))} className="flex h-10 w-10 items-center justify-center rounded-[11px] text-muted hover:text-text">
                    <Minus size={16} strokeWidth={2.2} />
                  </button>
                  <span className="min-w-12 text-center font-mono text-18 font-medium">{h.Target}</span>
                  <button aria-label="Raise target" onClick={() => setH((cur) => ({ ...cur, Target: cur.Target + (cur.Kind === "time" ? 5 : 1) }))} className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-panel2">
                    <Plus size={16} strokeWidth={2.2} />
                  </button>
                </div>
                <label htmlFor="pl-hb-unit" className="sr-only">
                  Unit
                </label>
                <input
                  id="pl-hb-unit"
                  value={h.Unit}
                  onChange={(e) => set({ Unit: e.target.value })}
                  placeholder={h.Kind === "time" ? "minutes" : "glasses"}
                  className="h-12 w-40 rounded-[14px] border border-line bg-panel px-3.5 text-15 text-text outline-none focus:border-faint"
                />
                <span className="text-13 text-muted">{h.Kind === "time" ? "per day, a timer counts it for you" : "per day, tap + each time"}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            <SectionLabel>HOW OFTEN</SectionLabel>
            {seg(
              [
                ["daily", "Every day"],
                ["days", "Specific days"],
                ["weekly", "Times a week"],
              ],
              h.Frequency,
              (v) => set({ Frequency: v }),
              "Frequency",
            )}
            {h.Frequency === "days" && (
              <div role="group" aria-label="Days" className="grid grid-cols-7 gap-1.5">
                {weekOrder().map((i) => {
                  const l = letters[i];
                  const on = h.Days[i];
                  return (
                    <button
                      key={i}
                      aria-pressed={on}
                      aria-label={dayNames[i]}
                      onClick={() =>
                        setH((cur) => {
                          const days = cur.Days.map((d, j) => (j === i ? !d : d));
                          return days.some(Boolean) ? { ...cur, Days: days } : cur;
                        })
                      }
                      className="h-11 rounded-[12px] border text-13 font-semibold"
                      style={on ? { background: hueSoft(h.Hue, 18), color, borderColor: color } : { background: "var(--panel)", color: "var(--muted)", borderColor: "var(--line)" }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            )}
            {h.Frequency === "weekly" && (
              <div className="flex items-center gap-3 text-14">
                <div className="flex items-center gap-1 rounded-[14px] border border-line bg-panel p-[3px]">
                  <button aria-label="Fewer times" onClick={() => setH((cur) => ({ ...cur, PerWeek: Math.max(1, cur.PerWeek - 1) }))} className="flex h-10 w-10 items-center justify-center rounded-[11px] text-muted hover:text-text">
                    <Minus size={16} strokeWidth={2.2} />
                  </button>
                  <span className="min-w-10 text-center font-mono text-18 font-medium">{h.PerWeek}</span>
                  <button aria-label="More times" onClick={() => setH((cur) => ({ ...cur, PerWeek: Math.min(7, cur.PerWeek + 1) }))} className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-panel2">
                    <Plus size={16} strokeWidth={2.2} />
                  </button>
                </div>
                <span className="text-muted">times a week, any days you like</span>
              </div>
            )}
          </div>

          <div className="flex gap-5">
            <div className="flex flex-1 flex-col gap-2.5">
              <SectionLabel>TIME OF DAY</SectionLabel>
              {seg(
                [
                  ["morning", "Morning"],
                  ["anytime", "Anytime"],
                  ["evening", "Evening"],
                ],
                h.TimeOfDay,
                (v) => set({ TimeOfDay: v }),
                "Time of day",
              )}
            </div>
            <div className="flex w-[290px] shrink-0 flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <SectionLabel>REMINDER</SectionLabel>
                <SwitchKnob label="Reminder" on={h.Reminder.On} onChange={(on) => set({ Reminder: { ...h.Reminder, On: on } })} />
              </div>
              <span className="relative flex">
                <select
                  aria-label="Reminder time"
                  disabled={!h.Reminder.On}
                  value={h.Reminder.At}
                  onChange={(e) => set({ Reminder: { ...h.Reminder, At: e.target.value as HabitReminderAt } })}
                  className={clsx("h-[46px] w-full appearance-none rounded-[13px] border border-line bg-panel pr-9 pl-3.5 text-14 outline-none", h.Reminder.On ? "text-text" : "text-muted")}
                >
                  <option value="every2">Every 2 hours, 9 AM – 9 PM</option>
                  <option value="09:00">Once at 9:00 AM</option>
                  <option value="12:00">Once at 12:00 PM</option>
                  <option value="19:00">Once at 7:00 PM</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-muted" />
              </span>
            </div>
          </div>

          <div className="flex flex-col overflow-hidden rounded-[16px] border border-line">
            <ToggleRow label="Show on Home" description="Adds it to the Habits card on your home screen" on={h.ShowOnHome} onChange={(v) => set({ ShowOnHome: v })} border />
            <ToggleRow label="Add to Today in Tasks" description="Shows up next to your to-dos on days it's due" on={h.InTasks} onChange={(v) => set({ InTasks: v })} />
          </div>
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-line bg-side px-[22px] py-6">
          <SectionLabel>PREVIEW</SectionLabel>
          <div className="flex items-center gap-3.5 rounded-[18px] border border-line bg-panel p-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]" style={{ background: hueSoft(h.Hue), color }}>
              <HabitIcon id={h.Icon} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <span className="truncate text-16 font-semibold">{name}</span>
              <span className="text-12 text-muted">
                {goalLabel(h)} · {todLabel[h.TimeOfDay]}
              </span>
            </span>
            {hasTarget ? (
              <span className="rounded-[12px] bg-panel2 px-3 py-2.5 font-mono text-14 font-medium">
                <span style={{ color }}>{Math.min(h.Target, Math.round(h.Target * 0.6))}</span>/{h.Target}
              </span>
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-[14px] border-[1.5px] border-faint text-muted">
                <Check size={20} strokeWidth={2.4} />
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2.5 rounded-[18px] p-4" style={{ background: hueSoft(h.Hue, 8) }}>
            <span className="text-13 leading-[1.5]">{sentence.charAt(0).toUpperCase() + sentence.slice(1)}</span>
            <div className="flex gap-[5px]">
              {weekOrder().map((i, pos) => {
                const l = letters[i];
                const on = h.Frequency === "days" ? h.Days[i] : h.Frequency === "weekly" ? pos < h.PerWeek : true;
                return (
                  <span
                    key={i}
                    className="flex h-[30px] flex-1 items-center justify-center rounded-[8px] border font-mono text-10"
                    style={on ? { background: hueSoft(h.Hue, 30), borderColor: "transparent", color: "var(--text)" } : { borderColor: "var(--faint)", borderStyle: "dashed", color: "var(--muted)" }}
                  >
                    {l}
                  </span>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-panel p-3">
              <span className="text-11 text-muted">Current streak</span>
              <span className="font-mono text-17">
                {streak.count} {streak.unit}
                {streak.count === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-[14px] border border-line bg-panel p-3">
              <span className="text-11 text-muted">Started</span>
              <span className="font-mono text-17">{isNew ? "Today" : started}</span>
            </div>
          </div>
          <div className="flex-1" />
          {!isNew && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <button
                onClick={() => {
                  archiveHabit(habit, !habit.Archived);
                  onClose();
                }}
                className="flex h-11 items-center justify-center gap-2 rounded-[12px] border border-line text-13 font-medium hover:bg-panel"
              >
                <Archive size={15} />
                {habit.Archived ? "Bring it back" : "Archive habit"}
              </button>
              <button onClick={() => setConfirm(true)} className="flex h-11 items-center justify-center gap-2 rounded-[12px] text-13 font-medium text-danger hover:bg-panel">
                <Trash2 size={15} />
                Delete habit and history
              </button>
            </div>
          )}
        </aside>
      </div>

      <footer className="flex h-[68px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6">
        <span className="min-w-0 truncate text-13 text-muted">{summary}</span>
        <div className="flex shrink-0 items-center gap-2.5">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" hint="Ctrl Enter" disabled={!h.Name.trim()} onClick={save}>
            {isNew ? "Add habit" : "Save changes"}
          </Button>
        </div>
      </footer>

      {confirm && (
        <ConfirmDialog
          title={`Delete “${habit.Name}”?`}
          message="Its streak and every check-in go with it. Archive it instead to keep the history."
          okLabel="Delete"
          cancelLabel="Cancel"
          danger
          onResult={(ok) => {
            setConfirm(false);
            if (ok) {
              deleteHabit(habit);
              onClose();
            }
          }}
        />
      )}
    </Popup>
  );
}

function SwitchKnob({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="flex items-center">
      <span className={clsx("flex h-[22px] w-[38px] rounded-full p-[3px]", on ? "justify-end bg-accent" : "justify-start bg-panel2")}>
        <span className={clsx("h-4 w-4 rounded-full", on ? "bg-accent-ink" : "bg-muted")} />
      </span>
    </button>
  );
}

function ToggleRow({ label, description, on, onChange, border }: { label: string; description: string; on: boolean; onChange: (v: boolean) => void; border?: boolean }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={clsx("flex min-h-[58px] items-center gap-3.5 px-4 py-2.5 text-left", border && "border-b border-line")}>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-14 font-medium">{label}</span>
        <span className="text-12 text-muted">{description}</span>
      </span>
      <span className={clsx("flex h-[22px] w-[38px] rounded-full p-[3px]", on ? "justify-end bg-accent" : "justify-start bg-panel2")}>
        <span className={clsx("h-4 w-4 rounded-full", on ? "bg-accent-ink" : "bg-muted")} />
      </span>
    </button>
  );
}
