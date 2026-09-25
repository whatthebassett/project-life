// Motion is off when Reduce motion is on in Settings → Accessibility, or when
// Windows' "Animation effects" is off.
export function systemReducesMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function motionReduced(): boolean {
  return document.documentElement.dataset.motion === "reduced" || systemReducesMotion();
}

// A pop-up zooming out as it closes. React removes a pop-up the moment it's
// closed, however that happens (Save, Cancel, Esc, clicking away), so what
// animates is a copy left in its place: the scrim fades while the panel
// ([data-popup-panel]) shrinks away, and then the copy is gone. It can't be
// clicked or focused while it goes.
export function zoomOut(overlay: HTMLElement | null) {
  if (!overlay || motionReduced()) return;
  const parent = overlay.parentElement;
  const next = overlay.nextSibling;
  // Only once it has really left the page: React's development checks
  // unmount and remount a pop-up as it opens, leaving it right where it is.
  queueMicrotask(() => {
    if (!overlay.isConnected && parent?.isConnected) playZoomOut(overlay, parent, next);
  });
}

function playZoomOut(overlay: HTMLElement, parent: HTMLElement, next: ChildNode | null) {
  const ghost = overlay.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.style.pointerEvents = "none";
  ghost.style.animation = "none";
  parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);
  // [data-modal-panel]: Checkpoint's note switcher (components/NotePicker.tsx).
  const scrim = ghost.querySelector<HTMLElement>("[data-popup-scrim]");
  const panel = ghost.querySelector<HTMLElement>("[data-popup-panel], [data-modal-panel]");
  if (scrim) scrim.style.animation = "none";
  if (panel) panel.style.animation = "none";
  const done = () => ghost.remove();
  ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: "ease-in", fill: "forwards" }).onfinish = done;
  panel?.animate([{ transform: "scale(1)" }, { transform: "scale(0.96)" }], { duration: 170, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" });
  window.setTimeout(done, 400);
}
