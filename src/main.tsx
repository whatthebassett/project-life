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
import { applyAppearance } from "./lib/appearance";
import { loadSettings } from "./lib/settings";
import { SettingsProvider } from "./lib/SettingsContext";

// The window starts hidden. Load the settings and put the theme on first, so
// the app never flashes the wrong colors, then show it.
async function start() {
  const settings = await loadSettings();
  applyAppearance(settings);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <SettingsProvider initial={settings}>
        <App />
      </SettingsProvider>
    </React.StrictMode>,
  );
}

void start().finally(() => {
  if (!inTauri) return;
  requestAnimationFrame(() => {
    const win = getCurrentWindow();
    void win.show().then(() => win.setFocus());
  });
});
