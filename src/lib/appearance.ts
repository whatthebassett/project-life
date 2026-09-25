import { Effect, getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri, system } from "./api";
import { textScale, type Settings } from "./settings";
import { themeFor, type Theme } from "./themes";

// Puts the appearance settings on the page: the theme and the flags the CSS
// reads, all on <html>. It's synchronous so a theme switch lands in the same
// frame as the click; the window frame (light/dark, Mica or Acrylic) follows
// in the background.

// Windows' own light or dark, for Match Windows light and dark; kept fresh by
// watchSystemTheme.
let windowsScheme: "light" | "dark" = "dark";
// Windows 11 (22000+) draws Mica and Acrylic.
let windows11 = false;

// The theme showing now: Daylight when Windows is light and Match is on;
// with Match on and Windows dark, the chosen theme (Midnight if that's
// Daylight).
export function effectiveTheme(settings: Settings): Theme {
  const chosen = themeFor(settings.Theme);
  if (!settings.MatchWindows) return chosen;
  if (windowsScheme === "light") return themeFor("daylight");
  return chosen.id === "daylight" ? themeFor("midnight") : chosen;
}

// Settings → Appearance → Accent color: dark themes get the bright version,
// Daylight the deep one.
export const accentChoices: { id: NonNullable<Settings["Accent"]>; name: string; dark: string; light: string }[] = [
  { id: "violet", name: "Violet", dark: "#A092FF", light: "#5A48E0" },
  { id: "mint", name: "Mint", dark: "#4FE0B0", light: "#0B8A6D" },
  { id: "orange", name: "Orange", dark: "#FF9A5C", light: "#B4501A" },
  { id: "sky", name: "Sky", dark: "#6FA8FF", light: "#2F6FD6" },
  { id: "pink", name: "Pink", dark: "#F28DC4", light: "#B23A7C" },
];

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The headline font: Atkinson Hyperlegible (the default), Geist, Windows' own,
// or a font added in Settings.
export function headFontStack(choice: string | undefined): string {
  if (!choice || choice === "atkinson") return '"Atkinson Hyperlegible", "Geist", ui-sans-serif, system-ui, sans-serif';
  if (choice === "geist") return '"Geist", ui-sans-serif, system-ui, sans-serif';
  if (choice === "system") return '"Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif';
  return `"${choice.replace(/"/g, "")}", "Geist", ui-sans-serif, system-ui, sans-serif`;
}

const flag = (root: HTMLElement, name: string, on: boolean | undefined, value = "on") => {
  if (on) root.dataset[name] = value;
  else delete root.dataset[name];
};

export function applyAppearance(settings: Settings) {
  const root = document.documentElement;
  const theme = effectiveTheme(settings);
  root.dataset.theme = theme.id;
  // Light or dark, for the rules ported from Checkpoint (styles/editor.css).
  root.dataset.scheme = theme.scheme;
  root.style.setProperty("--text-scale", String(textScale[settings.TextSize] ?? 1));
  flag(root, "motion", settings.ReduceMotion, "reduced");
  flag(root, "focus", settings.AlwaysShowFocus, "always");
  // Accessibility and layout flags the CSS reads (styles/index.css).
  flag(root, "contrast", settings.HigherContrast, "high");
  flag(root, "targets", settings.BigTargets, "big");
  flag(root, "links", settings.UnderlineLinks, "underline");
  flag(root, "density", settings.Density === "compact", "compact");
  // Settings → Notes: the cursor's shape, and spell check (inherited by every
  // text box and note that doesn't turn it off itself).
  flag(root, "cursor", settings.Cursor === "block" || settings.Cursor === "underline", settings.Cursor);
  root.spellcheck = settings.SpellCheck !== false;

  const accent = accentChoices.find((a) => a.id === settings.Accent);
  if (accent) {
    const light = theme.scheme === "light";
    const color = light ? accent.light : accent.dark;
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-soft", rgba(color, light ? 0.12 : 0.16));
    root.style.setProperty("--glow", rgba(color, light ? 0.08 : 0.2));
    root.style.setProperty("--today-tint", rgba(color, light ? 0.04 : 0.05));
  } else {
    for (const p of ["--accent", "--accent-soft", "--glow", "--today-tint"]) root.style.removeProperty(p);
  }

  root.style.setProperty("--head-font", headFontStack(settings.HeadlineFont));

  // Mica or Acrylic: the window's backdrop shows through the page's own
  // background and sidebars; panels stay solid so text stays easy to read.
  const glass = windows11 && settings.Material && settings.Material !== "solid" ? settings.Material : null;
  if (glass) {
    root.dataset.material = glass;
    const a = glass === "acrylic" ? 0.55 : 0.7;
    root.style.setProperty("--bg", rgba(theme.preview.bg, a));
    root.style.setProperty("--side", rgba(theme.preview.side, a - 0.1));
  } else {
    delete root.dataset.material;
    root.style.removeProperty("--bg");
    root.style.removeProperty("--side");
  }

  if (inTauri) {
    const win = getCurrentWindow();
    void win.setTheme(theme.scheme).catch(() => {});
    if (win.label === "main") {
      if (glass) void win.setEffects({ effects: [glass === "acrylic" ? Effect.Acrylic : Effect.Mica] }).catch(() => {});
      else void win.clearEffects().catch(() => {});
    }
  }
}

// Reads Windows' light/dark and version once, then keeps an eye on light/dark
// (when the window comes forward, and every minute), re-applying when it
// changes. `get` returns the settings as they are now.
export async function watchSystemTheme(get: () => Settings) {
  const [scheme, build] = await Promise.all([system.theme().catch(() => "dark" as const), system.osBuild().catch(() => 0)]);
  windowsScheme = scheme;
  windows11 = build >= 22000;
  applyAppearance(get());
  const check = async () => {
    const now = await system.theme().catch(() => windowsScheme);
    if (now !== windowsScheme) {
      windowsScheme = now;
      if (get().MatchWindows) applyAppearance(get());
    }
  };
  window.addEventListener("focus", () => void check());
  window.setInterval(() => void check(), 60_000);
}

export const isWindows11 = () => windows11;
