import { useEffect, useState } from "react";
import Gallery from "./dev/Gallery";
import Home from "./screens/Home";
import { Goals, Habits, Notes, Schedule, Tasks } from "./screens/screens";
import SettingsPopup from "./settings/SettingsPopup";
import HomeSidebar from "./shell/HomeSidebar";
import IconRail from "./shell/IconRail";
import { screenName, type Screen } from "./shell/nav";
import TitleBar from "./shell/TitleBar";

const screens: Record<Screen, () => React.JSX.Element> = {
  home: Home,
  notes: Notes,
  schedule: Schedule,
  tasks: Tasks,
  habits: Habits,
  goals: Goals,
  gallery: Gallery,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Ctrl+, opens and closes Settings from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const Current = screens[screen];
  const openSettings = () => setSettingsOpen(true);

  return (
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
          <Current />
        </div>
        {/* Pop-ups draw here, over the screen but under the title bar. */}
        <div id="popup-layer" className="pointer-events-none absolute inset-0" />
        {settingsOpen && <SettingsPopup onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
