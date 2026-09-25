import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { textSizes, type TextSize } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { themeFor, themes, type Theme } from "../lib/themes";
import { IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/icons";
import { ListGroup, ListRow, SectionLabel } from "../ui/bits";
import { Popup } from "../ui/Popup";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Switch } from "../ui/Switch";
import NotesSettings from "./NotesSettings";

// Settings (Settings.dc.html): a 1120 x 900 pop-up with the sections down the
// side. Phase 1 wires up Appearance and Accessibility; the rest arrive in
// Phase 7. Changes save as you go.
type SectionId =
  | "profile"
  | "general"
  | "appearance"
  | "home"
  | "notifications"
  | "shortcuts"
  | "accessibility"
  | "notes"
  | "schedule"
  | "tasks"
  | "habits"
  | "accounts"
  | "storage"
  | "privacy"
  | "about";

interface Section {
  id: SectionId;
  label: string;
  desc: string;
  icon: IconName;
  // Setting names, so search finds a section by what's in it.
  keywords?: string;
}

const groups: { label: string; items: Section[] }[] = [
  { label: "YOU", items: [{ id: "profile", label: "Profile", desc: "How Project Life greets you and where you are", icon: "profile" }] },
  {
    label: "APP",
    items: [
      { id: "general", label: "General", desc: "Startup, dates and language", icon: "settings" },
      { id: "appearance", label: "Appearance", desc: "Themes, fonts and how the app feels", icon: "appearance", keywords: "theme text size" },
      { id: "home", label: "Home screen", desc: "Pick what shows up on Home", icon: "home" },
      { id: "notifications", label: "Notifications", desc: "What can interrupt you, and when", icon: "notifications" },
      { id: "shortcuts", label: "Keyboard shortcuts", desc: "Every shortcut can be changed", icon: "shortcuts" },
      { id: "accessibility", label: "Accessibility", desc: "Make it easier to see, read and use", icon: "accessibility", keywords: "reduce motion focus ring" },
    ],
  },
  {
    label: "FEATURES",
    items: [
      { id: "notes", label: "Notes", desc: "The editor and where notes are kept", icon: "notes", keywords: "notes folder editor visual markdown link previews word wrap line numbers" },
      { id: "schedule", label: "Schedule", desc: "Defaults for new events", icon: "schedule" },
      { id: "tasks", label: "Tasks", desc: "Quick add, lists and Later", icon: "tasks" },
      { id: "habits", label: "Habits and goals", desc: "Streaks, days and check-ins", icon: "habits" },
    ],
  },
  {
    label: "DATA",
    items: [
      { id: "accounts", label: "Connected accounts", desc: "Calendars and video calls", icon: "accounts" },
      { id: "storage", label: "Storage and backup", desc: "Your data lives on this PC", icon: "storage" },
      { id: "privacy", label: "Privacy", desc: "No account, no tracking", icon: "privacy" },
      { id: "about", label: "About", desc: "Version and release notes", icon: "about" },
    ],
  },
];

const allSections = groups.flatMap((g) => g.items);

export default function SettingsPopup({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = (s: Section) => !q || s.label.toLowerCase().includes(q) || (s.keywords ?? "").includes(q);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length);
  const section = allSections.find((s) => s.id === current)!;

  return (
    <Popup onClose={onClose} width={1120} height={900} labelledBy="pl-set-title" className="flex-row!">
      <nav aria-label="Settings sections" className="flex w-[280px] shrink-0 flex-col gap-[14px] border-r border-line bg-side px-[14px] pt-[22px] pb-4">
        <h2 id="pl-set-title" className="m-0 px-[10px] font-head text-24 font-bold tracking-[-0.01em]">
          Settings
        </h2>
        <label className="flex h-10 items-center gap-[10px] rounded-[12px] border border-line bg-panel px-3 text-muted focus-within:border-accent">
          <Icon name="search" size={15} stroke={1.9} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings"
            aria-label="Search settings"
            className="min-w-0 flex-1 border-0 bg-transparent text-13 text-text"
          />
        </label>
        <div className="flex min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto">
          {shown.map((g) => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <span className="px-3 pb-1 font-mono text-10 tracking-[0.12em] text-muted">{g.label}</span>
              {g.items.map((s) => {
                const on = s.id === current;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setCurrent(s.id)}
                    className={clsx(
                      "flex h-10 items-center gap-3 rounded-[11px] px-3 text-left text-14 font-medium transition-colors duration-150",
                      on ? "bg-panel text-text" : "text-muted hover:text-text",
                    )}
                  >
                    <span className={clsx("flex", on ? "text-accent" : "text-muted")}>
                      <Icon name={s.icon} size={17} />
                    </span>
                    <span className="flex-1">{s.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {!shown.length && <span className="px-3 text-13 text-muted">No settings match that.</span>}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 pt-[10px] text-12 text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-accent2" />
          Changes save as you go
        </div>
      </nav>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line pt-6 pr-5 pb-[18px] pl-8">
          <div className="flex items-center gap-[14px]">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-accent-soft text-accent">
              <Icon name={section.icon} size={20} />
            </span>
            <div className="flex flex-col gap-[3px]">
              <h3 className="m-0 text-20 font-semibold tracking-[-0.01em]">{section.label}</h3>
              <span className="text-13 text-muted">{section.desc}</span>
            </div>
          </div>
          <IconButton icon="close" label="Close settings" title="Close (Esc)" iconStroke={2.2} onClick={onClose} />
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-8 pt-6 pb-8">
          {current === "appearance" ? <Appearance /> : current === "accessibility" ? <Accessibility /> : current === "notes" ? <NotesSettings /> : <Later />}
        </div>
      </section>
    </Popup>
  );
}

function Appearance() {
  const { settings, update } = useSettings();
  const selected = themeFor(settings.Theme).id;
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Theme</SectionLabel>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-4 gap-3">
          {themes.map((t) => (
            <ThemeCard key={t.id} theme={t} selected={t.id === selected} onPick={() => update({ Theme: t.id })} />
          ))}
        </div>
      </div>
      <ListGroup title="TEXT">
        <ListRow label="Text size" description="Changes the size of all text. Layouts keep their spacing.">
          <SegmentedControl<TextSize>
            label="Text size"
            surface="panel"
            size="sm"
            value={settings.TextSize}
            onChange={(v) => update({ TextSize: v })}
            options={textSizes.map((s) => ({ value: s, label: s }))}
          />
        </ListRow>
      </ListGroup>
      <Later note="Matching Windows light and dark, accent color, window background, headline font and density arrive in Phase 7." />
    </>
  );
}

function Accessibility() {
  const { settings, update } = useSettings();
  return (
    <>
      <ListGroup>
        <ListRow label="Reduce motion" description="Turns off animations and the live pulse">
          <Switch label="Reduce motion" checked={settings.ReduceMotion} onChange={(v) => update({ ReduceMotion: v })} />
        </ListRow>
        <ListRow label="Always show the focus ring" description="Not just when using the keyboard">
          <Switch label="Always show the focus ring" checked={settings.AlwaysShowFocus} onChange={(v) => update({ AlwaysShowFocus: v })} />
        </ListRow>
      </ListGroup>
      <Later note="Higher contrast, bigger click targets, underlined links and screen reader announcements arrive in Phase 7." />
    </>
  );
}

function Later({ note }: { note?: ReactNode }) {
  return (
    <div className="rounded-[16px] border border-dashed border-line px-[18px] py-4 text-13 leading-[1.5] text-muted">
      {note ?? "This section arrives in Phase 7."}
    </div>
  );
}

// A little drawing of the app in that theme's own colors (Settings.dc.html).
function ThemeCard({ theme, selected, onPick }: { theme: Theme; selected: boolean; onPick: () => void }) {
  const p = theme.preview;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="flex flex-col gap-[10px] rounded-[18px] bg-panel px-2 pt-2 pb-3 text-left transition-[border-color] duration-150"
      style={{ border: `2px solid ${selected ? "var(--accent)" : "transparent"}` }}
    >
      <span className="flex h-24 overflow-hidden rounded-[12px]" style={{ background: p.bg, border: `1px solid ${p.line}` }}>
        <span className="flex w-[22px] flex-col items-center gap-[5px] pt-2" style={{ background: p.side, borderRight: `1px solid ${p.line}` }}>
          <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: p.accent }} />
          <span className="h-[3px] w-2 rounded-[2px] opacity-60" style={{ background: p.muted }} />
          <span className="h-[3px] w-2 rounded-[2px] opacity-60" style={{ background: p.muted }} />
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-[9px]">
          <span className="h-[7px] w-[60%] rounded-[3px]" style={{ background: p.text }} />
          <span className="flex flex-1 gap-[5px]">
            <span className="flex flex-[2] items-end rounded-[6px] p-[5px]" style={{ background: p.panel }}>
              <span className="h-[5px] w-[60%] rounded-[3px]" style={{ background: p.accent }} />
            </span>
            <span className="flex flex-1 items-center justify-center rounded-[6px]" style={{ background: p.panel }}>
              <span className="h-[14px] w-[14px] rounded-full" style={{ border: `3px solid ${p.accent2}` }} />
            </span>
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between px-1">
        <span className="text-14 font-semibold">{theme.name}</span>
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="check" size={11} stroke={3.4} />
          </span>
        )}
      </span>
      <span className="px-1 text-11 text-muted">{theme.mood}</span>
    </button>
  );
}
