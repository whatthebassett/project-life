import { useCallback, useEffect, useState } from "react";
import Gallery from "./dev/Gallery";
import HomeScreen from "./home/HomeScreen";
import { NotesProvider } from "./notes/NotesContext";
import NotesScreen from "./notes/NotesScreen";
import { Goals, Habits, Schedule, Tasks } from "./screens/screens";
import SettingsPopup from "./settings/SettingsPopup";
import HomeSidebar from "./shell/HomeSidebar";
import IconRail from "./shell/IconRail";
import { screenName, type Screen } from "./shell/nav";
import TitleBar from "./shell/TitleBar";

const screens: Record<Exclude<Screen, "home">, () => React.JSX.Element> = {
  notes: NotesScreen,
  schedule: Schedule,
  tasks: Tasks,
  habits: Habits,
  goals: Goals,
  gallery: Gallery,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [captureSignal, setCaptureSignal] = useState(0);
  const showNotes = useCallback(() => setScreen("notes"), []);

  // Ctrl+, opens and closes Settings; Ctrl+K goes to Home's quick capture,
  // except while typing in a note, where it adds a link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.shiftKey) return;
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
          <div id="popup-layer" className="pointer-events-none absolute inset-0" />
          {settingsOpen && <SettingsPopup onClose={() => setSettingsOpen(false)} />}
        </div>
      </div>
    </NotesProvider>
  );
}
