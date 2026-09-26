import { announceData, defaultName, readSettings, writeSettings } from "./api";
import { themeFor, type ThemeId } from "./themes";

// Settings live in Data\settings.json. Keys are PascalCase, and keys this
// version doesn't know about are kept: loading spreads the file over the
// defaults and saving writes the whole object back.
export type TextSize = "S" | "M" | "L" | "XL";

export interface Settings {
  Theme: ThemeId;
  TextSize: TextSize;
  ReduceMotion: boolean;
  AlwaysShowFocus: boolean;
  DisplayName: string;
  // Home (read through home/prefs.ts, which checks their shape).
  WeatherLocation?: unknown;
  TemperatureUnit?: "C" | "F";
  NewsSources?: unknown;
  HomeNewsTopic?: string;
  // Notes, with Checkpoint's names so Import from Checkpoint can carry them over.
  EditorMode?: "Visual" | "Markdown";
  Tabs?: string[];
  ActiveTab?: string | null;
  SortByPriority?: boolean;
  LinkPreviews?: boolean;
  WordWrap?: boolean;
  LineNumbers?: boolean;
  DefaultCodeLanguage?: string;
  EmojiSkinTone?: number;
  RecentEmoji?: string[];
  NotesFolder?: string | null;
  // Tasks: the view ("today", "upcoming", "all", "someday", "completed", or
  // "list:<id>"), the grouping, and the groups folded shut.
  TasksView?: string;
  TasksGroupBy?: "date" | "list";
  TasksFolded?: string[];
  // Closing the window keeps Project Life in the tray (default), so
  // reminders still fire. Read by Rust too (lib.rs).
  KeepInTray?: boolean;
  // Schedule: the view, and the calendars hidden from it.
  ScheduleView?: "week" | "month";
  ScheduleHidden?: string[];
  // Habits (Settings → Habits and goals, Phase 7): the hour the day ends
  // (3 = 3 AM), and whether one missed day a week keeps a streak.
  HabitDayEnds?: number;
  StreakSaver?: boolean;
  // Habits: the view, and the habit selected.
  HabitsView?: "today" | "todo" | "done";
  // Goals: the view, the area filter, and the sort.
  GoalsView?: "active" | "behind" | "done";
  GoalsArea?: string | null;
  GoalsSort?: "due" | "risk";

  // ----- Settings (Settings.dc.html), section by section -----
  // Profile: the line at the top of Home, and the picture (a file in Data).
  Greeting?: "evening" | "hey" | "off";
  ProfilePicture?: string | null;
  // General.
  StartWithWindows?: boolean;
  OpenTo?: "home" | "notes" | "schedule" | "tasks" | "last";
  LastScreen?: string;
  WeekStart?: "sunday" | "monday";
  Clock?: "12" | "24";
  DateFormat?: "short" | "dmy" | "iso";
  Language?: "en-US" | "en-GB";
  AutoUpdate?: boolean;
  UpdateChannel?: "stable" | "beta";
  // ISO; when updates were last looked for.
  LastUpdateCheck?: string | null;
  // Appearance.
  MatchWindows?: boolean;
  Accent?: "theme" | "violet" | "mint" | "orange" | "sky" | "pink";
  Material?: "solid" | "mica" | "acrylic";
  // "atkinson", "geist", "system", or a font family added in Settings.
  HeadlineFont?: string;
  Density?: "comfortable" | "compact";
  SidebarStyle?: "full" | "icons";
  // Home screen: cards turned off.
  HiddenCards?: string[];
  // Notifications.
  NotifyEvents?: boolean;
  NotifyCalls?: boolean;
  NotifyTasks?: boolean;
  NotifyHabits?: boolean;
  NotifyGoals?: boolean;
  QuietHours?: "2-10" | "23-7" | "off";
  QuietWhileLive?: boolean;
  ObsPort?: number;
  Sound?: "chime" | "pop" | "none";
  // Keyboard shortcuts: command id → keys, where they differ from the defaults.
  Shortcuts?: Record<string, string>;
  // Accessibility.
  HigherContrast?: boolean;
  BigTargets?: boolean;
  UnderlineLinks?: boolean;
  Announce?: boolean;
  // Notes.
  SpellCheck?: boolean;
  Cursor?: "line" | "block" | "underline";
  OpenInNewTab?: boolean;
  // Schedule: new-event defaults, and the time zone new events start in.
  EventCalendar?: string;
  EventLength?: number;
  EventReminder?: number | null;
  EventVideo?: "none" | "teams" | "meet" | "zoom";
  ScheduleZone?: string | null;
  // Tasks.
  DefaultList?: string;
  ReadDates?: boolean;
  LaterToday?: "19:00" | "3h" | "21:00";
  TomorrowTime?: "09:00" | "12:00" | "none";
  CompletedTasks?: "show" | "fold" | "hide";
  // Habits and goals.
  HabitsInTasks?: boolean;
  GoalCheckIn?: "sun" | "mon" | "none";
  Celebrate?: boolean;
  // Storage and backup.
  Backup?: boolean;
  BackupFolder?: string | null;
  LastBackup?: string | null;
  // Privacy.
  SaveCrashReports?: boolean;
  // Connected accounts: how often calendars sync, and declined invitations.
  SyncEvery?: "5" | "15" | "open";
  ShowDeclined?: boolean;
  [key: string]: unknown;
}

export const textSizes: TextSize[] = ["S", "M", "L", "XL"];

export const textScale: Record<TextSize, number> = { S: 0.9, M: 1, L: 1.15, XL: 1.3 };

const defaults: Settings = {
  Theme: "midnight",
  TextSize: "M",
  ReduceMotion: false,
  AlwaysShowFocus: false,
  DisplayName: "",
};

export async function loadSettings(): Promise<Settings> {
  let saved: Record<string, unknown> = {};
  try {
    const text = await readSettings();
    if (text) saved = JSON.parse(text);
  } catch {
    // A damaged file shouldn't stop the app from opening; defaults it is.
  }
  const settings: Settings = { ...defaults, ...saved };
  current = settings;
  settings.Theme = themeFor(settings.Theme).id;
  if (!textSizes.includes(settings.TextSize)) settings.TextSize = "M";
  if (!settings.DisplayName) settings.DisplayName = await defaultName().catch(() => "");
  return settings;
}

// Saves run one after another, so a fast run of changes can't land out of order.
let queue: Promise<void> = Promise.resolve();

// The settings as last loaded or changed, for code outside React (dates,
// reminders, quick add). SettingsContext keeps it up to date.
let current: Settings = defaults;

export function currentSettings(): Settings {
  return current;
}

export function setCurrentSettings(s: Settings) {
  current = s;
}

export function saveSettings(settings: Settings): Promise<void> {
  const text = JSON.stringify(settings, null, 2);
  queue = queue
    .then(() => writeSettings(text))
    // The popped-out Tasks window follows the theme and text size.
    .then(() => announceData("settings.json"))
    .catch((e) => console.error("Couldn't save settings", e));
  return queue;
}
