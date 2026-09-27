import { createContext, useContext, useMemo, type ReactNode } from "react";
import ReactGridLayout, { getCompactor, moveElement, useContainerWidth, type Layout, type LayoutItem } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpToLine, Lock, Move, RotateCcw, Scaling } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { toast } from "../ui/Toast";

// Home's cards on a grid of 6 columns and 60px rows (Main.dc.html's three
// rows to start), so cards snap to thirds, halves and whole widths, and to
// heights that line up with each other.
// Drag a card by any empty spot to move it, or drag a side or corner to
// resize it; right-click offers the same as menu items. Cards rise to fill
// any space above them, so there are never gaps: to move one down, drop it
// below another card, and the ones in between move up. The padlock at the
// top right freezes the layout. It's kept in settings.json (HomeLayout).
export interface CardPlace {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLS = 6;
const ROW = 60;
const GAP = 20;
const MIN_W = 2;
const MIN_H = 3;
// The grid's units change the numbers saved, so layouts say which grid they're for.
const GRID = 2;

// The mockup's rows, to the nearest step: 220, 540 (two stacked pairs of 220
// and 300 beside Schedule) and 300 px. Heights are h × 60 + (h − 1) × 20.
export const defaultLayout: CardPlace[] = [
  { i: "up", x: 0, y: 0, w: 4, h: 3 },
  { i: "today", x: 4, y: 0, w: 2, h: 3 },
  { i: "schedule", x: 0, y: 3, w: 2, h: 7 },
  { i: "tasks", x: 2, y: 3, w: 2, h: 3 },
  { i: "goals", x: 2, y: 6, w: 2, h: 4 },
  { i: "habits", x: 4, y: 3, w: 2, h: 3 },
  { i: "notes", x: 4, y: 6, w: 2, h: 4 },
  { i: "news", x: 0, y: 10, w: 4, h: 4 },
  { i: "weather", x: 4, y: 10, w: 2, h: 4 },
  { i: "sports", x: 0, y: 14, w: 3, h: 5 },
  { i: "stocks", x: 3, y: 14, w: 3, h: 5 },
];

// The saved layout, with any card it doesn't know yet where the default puts
// it. One saved for another grid starts over from the default.
export function savedLayout(raw: unknown): CardPlace[] {
  const saved = raw as { Grid?: number; Cards?: unknown } | null;
  const list = saved?.Grid === GRID && Array.isArray(saved.Cards) ? (saved.Cards as Partial<CardPlace>[]) : [];
  const ok = (p: Partial<CardPlace>): p is CardPlace =>
    typeof p?.i === "string" && [p.x, p.y, p.w, p.h].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  const known = list.filter(ok).filter((p) => defaultLayout.some((d) => d.i === p.i));
  return defaultLayout.map((d) => known.find((p) => p.i === d.i) ?? d).map((p) => ({ ...p, w: Math.min(Math.max(p.w, MIN_W), COLS), h: Math.max(p.h, MIN_H) }));
}

// Cards rise into any space above them.
const compactor = getCompactor("vertical");

// Card menus ask for these (parts.tsx: Card).
interface LayoutMenu {
  locked: boolean;
  itemsFor: (id: string) => MenuItem[];
}

const LayoutContext = createContext<LayoutMenu | null>(null);

export function useLayoutMenu(): LayoutMenu | null {
  return useContext(LayoutContext);
}

const widths = [
  { w: 2, label: "A third" },
  { w: 3, label: "Half" },
  { w: 4, label: "Two thirds" },
  { w: 6, label: "Full width" },
];

const heights = [
  { h: 3, label: "Short" },
  { h: 4, label: "Medium" },
  { h: 7, label: "Tall" },
  { h: 10, label: "Extra tall" },
];

export default function HomeGrid({ cards }: { cards: { id: string; node: ReactNode }[] }) {
  const { settings, update } = useSettings();
  // Measured before the first draw, so opening Home doesn't animate the
  // cards from a guessed width to the real one.
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const locked = settings.HomeLocked === true;
  const all = useMemo(() => savedLayout(settings.HomeLayout), [settings.HomeLayout]);
  const shown = cards.map((c) => c.id).join();
  const layout: Layout = useMemo(
    () => compactor.compact(all.filter((p) => shown.split(",").includes(p.i)).map((p) => ({ ...p, minW: MIN_W, minH: MIN_H })), COLS),
    [all, shown],
  );

  // Hidden cards keep their places for when they come back.
  const save = (next: Layout) => {
    const moved = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    const current = savedLayout(currentSettings().HomeLayout);
    update({ HomeLayout: { Grid: GRID, Cards: current.map((p) => moved.find((m) => m.i === p.i) ?? p) } });
  };

  // Menu changes work on a copy (the grid's own helpers change items in
  // place), then settle the cards the way dragging does.
  const change = (id: string, edit: (item: LayoutItem, copy: Layout) => Layout) => {
    const copy = layout.map((p) => ({ ...p }));
    const item = copy.find((l) => l.i === id);
    if (item) save(compactor.compact(edit(item, copy), COLS));
  };
  const resize = (id: string, size: { w?: number; h?: number }) =>
    change(id, (item, copy) => {
      Object.assign(item, size, { x: Math.min(item.x, COLS - (size.w ?? item.w)) });
      return copy;
    });
  const moveTo = (id: string, x: number, y: number) =>
    change(id, (item, copy) => moveElement(copy, item, Math.min(Math.max(x, 0), COLS - item.w), Math.max(y, 0), true, false, "vertical", COLS));

  const reset = () => {
    const before = currentSettings().HomeLayout;
    update({ HomeLayout: undefined });
    toast("Home is back to its first layout", () => update({ HomeLayout: before }));
  };

  const menu: LayoutMenu = {
    locked,
    itemsFor: (id) => {
      const item = layout.find((l) => l.i === id);
      if (!item) return [];
      if (locked) return [{ label: "Unlock the layout", icon: <Lock size={13} />, onSelect: () => update({ HomeLocked: false }) }];
      // The nearest cards above and below it, sharing some of its columns.
      const inColumn = layout.filter((l) => l.i !== id && l.x < item.x + item.w && l.x + l.w > item.x);
      const above = inColumn.filter((l) => l.y < item.y).sort((a, b) => b.y - a.y)[0];
      const below = inColumn.filter((l) => l.y > item.y).sort((a, b) => a.y - b.y)[0];
      return [
        {
          label: "Size",
          icon: <Scaling size={13} />,
          children: [
            ...widths.map((o) => ({ label: o.label, checked: item.w === o.w, onSelect: () => resize(id, { w: o.w }) })),
            { type: "separator" } as MenuItem,
            ...heights.map((o) => ({ label: o.label, checked: item.h === o.h, onSelect: () => resize(id, { h: o.h }) })),
          ],
        },
        {
          label: "Move",
          icon: <Move size={13} />,
          children: [
            { label: "To the top", icon: <ArrowUpToLine size={13} />, disabled: !above, onSelect: () => moveTo(id, item.x, 0) },
            { label: "Up", icon: <ArrowUp size={13} />, disabled: !above, onSelect: () => above && moveTo(id, item.x, above.y) },
            { label: "Down", icon: <ArrowDown size={13} />, disabled: !below, onSelect: () => below && moveTo(id, item.x, below.y + below.h) },
            { label: "Left", icon: <ArrowLeft size={13} />, disabled: item.x === 0, onSelect: () => moveTo(id, item.x - item.w, item.y) },
            { label: "Right", icon: <ArrowRight size={13} />, disabled: item.x + item.w >= COLS, onSelect: () => moveTo(id, item.x + item.w, item.y) },
          ],
        },
        { label: "Reset the layout", icon: <RotateCcw size={13} />, disabled: !settings.HomeLayout, onSelect: reset },
      ];
    },
  };

  return (
    <LayoutContext.Provider value={menu}>
      <div ref={containerRef} className={locked ? "home-grid is-locked" : "home-grid"}>
        {mounted && (
          <ReactGridLayout
            width={width}
            layout={layout}
            gridConfig={{ cols: COLS, rowHeight: ROW, margin: [GAP, GAP], containerPadding: [0, 0] }}
            // Anything you'd click stays clickable; the rest of a card drags it.
            dragConfig={{ enabled: !locked, threshold: 6, cancel: "button, a, input, textarea, select, label, [role=button], [role=checkbox], [role=radio], [role=slider], [contenteditable], .react-resizable-handle" }}
            resizeConfig={{ enabled: !locked, handles: ["n", "e", "s", "w", "ne", "nw", "se", "sw"] }}
            compactor={compactor}
            onDragStop={(l) => save(l)}
            onResizeStop={(l) => save(l)}
          >
            {cards.map((c) => (
              <div key={c.id} className="home-cell">
                {c.node}
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </LayoutContext.Provider>
  );
}
