import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Tooltips in Project Life's look instead of Windows' plain grey ones, for
// everything that has a title. On first hover (or keyboard focus) an
// element's title moves to data-tip, so the browser's own tooltip never
// shows; its text stays with screen readers as the element's name (when it
// has none) or description. A title React sets again later moves again.
const SHOW_MS = 450;
// Frames and SVG titles aren't tooltips.
const skip = "iframe, svg, title";

interface Tip {
  text: string;
  rect: DOMRect;
}

function takeTitle(el: HTMLElement): string | null {
  const title = el.getAttribute("title");
  if (title !== null) {
    el.removeAttribute("title");
    if (!title.trim()) return el.dataset.tip ?? null;
    el.dataset.tip = title;
    const named = el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby");
    if (!named && !el.textContent?.trim()) el.setAttribute("aria-label", title);
    else if (!named || el.getAttribute("aria-label") !== title) el.setAttribute("aria-description", title);
  }
  return el.dataset.tip ?? null;
}

// The element (or its nearest ancestor) that has a tooltip.
function tipTarget(node: EventTarget | null): HTMLElement | null {
  const el = (node as Element | null)?.closest?.("[title], [data-tip]") as HTMLElement | null;
  return el && !el.matches(skip) ? el : null;
}

export default function Tooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => {
      window.clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    };
    const showFor = (el: HTMLElement, delay: number) => {
      const text = takeTitle(el);
      if (!text || current.current === el) return;
      window.clearTimeout(timer.current);
      current.current = el;
      timer.current = window.setTimeout(() => {
        if (current.current === el && el.isConnected) setTip({ text, rect: el.getBoundingClientRect() });
      }, delay);
    };
    const over = (e: MouseEvent) => {
      const el = tipTarget(e.target);
      if (el) showFor(el, SHOW_MS);
      else if (current.current) hide();
    };
    const out = (e: MouseEvent) => {
      const el = current.current;
      if (el && !el.contains(e.relatedTarget as Node | null)) hide();
    };
    // Keyboard focus shows it too, straight away.
    const focus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (el.matches?.(":focus-visible") && tipTarget(el) === el) showFor(el, 0);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" || !["Tab", "Shift"].includes(e.key)) hide();
    };
    document.addEventListener("mouseover", over, true);
    document.addEventListener("mouseout", out, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("mouseout", out, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Under the element, centered on it; above it when there's no room below;
  // always inside the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) {
      setPos(null);
      return;
    }
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    const r = tip.rect;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const below = r.bottom + 8;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - 8 - h) : below;
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      className="pointer-events-none fixed z-[60] max-w-[300px] rounded-[10px] border border-line px-2.5 py-1.5 text-12 leading-[1.45] whitespace-pre-line text-text shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, background: "var(--menu)" }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
