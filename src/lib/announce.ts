// Settings → Accessibility → Announce changes to screen readers: a polite
// live region, off-screen, that says what just changed ("Done: Pay rent",
// "Reading, 6 day streak").
import { currentSettings } from "./settings";

let region: HTMLElement | null = null;
let clearTimer = 0;

export const announcing = () => currentSettings().Announce !== false;

export function announce(text: string) {
  if (!announcing() || typeof document === "undefined") return;
  if (!region) {
    region = document.createElement("div");
    region.setAttribute("aria-live", "polite");
    region.setAttribute("role", "status");
    region.className = "sr-only";
    document.body.appendChild(region);
  }
  // Emptied first, so the same words twice are read twice.
  region.textContent = "";
  const el = region;
  window.setTimeout(() => (el.textContent = text), 50);
  window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => (el.textContent = ""), 5000);
}
