import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { motionReduced } from "../lib/motion";
import { currentSettings } from "../lib/settings";

export interface CaretConfig {
  // Thickness in pixels, 1–8.
  width: number;
  rainbow: boolean;
  // Windows' blink time in ms; 0 keeps the cursor solid.
  blinkMs: number;
}

const rainbow = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];
// Shared by every editor, so colors carry on when a caret restarts.
let colorOffset = 0;

// One blink cycle: visible, fade out, hidden, fade in. The color moves on
// while the cursor is hidden and holds as it reappears.
export function caretFrame(t: number, cycle: number): { alpha: number; step: number } {
  if (!cycle) return { alpha: 1, step: 0 };
  const p = (t % cycle) / cycle;
  const alpha = p < 0.35 ? 1 : p < 0.5 ? 1 - (p - 0.35) / 0.15 : p < 0.65 ? 0 : p < 0.8 ? (p - 0.65) / 0.15 : 1;
  const step = t < cycle / 2 ? 0 : Math.floor((t - cycle / 2) / cycle) + 1;
  return { alpha, step };
}

// Noted draws its own cursor so it can be thicker than the system one and
// fade through colors. Typing or moving shows it fully at once.
export const Caret = Extension.create<{ config: () => CaretConfig }>({
  name: "notedCaret",

  addOptions() {
    return { config: () => ({ width: 2, rainbow: false, blinkMs: 530 }) };
  },

  addProseMirrorPlugins() {
    const config = this.options.config;
    return [new Plugin({ key: new PluginKey("notedCaret"), view: (view) => new CaretView(view, config) })];
  },
});

class CaretView {
  private el = document.createElement("div");
  private start = performance.now();
  private frame = 0;
  private observer: ResizeObserver;
  private readonly refresh = () => this.update();

  constructor(
    private view: EditorView,
    private config: () => CaretConfig,
  ) {
    this.el.className = "noted-caret";
    view.dom.parentElement?.appendChild(this.el);
    view.dom.classList.add("custom-caret");
    view.dom.addEventListener("focus", this.refresh);
    view.dom.addEventListener("blur", this.refresh);
    // A bouncing callout moves its text; put the cursor back where it settled.
    view.dom.addEventListener("animationend", this.refresh);
    window.addEventListener("resize", this.refresh);
    this.observer = new ResizeObserver(this.refresh);
    this.observer.observe(view.dom);
    this.update();
  }

  update() {
    const v = this.view;
    const sel = v.state.selection;
    const parent = this.el.parentElement;
    if (!parent || !v.hasFocus() || !(sel instanceof TextSelection) || !sel.empty) return this.hide();
    let coords;
    try {
      coords = v.coordsAtPos(sel.head);
    } catch {
      return this.hide();
    }
    const box = parent.getBoundingClientRect();
    const width = Math.min(8, Math.max(1, this.config().width));
    const height = Math.max(coords.bottom - coords.top, 8);
    const s = this.el.style;
    s.display = "block";
    // Settings → Notes → Cursor: a line, a block the size of a letter, or an
    // underline beneath one.
    const shape = currentSettings().Cursor ?? "line";
    if (shape === "line") {
      s.width = `${width}px`;
      s.height = `${height}px`;
      s.left = `${coords.left - box.left - width / 2}px`;
      s.top = `${coords.top - box.top}px`;
    } else {
      const letter = Math.max(6, Math.round(height * 0.5));
      s.width = `${letter}px`;
      s.height = shape === "block" ? `${height}px` : `${width}px`;
      s.left = `${coords.left - box.left}px`;
      s.top = shape === "block" ? `${coords.top - box.top}px` : `${coords.bottom - box.top - width}px`;
    }
    this.restart();
  }

  private cycle() {
    const { blinkMs } = this.config();
    return blinkMs > 0 && !motionReduced() ? blinkMs * 2 : 0;
  }

  private restart() {
    const now = performance.now();
    colorOffset += caretFrame(now - this.start, this.cycle()).step;
    this.start = now;
    this.paint();
    if (!this.frame && this.cycle()) this.frame = requestAnimationFrame(this.tick);
  }

  private paint() {
    const { alpha, step } = caretFrame(performance.now() - this.start, this.cycle());
    this.el.style.opacity = String(alpha);
    const color = this.config().rainbow ? rainbow[(colorOffset + step) % rainbow.length] : "var(--accent)";
    // A block sits over the letter, so it's see-through.
    this.el.style.background = currentSettings().Cursor === "block" ? `color-mix(in srgb, ${color} 45%, transparent)` : color;
  }

  private readonly tick = () => {
    this.frame = 0;
    if (this.el.style.display === "none") return;
    this.paint();
    if (this.cycle()) this.frame = requestAnimationFrame(this.tick);
  };

  private hide() {
    this.el.style.display = "none";
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  destroy() {
    this.hide();
    this.el.remove();
    this.observer.disconnect();
    this.view.dom.classList.remove("custom-caret");
    this.view.dom.removeEventListener("focus", this.refresh);
    this.view.dom.removeEventListener("blur", this.refresh);
    this.view.dom.removeEventListener("animationend", this.refresh);
    window.removeEventListener("resize", this.refresh);
  }
}
