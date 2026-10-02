import { thisComputer } from "../lib/platform";
import clsx from "clsx";
import { useCallback, useState } from "react";
import ContextMenu, { type MenuItem, type MenuState } from "../components/ContextMenu";
import { IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/icons";
import { Popup } from "../ui/Popup";
import { SettingsMenu } from "./controls";
import NotesSettings from "./NotesSettings";
import { Accessibility, Appearance, General, HomeScreenSettings, Profile } from "./sections/app";
import { About, Accounts, Privacy, Storage } from "./sections/data";
import { HabitsSettings, Notifications, ScheduleSettings, Shortcuts, TasksSettings } from "./sections/features";

// Settings (Settings.dc.html): a 1120 x 900 pop-up with the sections down the
// side. Changes save as you go.
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
  { label: "YOU", items: [{ id: "profile", label: "Profile", desc: "How Project Life greets you and where you are", icon: "profile", keywords: "display name greeting home location weather news profile picture avatar" }] },
  {
    label: "APP",
    items: [
      { id: "general", label: "General", desc: "Startup, dates and language", icon: "settings", keywords: "open when windows starts open at login startup keep running in the tray menu bar close open to week starts on time format 12-hour 24-hour clock date format language english updates update channel beta" },
      { id: "appearance", label: "Appearance", desc: "Themes, fonts and how the app feels", icon: "appearance", keywords: "theme match windows macos light dark accent color window background mica acrylic translucent headline font text size add a font google fonts density compact sidebar icons" },
      { id: "home", label: "Home screen", desc: "Pick what shows up on Home", icon: "home", keywords: "cards up next today's progress schedule tasks goals habits recent notes news weather news sources temperature" },
      { id: "notifications", label: "Notifications", desc: "What can interrupt you, and when", icon: "notifications", keywords: "remind me about events calls about to start join tasks due habit reminders goal check-ins quiet hours stay quiet while i'm live obs meld streaming sound chime pop test" },
      { id: "shortcuts", label: "Keyboard shortcuts", desc: "Every shortcut can be changed", icon: "shortcuts", keywords: "keys keyboard quick capture go to home settings guide new note switch note visual markdown new task new event reset all shortcuts formatting tabs" },
      { id: "accessibility", label: "Accessibility", desc: "Make it easier to see, read and use", icon: "accessibility", keywords: "reduce motion higher contrast bigger click targets underline links focus ring screen readers announce" },
    ],
  },
  {
    label: "FEATURES",
    items: [
      { id: "notes", label: "Notes", desc: "The editor and where notes are kept", icon: "notes", keywords: "open notes in visual markdown link previews spell check cursor block underline new tab word wrap line numbers notes folder editor copy" },
      { id: "schedule", label: "Schedule", desc: "Defaults for new events", icon: "schedule", keywords: "new events calendar length reminder video call teams meet zoom open to week month time zone" },
      { id: "tasks", label: "Tasks", desc: "Quick add, lists and Later", icon: "tasks", keywords: "new tasks go to list read dates from what i type later today tomorrow completed tasks show fold hide" },
      { id: "habits", label: "Habits and goals", desc: "Streaks, days and check-ins", icon: "habits", keywords: "my day ends at midnight streak saver show habits in tasks today weekly check-in celebrate finished goals" },
    ],
  },
  {
    label: "DATA",
    items: [
      { id: "accounts", label: "Connected accounts", desc: "Calendars and video calls", icon: "accounts", keywords: "microsoft outlook teams google meet zoom sync calendars connect disconnect reconnect declined sign in" },
      { id: "storage", label: "Storage and backup", desc: `Your data lives on ${thisComputer}`, icon: "storage", keywords: "data folder daily backup backup folder onedrive icloud back up now space used import from checkpoint export everything zip" },
      { id: "privacy", label: "Privacy", desc: "No account, no tracking", icon: "privacy", keywords: "what goes online crash reports logs clear cached previews news delete all data" },
      { id: "about", label: "About", desc: "Version and release notes", icon: "about", keywords: "version check for updates what's new release notes made by open-source licenses" },
    ],
  },
];

const allSections = groups.flatMap((g) => g.items);

export default function SettingsPopup({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const openMenu = useCallback((x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }), []);
  const q = query.trim().toLowerCase();
  const matches = (s: Section) => !q || s.label.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q) || (s.keywords ?? "").includes(q);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter(matches) })).filter((g) => g.items.length);
  // When the search hides the open section, the first match shows instead.
  const visible = shown.some((g) => g.items.some((s) => s.id === current));
  const active: SectionId = visible || !shown.length ? current : shown[0].items[0].id;
  const section = allSections.find((s) => s.id === active)!;

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
                const on = s.id === active;
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => {
                      setCurrent(s.id);
                      setMenu(null);
                    }}
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
          <SettingsMenu.Provider value={openMenu}>{pages[active]()}</SettingsMenu.Provider>
        </div>
      </section>
      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </Popup>
  );
}

const pages: Record<SectionId, () => React.ReactNode> = {
  profile: () => <Profile />,
  general: () => <General />,
  appearance: () => <Appearance />,
  home: () => <HomeScreenSettings />,
  notifications: () => <Notifications />,
  shortcuts: () => <Shortcuts />,
  accessibility: () => <Accessibility />,
  notes: () => <NotesSettings />,
  schedule: () => <ScheduleSettings />,
  tasks: () => <TasksSettings />,
  habits: () => <HabitsSettings />,
  accounts: () => <Accounts />,
  storage: () => <Storage />,
  privacy: () => <Privacy />,
  about: () => <About />,
};
