import { useCallback, useEffect, useRef, useState } from "react";
import Gallery from "./dev/Gallery";
import HomeScreen from "./home/HomeScreen";
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

const screens: Record<Exclude<Screen, "home">, () => React.JSX.Element> = {
  notes: NotesScreen,
  schedule: ScheduleScreen,
  tasks: TasksScreen,
  habits: HabitsScreen,
  goals: GoalsScreen,
  gallery: Gallery,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureSignal, setCaptureSignal] = useState(0);
  const showNotes = useCallback(() => setScreen("notes"), []);
  useTaskReminders();
  const { settings } = useSettings();
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

  // Ctrl+, opens and closes Settings; Ctrl+K goes to Home's quick capture,
  // except while typing in a note, where it adds a link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+Shift+T: a new task (Settings → Shortcuts).
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "t" && !document.getElementById("app-content")?.inert) {
        e.preventDefault();
        requestTasks({ kind: "new" });
        return;
      }
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
      // Ctrl+E: a new event, except in a note, where it's inline code.
      if (e.key.toLowerCase() === "e" && !document.getElementById("app-content")?.inert && !(e.target as HTMLElement | null)?.closest?.(".ProseMirror, .cm-editor")) {
        e.preventDefault();
        requestSchedule({ kind: "new" });
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen((open) => !open);
      } else if (e.key.toLowerCase() === "k" && !document.getElementById("app-content")?.inert) {
        if ((e.target as HTMLElement | null)?.closest?.(".ProseMirror, .cm-editor")) return;
        e.preventDefault();
        setScreen("home");
        setCaptureSignal((n) => n + 1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
            {screen === "home" ? (
              <HomeSidebar screen={screen} onNavigate={setScreen} onSettings={openSettings} />
            ) : (
              <IconRail screen={screen} onNavigate={setScreen} onSettings={openSettings} />
            )}
            {Current ? <Current /> : <HomeScreen onNavigate={setScreen} captureSignal={captureSignal} />}
          </div>
          {/* Pop-ups draw here, over the screen but under the title bar. */}
          <div id="popup-layer" className="pointer-events-none absolute inset-0 z-40" />
          {settingsOpen && <SettingsPopup onClose={() => setSettingsOpen(false)} />}
          <Toaster />
        </div>
      </div>
    </NotesProvider>
  );
}
