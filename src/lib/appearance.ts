import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./api";
import { textScale, type Settings } from "./settings";
import { themeFor } from "./themes";

// Puts the appearance settings on the page: the theme and the flags the CSS
// reads, all on <html>. It's synchronous so a theme switch lands in the same
// frame as the click; the window frame's light/dark follows in the background.
export function applyAppearance(settings: Settings) {
  const root = document.documentElement;
  const theme = themeFor(settings.Theme);
  root.dataset.theme = theme.id;
  // Light or dark, for the rules ported from Checkpoint (styles/editor.css).
  root.dataset.scheme = theme.scheme;
  root.style.setProperty("--text-scale", String(textScale[settings.TextSize] ?? 1));
  if (settings.ReduceMotion) root.dataset.motion = "reduced";
  else delete root.dataset.motion;
  if (settings.AlwaysShowFocus) root.dataset.focus = "always";
  else delete root.dataset.focus;
  if (inTauri) void getCurrentWindow().setTheme(theme.scheme).catch(() => {});
}
