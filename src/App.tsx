import { useCallback, useEffect, useRef, useState } from "react";
import Gallery from "./dev/Gallery";
import HomeScreen from "./home/HomeScreen";
import CommandPalette from "./palette/CommandPalette";
import { onOpenPalette, type PaletteRequest } from "./palette/open";
import { NotesProvider } from "./notes/NotesContext";
import NotesScreen from "./notes/NotesScreen";
import GoalsScreen from "./goals/GoalsScreen";
import HabitsScreen from "./habits/HabitsScreen";
import ScheduleScreen from "./schedule/ScheduleScreen";
import { onShowSchedule, requestSchedule } from "./schedule/nav";
import { onNavigate } from "./shell/go";
import SettingsPopup from "./settings/SettingsPopup";
import HomeSidebar from "./shell/HomeSidebar";
import IconRail from "./shell/IconRail";
import { screenName, type Screen } from "./shell/nav";
import TitleBar from "./shell/TitleBar";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./lib/api";
import { runBeforeClose } from "./lib/closing";
import { eventStore } from "./schedule/useEvents";
import { goalStore } from "./goals/useGoals";
import { habitStore } from "./habits/useHabits";
import { taskStore } from "./tasks/useTasks";
import { onShowTasks, requestTasks } from "./tasks/nav";
import { setReminderRules, useTaskReminders } from "./tasks/reminders";
import { rulesOf } from "./habits/useHabits";
import { useSettings } from "./lib/SettingsContext";
import TasksScreen from "./tasks/TasksScreen";
import { TASKS_OPEN } from "./tasks/TasksWindow";
import { Toaster } from "./ui/Toast";
import AppMenu from "./components/AppMenu";
import Tooltips from "./components/Tooltips";
import EventEditorHost from "./schedule/EventEditorHost";
import GuidePopup from "./shell/GuidePopup";
import Celebration from "./goals/Celebration";
import { useAccountSync } from "./accounts/sync";
import { useFeedSync } from "./schedule/feeds";
import { useAutoUpdate } from "./lib/updates";
import { useBackgroundJobs } from "./lib/jobs";
import { keyMap, keyOf } from "./lib/shortcuts";
import { textSizes, type Settings } from "./lib/settings";

const screens: Record<Exclude<Screen, "home">, () => React.JSX.Element> = {
  notes: NotesScreen,
  schedule: ScheduleScreen,
  tasks: TasksScreen,
  habits: HabitsScreen,
  goals: GoalsScreen,
  gallery: Gallery,
};

const openable: Screen[] = ["home", "notes", "schedule", "tasks", "habits", "goals"];

// Settings → General → Open to: a screen, or the last one used.
function startScreen(s: Settings): Screen {
  const pick = s.OpenTo === "last" ? s.LastScreen : s.OpenTo;
  return openable.includes(pick as Screen) ? (pick as Screen) : "home";
}

export default function App() {
  const { settings, update } = useSettings();
  const [screen, setScreen] = useState<Screen>(() => startScreen(settings));
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The command palette (Ctrl+T), and what it opened with.
  const [palette, setPalette] = useState<PaletteRequest | null>(null);
  useEffect(() => onOpenPalette((req) => setPalette(req)), []);
  const [guideOpen, setGuideOpen] = useState(false);
  const showNotes = useCallback(() => setScreen("notes"), []);
  useTaskReminders();
  useBackgroundJobs();
  useAccountSync();
  useFeedSync();
  useAutoUpdate();
  const shortcutsRef = useRef(settings.Shortcuts);
  shortcutsRef.current = settings.Shortcuts;
  const textSizeRef = useRef(settings.TextSize);
  textSizeRef.current = settings.TextSize;
  const stepTextSize = useCallback(
    (by: number) => {
      const i = textSizes.indexOf(textSizeRef.current);
      const next = textSizes[Math.min(textSizes.length - 1, Math.max(0, i + by))];
      if (next !== textSizeRef.current) update({ TextSize: next });
    },
    [update],
  );

  // Remember the screen for "Open to: Last screen".
  const openTo = settings.OpenTo;
  useEffect(() => {
    if (openTo === "last" && openable.includes(screen) && settings.LastScreen !== screen) update({ LastScreen: screen });
  }, [screen, openTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const habitRules = useRef(rulesOf(settings));
  habitRules.current = rulesOf(settings);
  useEffect(() => setReminderRules(() => habitRules.current), []);

  // Home, notes and shortcuts ask for things in Tasks; so does Tasks' own
  // window (double-clicking a task opens it here).
  useEffect(() => {
    onShowTasks(() => setScreen("tasks"));
    onShowSchedule(() => setScreen("schedule"));
    onNavigate(setScreen);
    if (!inTauri) return;
    const unlisten = listen<{ id: string }>(TASKS_OPEN, (e) => {
      const win = getCurrentWindow();
      void win.unminimize().then(() => win.setFocus());
      requestTasks({ kind: "open", id: e.payload.id, popup: true });
    });
    // Quit from the tray: save what's waiting, then go.
    const quitting = listen("app:quit", () => {
      void Promise.all([taskStore().flush(), eventStore().flush(), habitStore().flush(), goalStore().flush(), runBeforeClose()]).finally(() => void invoke("quit_app"));
    });
    return () => {
      void unlisten.then((f) => f());
      void quitting.then((f) => f());
    };
  }, []);

  useEffect(() => {
    // Settings → Keyboard shortcuts → Everywhere. Inside a note, keys that
    // are also a formatting shortcut (Ctrl+E) stay with the note.
    const onKey = (e: KeyboardEvent) => {
      const keys = keyOf(e);
      if (!keys) return;
      const overrides = shortcutsRef.current;
      const id = keyMap(overrides, ["Everywhere"]).get(keys);
      if (!id) return;
      const inEditor = Boolean((e.target as HTMLElement | null)?.closest?.(".ProseMirror, .cm-editor"));
      if (inEditor && keyMap(overrides, ["Formatting"]).has(keys)) return;
      const blocked = Boolean(document.getElementById("app-content")?.inert);
      if (blocked && id !== "app.settings") return;
      e.preventDefault();
      if (id === "app.settings") setSettingsOpen((open) => !open);
      else if (id === "app.capture") setPalette((open) => (open ? null : {}));
      else if (id === "app.home") setScreen("home");
      else if (id === "app.guide") setGuideOpen(true);
      else if (id === "app.newEvent") requestSchedule({ kind: "new" });
      else if (id === "app.larger" || id === "app.smaller") stepTextSize(id === "app.larger" ? 1 : -1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stepTextSize]);

  const openSettings = () => setSettingsOpen(true);
  const Current = screen === "home" ? null : screens[screen];

  return (
    <NotesProvider visible={screen === "notes"} onShow={showNotes}>
      <div className="flex h-full flex-col">
        <TitleBar
          title={`Project Life · ${screenName(screen)}`}
          onGallery={import.meta.env.DEV ? () => setScreen(screen === "gallery" ? "home" : "gallery") : undefined}
          galleryOpen={screen === "gallery"}
        />
        <div className="relative flex min-h-0 flex-1">
          <div id="app-content" className="flex min-w-0 flex-1">
            {screen === "home" && settings.SidebarStyle !== "icons" ? (
              <HomeSidebar screen={screen} onNavigate={setScreen} onSettings={openSettings} />
            ) : (
              <IconRail screen={screen} onNavigate={setScreen} onSettings={openSettings} />
            )}
            {Current ? <Current /> : <HomeScreen onNavigate={setScreen} />}
          </div>
          {/* Pop-ups draw here, over the screen but under the title bar. */}
          <div id="popup-layer" className="pointer-events-none absolute inset-0 z-40" />
          {settingsOpen && <SettingsPopup onClose={() => setSettingsOpen(false)} />}
          {guideOpen && <GuidePopup onClose={() => setGuideOpen(false)} />}
          {palette && (
            <CommandPalette
              initial={palette}
              onClose={() => setPalette(null)}
              onNavigate={setScreen}
              onSettings={() => setSettingsOpen(true)}
              onGuide={() => setGuideOpen(true)}
            />
          )}
          <Celebration />
          <Toaster />
          <AppMenu />
          <Tooltips />
          <EventEditorHost />
        </div>
      </div>
    </NotesProvider>
  );
}
