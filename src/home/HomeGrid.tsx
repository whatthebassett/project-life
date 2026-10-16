import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import ReactGridLayout, { getCompactor, moveElement, useContainerWidth, type Compactor, type Layout, type LayoutItem } from "react-grid-layout";
import { gridBounds, minMaxSize, type LayoutConstraint } from "react-grid-layout/core";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpToLine, ChevronsUp, Lock, Minimize2, Move, RotateCcw, Scaling, Square } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { toast } from "../ui/Toast";

// Home's cards on a fine grid: 96 steps across (about 11px each) and rows of
// 10px, so a card can be very nearly any size. A card's width is its share
// of the window; its height is its own, so the standard sizes stay as compact
// as the cards were drawn (220, 300, 540 px) however wide the window is. The
// only limit is the smallest: 100 × 100 px, or more if Settings → Home
// screen says so, so a card never gets too small to grab and make bigger
// again. While a card is resized, its size shows on it. Each card says less as it gets smaller
// (parts.tsx: Tiny, and the cards' own forms).
// Drag a card by any empty spot to move it, or drag a side or corner to
// resize it; right-click offers the same as menu items. A card goes where
// it's dragged and stays there, gaps and all. Cards never overlap: the ones
// in its way step down to make room, and step back if it moves on. As it's
// dragged or resized, its edges snap into line with the cards around it and
// with the page's twelfths, so things line up without care. Close the gaps
// (in the menu) lets every card rise into the space above it. The padlock at
// the top right freezes the layout. It's kept in settings.json (HomeLayout).
export interface CardPlace {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const COLS = 96;
// A row, in px: the same whatever the window's width.
const ROW = 10;
// The space between cards. It's inside each cell (index.css: .home-cell), not
// between the grid's steps, which is what lets the steps be this small.
const GAP = 20;
// No card is smaller than this, either way (px), unless Settings → Home
// screen asks for a bigger smallest.
export const SMALLEST = 100;
export const smallestChoices = [100, 150, 200, 250, 300];

export function smallestCard(settings: { HomeSmallestCard?: number }): number {
  const n = Number(settings.HomeSmallestCard);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), SMALLEST), smallestChoices[smallestChoices.length - 1]) : SMALLEST;
}
// The grid's units change the numbers saved, so layouts say which grid they're for.
const GRID = 5;
const TWELFTH = COLS / 12;
// The grids before this one, and how many of today's steps one of theirs
// was, across and down. 6 columns with 60px rows and 20px gaps (80px, so 8
// rows); then two whose rows were as tall as their columns were wide, which
// depended on the window: about 94px and 11.75px at the window's usual size.
const earlier: Record<number, { across: number; down: number }> = {
  2: { across: 2 * TWELFTH, down: 8 },
  3: { across: TWELFTH, down: 9.4 },
  4: { across: 1, down: 1.175 },
  [GRID]: { across: 1, down: 1 },
};

// The mockup's rows: 220, 540 (two stacked pairs of 220 and 300 beside
// Schedule), 300 and 380 px. Across in twelfths of the width; down in 80px
// (a card's height is its rows less the gap).
export const defaultLayout: CardPlace[] = [
  { i: "up", x: 0, y: 0, w: 8, h: 3 },
  { i: "today", x: 8, y: 0, w: 4, h: 3 },
  { i: "schedule", x: 0, y: 3, w: 4, h: 7 },
  { i: "tasks", x: 4, y: 3, w: 4, h: 3 },
  { i: "goals", x: 4, y: 6, w: 4, h: 4 },
  { i: "habits", x: 8, y: 3, w: 4, h: 3 },
  { i: "notes", x: 8, y: 6, w: 4, h: 4 },
  { i: "news", x: 0, y: 10, w: 8, h: 4 },
  { i: "weather", x: 8, y: 10, w: 4, h: 4 },
  { i: "sports", x: 0, y: 14, w: 6, h: 5 },
  { i: "stocks", x: 6, y: 14, w: 6, h: 5 },
].map((p) => ({ ...p, x: p.x * TWELFTH, y: p.y * 8, w: p.w * TWELFTH, h: p.h * 8 }));

// The saved layout, with any card it doesn't know yet where the default puts
// it. One from an earlier grid is brought across; one saved for a grid this
// doesn't know starts over from the default.
export function savedLayout(raw: unknown): CardPlace[] {
  const saved = raw as { Grid?: number; Cards?: unknown } | null;
  const from = saved?.Grid !== undefined ? earlier[saved.Grid] : undefined;
  const list = from && Array.isArray(saved?.Cards) ? (saved.Cards as Partial<CardPlace>[]) : [];
  const ok = (p: Partial<CardPlace>): p is CardPlace =>
    typeof p?.i === "string" && [p.x, p.y, p.w, p.h].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
  const known = list
    .filter(ok)
    .filter((p) => defaultLayout.some((d) => d.i === p.i))
    .map((p) => (from ? { ...p, x: Math.round(p.x * from.across), w: Math.round(p.w * from.across), y: Math.round(p.y * from.down), h: Math.round(p.h * from.down) } : p));
  return defaultLayout.map((d) => known.find((p) => p.i === d.i) ?? d).map((p) => ({ ...p, w: Math.min(Math.max(p.w, 1), COLS), h: Math.max(p.h, 1) }));
}

// How near an edge has to be to another card's (or a twelfth of the page)
// to snap to it: steps across, rows down. About 22 and 20 px.
const SNAP = 2;
const byPlace = (a: LayoutItem, b: LayoutItem) => a.y - b.y || a.x - b.x;

// Where `pos` (an edge `size` long after it) should go to line an edge up
// with the nearest of `lines`, if one is near enough.
function snapped(pos: number, size: number, lines: number[]): number {
  let best = SNAP + 1;
  let to = pos;
  for (const line of lines) {
    for (const d of [line - pos, line - (pos + size)]) {
      if (Math.abs(d) < Math.abs(best)) {
        best = d;
        to = pos + d;
      }
    }
  }
  return to;
}

// For Close the gaps: every card rises into any space above it.
const upward = getCompactor("vertical");

const overlap = (a: LayoutItem, b: LayoutItem) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Cards that ended up overlapping (one made bigger from the menu, the
// smallest size raised, a hidden card shown again) step down until they're
// clear. In the order given, so the ones first in it keep their places.
function settle(layout: Layout, order: Layout = [...layout].sort((a, b) => a.y - b.y || a.x - b.x)): Layout {
  const placed: LayoutItem[] = [];
  for (const item of order) {
    const next = { ...item };
    for (let hit = placed.filter((p) => overlap(next, p)); hit.length; hit = placed.filter((p) => overlap(next, p))) next.y = Math.max(...hit.map((p) => p.y + p.h));
    placed.push(next);
  }
  return layout.map((l) => placed.find((p) => p.i === l.i) ?? l);
}

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
  { w: 2, label: "A sixth" },
  { w: 3, label: "A quarter" },
  { w: 4, label: "A third" },
  { w: 6, label: "Half" },
  { w: 8, label: "Two thirds" },
  { w: 12, label: "Full width" },
].map((o) => ({ ...o, w: o.w * TWELFTH }));

const heights = [
  { h: 3, label: "Short" },
  { h: 4, label: "Medium" },
  { h: 7, label: "Tall" },
  { h: 10, label: "Extra tall" },
].map((o) => ({ ...o, h: o.h * 8 }));

export default function HomeGrid({ cards }: { cards: { id: string; node: ReactNode }[] }) {
  const { settings, update } = useSettings();
  // Measured before the first draw, so opening Home doesn't animate the
  // cards from a guessed width to the real one.
  const { width, containerRef, mounted } = useContainerWidth({ measureBeforeMount: true });
  const locked = settings.HomeLocked === true;
  // A step across, in px.
  const step = Math.max(1, width / COLS);
  // The fewest steps and rows that make a card the smallest size, with the
  // gap around it. Cards saved smaller than that (before the setting was
  // raised) show at it.
  const smallest = smallestCard(settings);
  const leastW = Math.min(COLS, Math.ceil((smallest + GAP) / step));
  const leastH = Math.ceil((smallest + GAP) / ROW);
  // The rows that make a card as tall as this many steps are wide: a square.
  const rowsFor = (w: number) => Math.max(leastH, Math.round((w * step) / ROW));
  // The card being resized, for its size to show on it.
  const [sizing, setSizing] = useState<{ id: string; w: number; h: number } | null>(null);
  // The card being dragged or resized, and where every card was when that began.
  const hand = useRef<{ id: string; home: Layout } | null>(null);

  // How cards settle. The one in hand goes where it's dragged; every other
  // card starts from where it was when the drag began and steps down only as
  // far as it must, so cards the drag has passed go back to their places.
  const compactor = useMemo<Compactor>(
    () => ({
      type: null,
      allowOverlap: false,
      compact(now) {
        const held = hand.current;
        const active = held && now.find((l) => l.i === held.id);
        if (!held || !active) return settle(now);
        const home = (l: LayoutItem) => held.home.find((h) => h.i === l.i);
        const from = now.map((l) => (l.i === held.id ? l : { ...l, x: home(l)?.x ?? l.x, y: home(l)?.y ?? l.y }));
        return settle(from, [active, ...from.filter((l) => l.i !== held.id).sort(byPlace)]);
      },
    }),
    [],
  );

  // Edges snap into line with the other cards' edges (where they were when
  // the drag began) and with the page's twelfths, across; and with the other
  // cards' tops and bottoms, down.
  const snap = useMemo<LayoutConstraint>(() => {
    const lines = (id: string) => {
      const others = (hand.current?.home ?? []).filter((l) => l.i !== id);
      return {
        xs: [...Array.from({ length: 13 }, (_, i) => i * TWELFTH), ...others.flatMap((o) => [o.x, o.x + o.w])],
        ys: [0, ...others.flatMap((o) => [o.y, o.y + o.h])],
      };
    };
    return {
      name: "snapToNeighbours",
      constrainPosition(item, x, y) {
        const { xs, ys } = lines(item.i);
        return { x: snapped(x, item.w, xs), y: snapped(y, item.h, ys) };
      },
      constrainSize(item, w, h, handle) {
        const { xs, ys } = lines(item.i);
        // The edge being pulled is the one that snaps; the opposite one stays.
        const right = item.x + item.w;
        const bottom = item.y + item.h;
        const width = handle.includes("w") ? right - snapped(right - w, 0, xs) : handle.includes("e") ? snapped(item.x + w, 0, xs) - item.x : w;
        const height = handle.includes("n") ? bottom - snapped(bottom - h, 0, ys) : handle.includes("s") ? snapped(item.y + h, 0, ys) - item.y : h;
        return { w: Math.max(width, item.minW ?? 1), h: Math.max(height, item.minH ?? 1) };
      },
    };
  }, []);
  const all = useMemo(() => savedLayout(settings.HomeLayout), [settings.HomeLayout]);
  const shown = cards.map((c) => c.id).join();
  const layout: Layout = useMemo(
    () =>
      settle(all.filter((p) => shown.split(",").includes(p.i)).map((p) => ({ ...p, w: Math.max(p.w, leastW), h: Math.max(p.h, leastH), minW: leastW, minH: leastH }))),
    [all, shown, leastW, leastH],
  );

  // Hidden cards keep their places for when they come back.
  const save = (next: Layout) => {
    const moved = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    const current = savedLayout(currentSettings().HomeLayout);
    update({ HomeLayout: { Grid: GRID, Cards: current.map((p) => moved.find((m) => m.i === p.i) ?? p) } });
  };

  // Menu changes work on a copy (the grid's own helpers change items in
  // place); whatever the change now overlaps steps down out of the way.
  const change = (id: string, edit: (item: LayoutItem, copy: Layout) => Layout) => {
    const copy = layout.map((p) => ({ ...p }));
    const item = copy.find((l) => l.i === id);
    if (!item) return;
    const edited = edit(item, copy);
    // The card that was changed keeps its place; the others move, top first.
    const rest = edited.filter((l) => l.i !== id).sort((a, b) => a.y - b.y || a.x - b.x);
    save(settle(edited, [...edited.filter((l) => l.i === id), ...rest]));
  };
  const resize = (id: string, size: { w?: number; h?: number }) =>
    change(id, (item, copy) => {
      const w = Math.max(size.w ?? item.w, leastW);
      Object.assign(item, { w, h: Math.max(size.h ?? item.h, leastH), x: Math.min(item.x, COLS - w) });
      return copy;
    });
  const moveTo = (id: string, x: number, y: number) =>
    change(id, (item, copy) => moveElement(copy, item, Math.min(Math.max(x, 0), COLS - item.w), Math.max(y, 0), true, false, null, COLS));

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
      // Where every card would sit with no space above it.
      const closed = upward.compact(layout.map((l) => ({ ...l })), COLS);
      const gaps = closed.some((c) => c.y !== layout.find((l) => l.i === c.i)?.y);
      const below = inColumn.filter((l) => l.y > item.y).sort((a, b) => a.y - b.y)[0];
      // As tall as it's wide, at the window's size now.
      const square = (w: number) => ({ checked: item.w === w && item.h === rowsFor(w), onSelect: () => resize(id, { w, h: rowsFor(w) }) });
      return [
        {
          label: "Size",
          icon: <Scaling size={13} />,
          children: [
            { label: "Smallest", icon: <Minimize2 size={13} />, checked: item.w === leastW && item.h === leastH, onSelect: () => resize(id, { w: leastW, h: leastH }) },
            { label: "Small square", icon: <Square size={11} />, ...square(2 * TWELFTH) },
            { label: "Square", icon: <Square size={13} />, ...square(3 * TWELFTH) },
            { type: "separator" } as MenuItem,
            ...widths.map((o) => ({ label: o.label, checked: item.w === o.w, onSelect: () => resize(id, { w: o.w }) })),
            { type: "separator" } as MenuItem,
            ...heights.map((o) => ({ label: o.label, checked: item.h === o.h, onSelect: () => resize(id, { h: o.h }) })),
          ],
        },
        {
          label: "Move",
          icon: <Move size={13} />,
          children: [
            { label: "To the top", icon: <ArrowUpToLine size={13} />, disabled: item.y === 0, onSelect: () => moveTo(id, item.x, 0) },
            { label: "Up", icon: <ArrowUp size={13} />, disabled: item.y === 0, onSelect: () => moveTo(id, item.x, above ? above.y : 0) },
            { label: "Down", icon: <ArrowDown size={13} />, disabled: !below, onSelect: () => below && moveTo(id, item.x, below.y + below.h) },
            { label: "Left", icon: <ArrowLeft size={13} />, disabled: item.x === 0, onSelect: () => moveTo(id, item.x - item.w, item.y) },
            { label: "Right", icon: <ArrowRight size={13} />, disabled: item.x + item.w >= COLS, onSelect: () => moveTo(id, item.x + item.w, item.y) },
          ],
        },
        // Cards stay where they're dropped, so this is how the spaces go.
        { label: "Close the gaps", icon: <ChevronsUp size={13} />, disabled: !gaps, onSelect: () => save(closed) },
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
            gridConfig={{ cols: COLS, rowHeight: ROW, margin: [0, 0], containerPadding: [0, 0] }}
            // Anything you'd click stays clickable; the rest of a card drags it.
            dragConfig={{ enabled: !locked, threshold: 6, cancel: "button, a, input, textarea, select, label, [role=button], [role=checkbox], [role=radio], [role=slider], [contenteditable], .react-resizable-handle" }}
            resizeConfig={{ enabled: !locked, handles: ["n", "e", "s", "w", "ne", "nw", "se", "sw"] }}
            compactor={compactor}
            constraints={[snap, gridBounds, minMaxSize]}
            onDragStart={(_l, old, item) => {
              const id = (item ?? old)?.i;
              if (id) hand.current = { id, home: layout };
            }}
            onDragStop={(l) => {
              hand.current = null;
              save(l);
            }}
            onResizeStart={(_l, old, item) => {
              const held = item ?? old;
              if (!held) return;
              hand.current = { id: held.i, home: layout };
              setSizing({ id: held.i, w: held.w, h: held.h });
            }}
            onResize={(_l, _old, item) => item && setSizing({ id: item.i, w: item.w, h: item.h })}
            onResizeStop={(l) => {
              hand.current = null;
              setSizing(null);
              save(l);
            }}
          >
            {cards.map((c) => (
              // A container, so each card can fit itself to its width and height.
              <div key={c.id} className="home-cell">
                {c.node}
                {/* While it's resized: the card's size, in px. */}
                {sizing?.id === c.id && (
                  <span className="home-size" aria-live="polite">
                    {Math.round(sizing.w * step - GAP)} × {sizing.h * ROW - GAP}
                  </span>
                )}
              </div>
            ))}
          </ReactGridLayout>
        )}
      </div>
    </LayoutContext.Provider>
  );
}
