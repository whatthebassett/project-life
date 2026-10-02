import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
// The fonts ship inside the app so it looks right offline (DESIGN.md §3).
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/geist-mono/latin-500.css";
import "./styles/index.css";
import App from "./App";
import { inTauri } from "./lib/api";
import { applyAppearance, watchSystemTheme } from "./lib/appearance";
import { currentSettings, loadSettings } from "./lib/settings";
import { refreshAppFonts } from "./lib/fonts";
import { SettingsProvider } from "./lib/SettingsContext";
import TasksWindow from "./tasks/TasksWindow";
import { isTasksWindow } from "./tasks/window";

// The window starts hidden. Load the settings and put the theme on first, so
// the app never flashes the wrong colors, then show it.
async function start() {
  const settings = await loadSettings();
  applyAppearance(settings);
  void watchSystemTheme(currentSettings);
  // Fonts added in Settings, for a headline font picked from them.
  void refreshAppFonts();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <SettingsProvider initial={settings}>
        {isTasksWindow() ? <TasksWindow /> : <App />}
      </SettingsProvider>
    </React.StrictMode>,
  );
}

void start().finally(() => {
  // Tasks' own window shows itself once it's drawn.
  if (!inTauri || isTasksWindow()) return;
  // Once the first frame is drawn. A Mac's web view draws no frames while
  // its window is hidden, so there a short wait stands in for the frame.
  let shown = false;
  const show = () => {
    if (shown) return;
    shown = true;
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());
  };
  requestAnimationFrame(show);
  setTimeout(show, 80);
});
