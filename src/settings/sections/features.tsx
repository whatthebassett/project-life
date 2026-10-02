import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { inTauri, system } from "../../lib/api";
import { liveStatus, OBS_SECRET, stateText, type LiveStatus } from "../../lib/live";
import type { Settings } from "../../lib/settings";
import { useSettings } from "../../lib/SettingsContext";
import { isMac, secretStore, thisComputer } from "../../lib/platform";
import { clashes, defaultKeys, isAssignable, keyCaps, keyOf, keysFor, shortcutCommands, showKeys, type ShortcutGroup } from "../../lib/shortcuts";
import { commonZones, localZone, zoneCity, zoneName } from "../../schedule/events";
import { testNotification } from "../../tasks/reminders";
import { useTasks } from "../../tasks/useTasks";
import { KeyCaps, ListGroup, ListRow } from "../../ui/bits";
import { Action, Choice, Seg, Toggle } from "../controls";

// ----- Notifications -----

export function Notifications() {
  const { settings, update } = useSettings();
  const on = (key: keyof Settings) => settings[key] !== false;
  return (
    <>
      <ListGroup title="REMIND ME ABOUT">
        <Toggle label="Events" desc="Uses each event’s own reminder" value={on("NotifyEvents")} onChange={(v) => update({ NotifyEvents: v })} />
        <Toggle label="Calls about to start" desc="With a Join button right in the notification" value={on("NotifyCalls")} onChange={(v) => update({ NotifyCalls: v })} />
        <Toggle label="Tasks when they’re due" value={on("NotifyTasks")} onChange={(v) => update({ NotifyTasks: v })} />
        <Toggle label="Habit reminders" value={on("NotifyHabits")} onChange={(v) => update({ NotifyHabits: v })} />
        <Toggle label="Goal check-ins" value={on("NotifyGoals")} onChange={(v) => update({ NotifyGoals: v })} />
      </ListGroup>
      <ListGroup title="QUIET">
        <Choice
          label="Quiet hours"
          desc="Nothing makes a sound"
          value={settings.QuietHours ?? "2-10"}
          onChange={(v) => update({ QuietHours: v })}
          options={[
            { value: "2-10", label: "2 AM – 10 AM" },
            { value: "23-7", label: "11 PM – 7 AM" },
            { value: "off", label: "Off" },
          ]}
        />
        <Toggle
          label="Stay quiet while I’m live"
          desc="Holds notifications while your streaming app is broadcasting"
          value={settings.QuietWhileLive !== false}
          onChange={(v) => update({ QuietWhileLive: v })}
        />
        <Choice
          label="Sound"
          value={settings.Sound ?? "chime"}
          onChange={(v) => update({ Sound: v })}
          options={[
            { value: "chime", label: "Soft chime" },
            { value: "pop", label: "Pop" },
            { value: "none", label: "None" },
          ]}
        />
        <Action label="Try it" desc="Sends a notification the way reminders look and sound" action="Send a test" onClick={testNotification} />
      </ListGroup>
      {settings.QuietWhileLive !== false && <Streaming />}
    </>
  );
}

// OBS and Meld Studio: how Project Life tells you're live.
function Streaming() {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [port, setPort] = useState(String(settings.ObsPort ?? 4455));
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    setStatus(await liveStatus(true));
    setChecking(false);
  };
  useEffect(() => {
    void system.secretGet(OBS_SECRET).then((p) => setHasPassword(Boolean(p)));
    void check();
  }, []);

  const savePassword = async (value: string | null) => {
    await system.secretSet(OBS_SECRET, value);
    setHasPassword(Boolean(value));
    setPassword("");
    await check();
  };

  const obsText = status ? stateText[status.obs] : "Checking…";
  const meldText = status ? stateText[status.meld] : "Checking…";
  return (
    <ListGroup title="STREAMING APPS">
      <ListRow label="OBS Studio" description={status?.obs === "password" ? "Enter the WebSocket password below" : "Tools → WebSocket Server Settings has the port and password"}>
        <Live state={status?.obs} text={obsText} />
      </ListRow>
      <ListRow label="OBS WebSocket port">
        <input
          value={port}
          inputMode="numeric"
          onChange={(e) => setPort(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onBlur={() => {
            const n = Number(port);
            if (n > 0 && n < 65536 && n !== settings.ObsPort) update({ ObsPort: n });
            else setPort(String(settings.ObsPort ?? 4455));
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="OBS WebSocket port"
          className="h-[38px] w-[96px] rounded-[11px] border border-line bg-panel2 px-3 font-mono text-13 text-text outline-none focus:border-faint"
        />
      </ListRow>
      <ListRow label="OBS WebSocket password" description={`Kept in ${secretStore}, not in Project Life’s files`}>
        <span className="flex shrink-0 items-center gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && password && void savePassword(password)}
            placeholder={hasPassword ? "Saved" : "Password"}
            aria-label="OBS WebSocket password"
            disabled={!inTauri}
            className="h-[38px] w-[180px] rounded-[11px] border border-line bg-panel2 px-3 text-13 text-text outline-none focus:border-faint disabled:opacity-50"
          />
          <button disabled={!password} onClick={() => void savePassword(password)} className="h-9 rounded-[10px] border border-line px-3 text-12 font-semibold hover:bg-panel2 disabled:opacity-50">
            Save
          </button>
          {hasPassword && (
            <button onClick={() => void savePassword(null)} className="h-9 rounded-[10px] px-3 text-12 text-muted hover:bg-panel2 hover:text-text">
              Forget
            </button>
          )}
        </span>
      </ListRow>
      <ListRow label="Meld Studio" description="Asked directly; nothing to set up">
        <Live state={status?.meld} text={meldText} />
      </ListRow>
      {status && status.others.length > 0 && (
        <ListRow label="Streamlabs" description="Can’t be asked, so it counts as live while it’s open">
          <Live state="running" text="open" />
        </ListRow>
      )}
      <Action
        label={status?.live ? "You’re live right now" : "Not live right now"}
        desc={status?.live ? "Notifications are being held until you stop" : "Notifications come through as usual"}
        action={checking ? "Checking…" : "Check again"}
        disabled={checking}
        onClick={() => void check()}
      />
    </ListGroup>
  );
}

function Live({ state, text }: { state?: string; text: string }) {
  return (
    <span className={clsx("flex shrink-0 items-center gap-1.5 text-12 font-medium", state === "live" ? "text-danger" : state === "idle" ? "text-accent2" : state === "password" ? "text-warn" : "text-muted")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {text[0].toUpperCase() + text.slice(1)}
    </span>
  );
}

// ----- Keyboard shortcuts -----

const shortcutGroups: { group: ShortcutGroup; title: string }[] = [
  { group: "Everywhere", title: "EVERYWHERE" },
  { group: "Notes", title: "NOTES" },
  { group: "Tabs", title: "NOTE TABS" },
  { group: "Formatting", title: "FORMATTING, INSIDE A NOTE" },
];

// Keys as a sentence says them: "Ctrl + Shift + K", or "⇧⌘K" on a Mac.
const spoken = (keys: string) => (isMac ? showKeys(keys) : keys.replace(/\+/g, " + "));

export function Shortcuts() {
  const { settings, update } = useSettings();
  const [recording, setRecording] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const overrides = settings.Shortcuts ?? {};

  // Assign keys to a command; one that clashes with it loses them.
  const assign = (id: string, keys: string) => {
    const next = { ...overrides };
    const self = shortcutCommands.find((c) => c.id === id)!;
    if (keys) {
      const clash = shortcutCommands.find((c) => c.id !== id && clashes(c.group, self.group) && keysFor(c.id, next) === keys);
      if (clash) {
        next[clash.id] = "";
        setNote(`${spoken(keys)} was moved from ${clash.name}.`);
      } else setNote(null);
    }
    if (keys === defaultKeys(id)) delete next[id];
    else next[id] = keys;
    update({ Shortcuts: next });
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (e.key === "Escape" && plain) return setRecording(null);
      if ((e.key === "Backspace" || e.key === "Delete") && plain) {
        assign(recording, "");
        return setRecording(null);
      }
      const keys = keyOf(e);
      if (!keys || !isAssignable(keys)) return;
      assign(recording, keys);
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, overrides]);

  return (
    <>
      <p className="m-0 text-13 leading-[1.5] text-muted">
        Click a shortcut, then press the new keys. {isMac ? "Use ⌘ or ⌃ (⌥ too, with an arrow or another named key), or a function key." : "Use Ctrl or Alt, or a function key."} Backspace removes a shortcut; Escape cancels.
      </p>
      {note && <p className="m-0 text-13 text-accent">{note}</p>}
      {shortcutGroups.map(({ group, title }) => (
        <ListGroup key={group} title={title}>
          {shortcutCommands
            .filter((c) => c.group === group)
            .map((c) => {
              const keys = keysFor(c.id, overrides);
              const changed = c.id in overrides;
              const listening = recording === c.id;
              return (
                <ListRow key={c.id} label={c.name}>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      title={`Reset to ${spoken(defaultKeys(c.id)) || "none"}`}
                      aria-label={`Reset ${c.name}`}
                      onClick={() => assign(c.id, defaultKeys(c.id))}
                      className={clsx("flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel2 hover:text-text", !changed && "invisible")}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`${c.name}: ${showKeys(keys) || "no shortcut"}. Change`}
                      onClick={() => setRecording(listening ? null : c.id)}
                      className={clsx("flex min-h-[38px] min-w-[96px] items-center justify-end rounded-[10px] border px-1 hover:bg-panel2", listening ? "border-accent" : "border-transparent")}
                    >
                      {listening ? (
                        <span className="px-2 text-12 font-medium text-accent">Press keys…</span>
                      ) : keys ? (
                        <KeyCaps keys={keyCaps(keys)} />
                      ) : (
                        <span className="px-2 text-12 text-muted">None</span>
                      )}
                    </button>
                  </span>
                </ListRow>
              );
            })}
        </ListGroup>
      ))}
      <ListGroup>
        <Action
          label="Reset all shortcuts"
          action="Reset"
          disabled={!Object.keys(overrides).length}
          onClick={() => {
            update({ Shortcuts: {} });
            setNote(null);
          }}
        />
      </ListGroup>
    </>
  );
}

// ----- Schedule -----

export function ScheduleSettings() {
  const { settings, update } = useSettings();
  const { allLists: lists } = useTasks();
  const here = localZone();
  const zones = [...new Set([here, ...commonZones])];
  return (
    <>
      <ListGroup title="NEW EVENTS">
        <Choice
          label="Calendar"
          value={lists.some((l) => l.Id === settings.EventCalendar) ? settings.EventCalendar! : "default"}
          onChange={(v) => update({ EventCalendar: v === "default" ? undefined : v })}
          options={[{ value: "default", label: "Same as new tasks" }, ...lists.map((l) => ({ value: l.Id, label: l.Name }))]}
        />
        <Seg
          label="Length"
          value={String(settings.EventLength ?? 60)}
          onChange={(v) => update({ EventLength: Number(v) })}
          options={[
            { value: "30", label: "30 min" },
            { value: "60", label: "1 hour" },
            { value: "120", label: "2 hours" },
          ]}
        />
        <Choice
          label="Reminder"
          value={settings.EventReminder === null ? "none" : String(settings.EventReminder ?? 10)}
          onChange={(v) => update({ EventReminder: v === "none" ? null : Number(v) })}
          options={[
            { value: "0", label: "At start" },
            { value: "10", label: "10 min before" },
            { value: "30", label: "30 min before" },
            { value: "60", label: "1 hr before" },
            { value: "none", label: "None" },
          ]}
        />
        <Seg
          label="Video call"
          desc="Paste the link into the event; connecting accounts comes later"
          value={settings.EventVideo ?? "none"}
          onChange={(v) => update({ EventVideo: v })}
          options={[
            { value: "none", label: "None" },
            { value: "teams", label: "Teams" },
            { value: "meet", label: "Meet" },
            { value: "zoom", label: "Zoom" },
          ]}
        />
      </ListGroup>
      <ListGroup title="VIEW">
        <Seg
          label="Open to"
          value={settings.ScheduleView ?? "week"}
          onChange={(v) => update({ ScheduleView: v })}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
        <Choice
          label="Time zone"
          desc="For new events. Others can still be picked per event."
          value={settings.ScheduleZone && zones.includes(settings.ScheduleZone) ? settings.ScheduleZone : here}
          onChange={(v) => update({ ScheduleZone: v === here ? null : v })}
          options={zones.map((z) => ({ value: z, label: `${zoneCity(z)} (${zoneName(z)})${z === here ? ` · ${thisComputer}` : ""}` }))}
        />
      </ListGroup>
    </>
  );
}

// ----- Tasks -----

export function TasksSettings() {
  const { settings, update } = useSettings();
  const { lists } = useTasks();
  return (
    <ListGroup>
      <Choice
        label="New tasks go to"
        value={lists.some((l) => l.Id === settings.DefaultList) ? settings.DefaultList! : (lists.find((l) => l.Id === "personal")?.Id ?? lists[0]?.Id ?? "personal")}
        onChange={(v) => update({ DefaultList: v })}
        options={lists.map((l) => ({ value: l.Id, label: l.Name }))}
      />
      <Toggle label="Read dates from what I type" desc="“Pay rent fri 5pm” becomes a due date" value={settings.ReadDates !== false} onChange={(v) => update({ ReadDates: v })} />
      <Choice
        label="“Later today” means"
        value={settings.LaterToday ?? "19:00"}
        onChange={(v) => update({ LaterToday: v })}
        options={[
          { value: "19:00", label: "7 PM" },
          { value: "3h", label: "3 hours from now" },
          { value: "21:00", label: "9 PM" },
        ]}
      />
      <Choice
        label="“Tomorrow” tasks show at"
        value={settings.TomorrowTime ?? "09:00"}
        onChange={(v) => update({ TomorrowTime: v })}
        options={[
          { value: "09:00", label: "9 AM" },
          { value: "12:00", label: "Noon" },
          { value: "none", label: "No time" },
        ]}
      />
      <Seg
        label="Completed tasks"
        value={settings.CompletedTasks ?? "fold"}
        onChange={(v) => {
          // Show and Fold set how the Completed group starts; it can still be folded by hand.
          const folded = new Set(settings.TasksFolded ?? ["completed"]);
          if (v === "show") folded.delete("completed");
          else folded.add("completed");
          update({ CompletedTasks: v, TasksFolded: [...folded] });
        }}
        options={[
          { value: "show", label: "Show" },
          { value: "fold", label: "Fold" },
          { value: "hide", label: "Hide" },
        ]}
      />
    </ListGroup>
  );
}

// ----- Habits and goals -----

export function HabitsSettings() {
  const { settings, update } = useSettings();
  return (
    <>
      <ListGroup title="HABITS">
        <Choice
          label="My day ends at"
          desc="For night owls: late check-ins count toward the day before"
          value={String(settings.HabitDayEnds ?? 3)}
          onChange={(v) => update({ HabitDayEnds: Number(v) })}
          options={[
            { value: "3", label: "3 AM" },
            { value: "0", label: "Midnight" },
            { value: "5", label: "5 AM" },
          ]}
        />
        <Toggle label="Streak saver" desc="One missed day a week doesn’t break a streak" value={settings.StreakSaver !== false} onChange={(v) => update({ StreakSaver: v })} />
        <Toggle label="Show habits in Tasks > Today" desc="Every habit due today, not just the ones with a reminder" value={Boolean(settings.HabitsInTasks)} onChange={(v) => update({ HabitsInTasks: v })} />
      </ListGroup>
      <ListGroup title="GOALS">
        <Choice
          label="Weekly check-in"
          desc="For new goals; each goal can change its own"
          value={settings.GoalCheckIn ?? "sun"}
          onChange={(v) => update({ GoalCheckIn: v })}
          options={[
            { value: "sun", label: "Sunday evening" },
            { value: "mon", label: "Monday morning" },
            { value: "none", label: "Off" },
          ]}
        />
        <Toggle label="Celebrate finished goals" desc="A little moment when you hit 100%" value={settings.Celebrate !== false} onChange={(v) => update({ Celebrate: v })} />
      </ListGroup>
    </>
  );
}
