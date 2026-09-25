import { useState, type ReactNode } from "react";
import { textSizes, type TextSize } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { themes, type ThemeId } from "../lib/themes";
import { Button, IconButton } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/icons";
import { KeyCaps, ListGroup, ListRow, SectionLabel, StatusPill } from "../ui/bits";
import { Popup, PopupBody, PopupFooter, PopupHeader } from "../ui/Popup";
import { ProgressBar, ProgressRing } from "../ui/Progress";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Stepper } from "../ui/Stepper";
import { Switch } from "../ui/Switch";

// Every starter component in one place, for checking them in all four
// themes and text sizes. Development builds only.
export default function Gallery() {
  const { settings, update } = useSettings();
  const [group, setGroup] = useState<"date" | "list">("date");
  const [size, setSize] = useState("M");
  const [kind, setKind] = useState("num");
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [topic, setTopic] = useState("All");
  const [reminders, setReminders] = useState<Record<string, boolean>>({ r10: true });
  const [checks, setChecks] = useState<Record<string, boolean>>({ b: true, e: true });
  const [ring, setRing] = useState(0.67);
  const [count, setCount] = useState(5);
  const [target, setTarget] = useState(8);
  const [popup, setPopup] = useState(false);
  const toggle = (k: string) => setChecks((c) => ({ ...c, [k]: !c[k] }));

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-8 pt-[26px] pb-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-12 tracking-[0.14em] text-muted">DEVELOPMENT ONLY</span>
          <h2 className="m-0 font-head text-40 leading-none font-bold tracking-[-0.02em]">Components</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl<ThemeId> label="Theme" value={settings.Theme} onChange={(v) => update({ Theme: v })} options={themes.map((t) => ({ value: t.id, label: t.name }))} />
          <SegmentedControl<TextSize> label="Text size" value={settings.TextSize} onChange={(v) => update({ TextSize: v })} options={textSizes.map((s) => ({ value: s, label: s }))} />
          <label className="flex items-center gap-1 text-13 text-muted">
            Reduce motion
            <Switch label="Reduce motion" size="sm" checked={settings.ReduceMotion} onChange={(v) => update({ ReduceMotion: v })} />
          </label>
        </div>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-5">
        <Card title="Pop-up shell">
          <p className="m-0 text-14 leading-[1.5] text-muted">Esc, the X, Cancel or a click on the dimmed area closes it. Ctrl+Enter runs the main button. Tab stays inside.</p>
          <div className="flex gap-2">
            <Button variant="primary" icon="plus" onClick={() => setPopup(true)}>
              Open a sample pop-up
            </Button>
          </div>
          <div className="flex items-center gap-[10px]">
            <span className="pl-pulse h-2 w-2 rounded-full bg-accent2" />
            <span className="font-mono text-12 tracking-[0.14em] text-accent2">UP NEXT</span>
            <span className="text-12 text-muted">The live pulse stops with Reduce motion.</span>
          </div>
        </Card>

        <Card title="Buttons">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" hint="Ctrl Enter">
              Create goal
            </Button>
            <Button>Cancel</Button>
            <Button variant="quiet">Snooze 10m</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="md" icon="plus" variant="primary">
              Add
            </Button>
            <Button size="sm">Browse fonts</Button>
            <Button size="sm" variant="danger">
              Delete
            </Button>
            <IconButton icon="close" label="Close" iconStroke={2.2} />
            <IconButton icon="plus" label="New" size={36} />
          </div>
        </Card>

        <Card title="Segmented control">
          <SegmentedControl label="Group by" value={group} onChange={setGroup} options={[{ value: "date", label: "Date" }, { value: "list", label: "List" }]} />
          <SegmentedControl
            label="How you'll measure it"
            size="lg"
            fill
            value={kind}
            onChange={setKind}
            options={[
              { value: "num", label: "Reach a number" },
              { value: "ms", label: "Hit milestones" },
              { value: "once", label: "Done or not" },
            ]}
          />
          <ListGroup>
            <ListRow label="On a panel" description="Track and selection swap places">
              <SegmentedControl label="Size" surface="panel" size="sm" value={size} onChange={setSize} options={["S", "M", "L", "XL"].map((s) => ({ value: s, label: s }))} />
            </ListRow>
          </ListGroup>
        </Card>

        <Card title="Switch, section label, list rows">
          <ListGroup title="STARTUP">
            <ListRow label="Keep running in the tray" description="Reminders still fire when the window is closed">
              <Switch label="Keep running in the tray" checked={on} onChange={setOn} />
            </ListRow>
            <ListRow label="Open when Windows starts">
              <Switch label="Open when Windows starts" checked={off} onChange={setOff} />
            </ListRow>
            <ListRow label="Quick capture">
              <KeyCaps keys={["Ctrl", "K"]} />
            </ListRow>
            <ListRow label="Delete all data on this PC" description="Can't be undone. Export first." danger>
              <Button size="sm" variant="danger">
                Delete
              </Button>
            </ListRow>
          </ListGroup>
          <div className="flex items-center gap-2 text-13 text-muted">
            Small, for pop-ups
            <Switch label="Small switch" size="sm" checked={on} onChange={setOn} />
          </div>
        </Card>

        <Card title="Chips and tags">
          <div className="flex flex-wrap gap-2">
            <Chip>#design</Chip>
            <Chip>#themes</Chip>
            <Chip variant="outline">Checkpoint / Design</Chip>
            <Chip variant="outline" dot="var(--warn)">
              Checkpoint
            </Chip>
            <Chip variant="dashed" onClick={() => {}}>
              + Tag
            </Chip>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["All", "Gaming", "Tech", "Local"].map((t) => (
              <Chip key={t} variant="pill" selected={topic === t} onClick={() => setTopic(t)}>
                {t}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              ["r0", "At start"],
              ["r10", "10 min before"],
              ["r30", "30 min before"],
              ["r1d", "1 day before"],
            ].map(([k, label]) => (
              <Chip key={k} variant="toggle" selected={!!reminders[k]} onClick={() => setReminders((r) => ({ ...r, [k]: !r[k] }))}>
                {label}
              </Chip>
            ))}
          </div>
        </Card>

        <Card title="Checkboxes">
          <Row label="Tasks, by priority">
            <Checkbox label="High" checked={!!checks.a} onChange={() => toggle("a")} tone="var(--danger)" />
            <Checkbox label="Medium" checked={!!checks.c} onChange={() => toggle("c")} tone="var(--warn)" />
            <Checkbox label="Low" checked={!!checks.d} onChange={() => toggle("d")} tone="var(--accent2)" />
            <Checkbox label="None" checked={!!checks.b} onChange={() => toggle("b")} />
          </Row>
          <Row label="Home card, subtasks, calendars">
            <Checkbox label="Home task" shape="square" checked={!!checks.e} onChange={() => toggle("e")} />
            <Checkbox label="Subtask" shape="square" size={20} fill="var(--accent2)" checked={!!checks.f} onChange={() => toggle("f")} />
            <Checkbox label="Calendar" shape="square" size={18} tone="var(--accent2)" fill="var(--accent2)" checked={!checks.g} onChange={() => toggle("g")} />
          </Row>
        </Card>

        <Card title="Progress">
          <div className="flex items-center gap-6">
            <ProgressRing value={ring} size={132} radius={54} stroke={12}>
              <span className="font-mono text-26 font-medium">{Math.round(ring * 100)}%</span>
              <span className="text-11 tracking-[0.08em] text-muted">DONE</span>
            </ProgressRing>
            <ProgressRing value={ring} size={60} radius={24} stroke={7} />
            <ProgressRing value={ring} size={54} radius={22} stroke={6} color="var(--accent2)" />
            <div className="flex flex-col gap-1">
              <IconButton icon="plus" label="More" size={36} onClick={() => setRing((r) => Math.min(1, r + 0.1))} />
              <IconButton icon="minus" label="Less" size={36} onClick={() => setRing((r) => Math.max(0, r - 0.1))} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="flex items-baseline justify-between text-12 text-muted">
              <b className="font-head text-26 font-bold tracking-[-0.02em] text-text">71%</b>
              <span>214 / 300 miles</span>
            </span>
            <ProgressBar value={71} pace={73} color="var(--hue-1)" label="Walk 300 miles" />
          </div>
          <ProgressBar value={25} height={4} color="var(--accent2)" label="Subtasks" />
        </Card>

        <Card title="Stepper and status pills">
          <Row label="Habit (count)">
            <Stepper value={count} onChange={setCount} target={8} max={12} color="var(--hue-4)" decLabel="Remove one glass" incLabel="Add one glass" />
          </Row>
          <Row label="Target (pop-up)">
            <Stepper variant="field" value={target} onChange={setTarget} min={1} decLabel="Lower target" incLabel="Raise target" />
          </Row>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="done">Done</StatusPill>
            <StatusPill tone="ahead">Ahead</StatusPill>
            <StatusPill>On track</StatusPill>
            <StatusPill tone="behind">Behind</StatusPill>
          </div>
        </Card>

        <Card title="Theme colors">
          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="flex h-12 items-center justify-center rounded-[12px]" style={{ background: `color-mix(in srgb, var(--hue-${i}) 16%, transparent)`, color: `var(--hue-${i})` }}>
                <Icon name="flame" size={18} />
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-12">
            <span className="rounded-[8px] bg-warn-soft px-[10px] py-1.5 text-warn">warn</span>
            <span className="rounded-[8px] bg-accent2-soft px-[10px] py-1.5 text-accent2">accent2</span>
            <span className="rounded-[8px] bg-accent-soft px-[10px] py-1.5 text-accent">accent</span>
            <span className="rounded-[8px] bg-panel2 px-[10px] py-1.5 text-danger">danger</span>
          </div>
        </Card>
      </div>

      {popup && <SamplePopup onClose={() => setPopup(false)} />}
    </main>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[22px] border border-line bg-panel p-6">
      <SectionLabel as="h3" className="m-0 font-normal">
        {title}
      </SectionLabel>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-13 text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

// A stand-in pop-up built from the shell, laid out like New goal.
function SamplePopup({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("Walk 100 miles before the new year");
  const [auto, setAuto] = useState(true);
  return (
    <Popup onClose={onClose} onSubmit={onClose} width={1060} height={920} labelledBy="pl-sample-title">
      <PopupHeader tag="NEW GOAL" onClose={onClose}>
        Something you want to get done, and a way to know you got there.
      </PopupHeader>
      <PopupBody>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-7 py-[22px]">
          <label htmlFor="pl-sample-title">
            <SectionLabel>The goal</SectionLabel>
          </label>
          <input
            id="pl-sample-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-[50px] rounded-[14px] border border-line bg-panel px-4 font-head text-22 font-bold text-text focus:border-accent"
          />
          <div className="flex min-h-[52px] items-center gap-[14px] rounded-[14px] border border-line py-2 pr-2 pl-[14px]">
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-14 font-medium">Count habit check-ins toward this goal</span>
              <span className="text-12 text-muted">A sample row with a small switch</span>
            </span>
            <Switch size="sm" label="Count habit check-ins" checked={auto} onChange={setAuto} />
          </div>
          <div className="h-[900px] shrink-0 rounded-[14px] border border-dashed border-line p-4 text-13 text-muted">
            A tall block, to show this column scrolls by itself when the window is short.
          </div>
        </div>
        <aside className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-line bg-side px-[22px] py-6">
          <SectionLabel>Preview</SectionLabel>
          <div className="flex flex-col gap-[14px] rounded-[22px] border-[1.5px] border-hue-1 bg-panel p-[18px]">
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-12 text-muted">
                <span className="h-2 w-2 rounded-[3px] bg-hue-1" />
                Health · Due Dec 31
              </span>
              <StatusPill>New</StatusPill>
            </span>
            <span className="text-18 leading-[1.3] font-semibold">{title || "New goal"}</span>
            <ProgressBar value={0} color="var(--hue-1)" />
          </div>
        </aside>
      </PopupBody>
      <PopupFooter summary={`${title || "New goal"} · Health · due Dec 31`} onCancel={onClose} primaryLabel="Create goal" onPrimary={onClose} />
    </Popup>
  );
}
