import { useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import { CellSelection, TableMap, cellAround, findTable } from "@tiptap/pm/tables";
import { GripHorizontal } from "lucide-react";
import clsx from "clsx";
import type { MenuItem } from "./ContextMenu";
import { backdrop, dropColumnLook, moveColumn, setColumnLook } from "../editor/tables";
import { tableMenuItems } from "./Toolbar";

interface Props {
  editor: Editor | null;
  // The box the note's blocks sit in (positioned).
  wrapper: RefObject<HTMLDivElement | null>;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
}

// A table's columns as they are on screen: each one's left and right edge,
// in the table's own scrolled coordinates, and the boxes around it.
interface Measure {
  cols: { left: number; right: number }[];
  table: DOMRect;
  scroller: HTMLElement;
}

// The column under the pointer, in the wrapper's coordinates.
interface Spot {
  tablePos: number;
  index: number;
  left: number;
  width: number;
  top: number;
  height: number;
}

interface Drag {
  tablePos: number;
  from: number;
  // Where it would land now (-1 until the first frame works it out).
  to: number;
  m: Measure;
  // Where in the column the pointer took hold of it.
  grabX: number;
  pointerX: number;
  // The cells (by position) that move with the pointer, and every other cell
  // with the columns it covers, to slide aside.
  lifted: number[];
  others: { pos: number; left: number; right: number }[];
  frame: number;
}

// What a drag shows beside the table: the place the column will land.
interface Look {
  slot: { left: number; width: number; top: number; height: number };
}

const GRIP_W = 28;
const GRIP_H = 16;

function measure(view: EditorView, tablePos: number): Measure | null {
  const node = view.state.doc.nodeAt(tablePos);
  const dom = view.nodeDOM(tablePos) as HTMLElement | null;
  if (!node || !dom) return null;
  const scroller = dom.classList.contains("tableWrapper") ? dom : (dom.closest(".tableWrapper") as HTMLElement | null) ?? dom;
  const table = scroller.querySelector("table") ?? scroller;
  const origin = scroller.getBoundingClientRect().left - scroller.scrollLeft;
  const map = TableMap.get(node);
  const cols: Measure["cols"] = [];
  for (let c = 0; c < map.width; c++) {
    let edge: { left: number; right: number } | null = null;
    // A cell that is this column alone (merged cells span several).
    for (let r = 0; r < map.height && !edge; r++) {
      const pos = map.map[r * map.width + c];
      const rect = map.findCell(pos);
      if (rect.left !== c || rect.right !== c + 1) continue;
      const el = view.nodeDOM(tablePos + 1 + pos) as HTMLElement | null;
      if (!el) continue;
      const b = el.getBoundingClientRect();
      edge = { left: b.left - origin, right: b.right - origin };
    }
    if (!edge) return null;
    cols.push(edge);
  }
  return { cols, table: table.getBoundingClientRect(), scroller };
}

// The grip above the column under the pointer: drag it sideways to move the
// column, or click it to select the column and open the table menu.
export default function ColumnHandle({ editor, wrapper, openMenu }: Props) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [lit, setLit] = useState(false);
  const [look, setLook] = useState<Look | null>(null);
  const drag = useRef<Drag | null>(null);
  const press = useRef<{ x: number; spot: Spot } | null>(null);

  // The column a table cell is in, and where it is.
  const spotFor = (target: EventTarget | null): Spot | null => {
    const box = wrapper.current;
    if (!editor || !editor.isEditable || !box || !(target instanceof Element)) return null;
    const cell = target.closest("td, th");
    const view = editor.view;
    if (!cell || !view.dom.contains(cell)) return null;
    let at: number;
    try {
      at = view.posAtDOM(cell, 0);
    } catch {
      return null;
    }
    const $cell = cellAround(view.state.doc.resolve(at));
    const table = $cell && findTable($cell);
    if (!$cell || !table) return null;
    const index = TableMap.get(table.node).colCount($cell.pos - table.start);
    const m = measure(view, table.pos);
    const col = m?.cols[index];
    if (!m || !col) return null;
    const wrap = box.getBoundingClientRect();
    const seen = m.scroller.getBoundingClientRect();
    const left = seen.left - m.scroller.scrollLeft + col.left - wrap.left;
    const middle = left + (col.right - col.left) / 2 + wrap.left;
    // A column scrolled out of sight sideways has no grip.
    if (middle < seen.left || middle > seen.right) return null;
    return { tablePos: table.pos, index, left, width: col.right - col.left, top: m.table.top - wrap.top, height: m.table.height };
  };

  // Follow the pointer over the note's tables; hide while typing or when a
  // table scrolls sideways under it.
  useEffect(() => {
    const box = wrapper.current;
    if (!box || !editor) return;
    const onMove = (e: MouseEvent) => {
      if (drag.current || press.current) return;
      if (e.target instanceof Element && e.target.closest(".column-handle")) return;
      const next = spotFor(e.target);
      setSpot((s) =>
        s && next && s.tablePos === next.tablePos && s.index === next.index && Math.abs(s.left - next.left) < 0.5 && Math.abs(s.top - next.top) < 0.5 && s.height === next.height ? s : next,
      );
    };
    const hide = () => {
      if (!drag.current && !press.current) {
        setSpot(null);
        setLit(false);
      }
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Element && e.target.classList.contains("tableWrapper")) hide();
    };
    box.addEventListener("mousemove", onMove);
    box.addEventListener("mouseleave", hide);
    box.addEventListener("scroll", onScroll, true);
    editor.view.dom.addEventListener("keydown", hide);
    return () => {
      box.removeEventListener("mousemove", onMove);
      box.removeEventListener("mouseleave", hide);
      box.removeEventListener("scroll", onScroll, true);
      editor.view.dom.removeEventListener("keydown", hide);
    };
    // spotFor reads refs and the editor only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, wrapper]);

  // ----- dragging -----

  // `pressX` is where the button went down on the grip, `clientX` where the
  // pointer is now.
  const begin = (s: Spot, pressX: number, clientX: number) => {
    const box = wrapper.current;
    if (!editor || !box) return;
    const view = editor.view;
    const table = view.state.doc.nodeAt(s.tablePos);
    const m = measure(view, s.tablePos);
    if (!table || !m) return;
    // The column's own cells lift; a cell merged across it stays put.
    const map = TableMap.get(table);
    const start = s.tablePos + 1;
    const lifted: number[] = [];
    const others: Drag["others"] = [];
    for (const rel of new Set(map.map)) {
      const r = map.findCell(rel);
      if (r.left === s.index && r.right === s.index + 1) lifted.push(start + rel);
      else if (r.right <= s.index || r.left > s.index) others.push({ pos: start + rel, left: r.left, right: r.right });
    }
    const seen = m.scroller.getBoundingClientRect();
    const x = pressX - seen.left + m.scroller.scrollLeft;
    drag.current = { tablePos: s.tablePos, from: s.index, to: -1, m, grabX: x - m.cols[s.index].left, pointerX: clientX, lifted, others, frame: 0 };
    const first = view.nodeDOM(lifted[0]);
    box.style.setProperty("--column-drag-x", "0px");
    box.style.setProperty("--column-lift-bg", first instanceof HTMLElement ? backdrop(first) : "transparent");
    document.body.classList.add("column-dragging");
    setLit(false);
    tick();
  };

  // Each frame: scroll a wide table near its edges, then follow the pointer.
  const tick = () => {
    const d = drag.current;
    if (!d) return;
    const { scroller } = d.m;
    const seen = scroller.getBoundingClientRect();
    const edge = 48;
    if (d.pointerX < seen.left + edge) scroller.scrollLeft -= Math.ceil((seen.left + edge - d.pointerX) / 4);
    else if (d.pointerX > seen.right - edge) scroller.scrollLeft += Math.ceil((d.pointerX - (seen.right - edge)) / 4);
    aim(d);
    d.frame = requestAnimationFrame(tick);
  };

  // Move the column with the pointer, and when where it would land changes,
  // slide the columns between there and its old place aside to open it.
  const aim = (d: Drag) => {
    const box = wrapper.current;
    if (!box || !editor) return;
    const { cols, scroller } = d.m;
    const seen = scroller.getBoundingClientRect();
    const width = cols[d.from].right - cols[d.from].left;
    const span = cols[cols.length - 1].right - cols[0].left;
    const x = d.pointerX - seen.left + scroller.scrollLeft;
    // The column stays inside the table, but where it lands follows the
    // pointer: past every other column whose middle it has crossed, so the
    // first and last places can be reached whatever the widths.
    const left = Math.max(cols[0].left, Math.min(cols[0].left + span - width, x - d.grabX));
    const centre = x - d.grabX + width / 2;
    let to = 0;
    cols.forEach((c, i) => {
      if (i !== d.from && (c.left + c.right) / 2 < centre) to++;
    });
    box.style.setProperty("--column-drag-x", `${left - cols[d.from].left}px`);
    if (to === d.to) return;
    d.to = to;

    const shifts = new Map<number, number>();
    for (const o of d.others) {
      const between = to > d.from ? o.left > d.from && o.right - 1 <= to : o.left >= to && o.right - 1 < d.from;
      shifts.set(o.pos, between ? (to > d.from ? -width : width) : 0);
    }
    setColumnLook(editor.view, { lifted: new Set(d.lifted), shifts });

    const wrap = box.getBoundingClientRect();
    const toBox = seen.left - scroller.scrollLeft - wrap.left;
    const table = scroller.querySelector("table")?.getBoundingClientRect() ?? d.m.table;
    const slot = to > d.from ? cols[to].right - width : to < d.from ? cols[to].left : cols[d.from].left;
    setLook({ slot: { left: slot + toBox, width, top: table.top - wrap.top, height: table.height } });
  };

  // Let go where the pointer is now, not where the last frame saw it: the
  // move is made, or (back where it started, or Escape) the column goes home.
  const finish = (cancel: boolean, clientX?: number) => {
    const d = drag.current;
    if (d && !cancel && clientX !== undefined) {
      d.pointerX = clientX;
      aim(d);
    }
    drag.current = null;
    document.body.classList.remove("column-dragging");
    setLook(null);
    setSpot(null);
    if (!d || !editor) return;
    cancelAnimationFrame(d.frame);
    if (!cancel && d.to !== d.from) moveColumn(editor.view, d.tablePos, d.from, d.to);
    else dropColumnLook(editor.view, d.tablePos, d.lifted);
    wrapper.current?.style.removeProperty("--column-drag-x");
  };

  // Escape puts the column back.
  useEffect(() => {
    if (!look) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(look)]);

  // If the editor goes away mid-drag (note switched), clean up.
  useEffect(
    () => () => {
      const d = drag.current;
      if (!d) return;
      cancelAnimationFrame(d.frame);
      document.body.classList.remove("column-dragging");
      if (editor && !editor.isDestroyed) setColumnLook(editor.view, null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // A click selects the column and opens the table menu for it.
  const select = (s: Spot, anchor: DOMRect) => {
    if (!editor) return;
    const view = editor.view;
    const table = view.state.doc.nodeAt(s.tablePos);
    if (!table) return;
    const map = TableMap.get(table);
    const $cell = view.state.doc.resolve(s.tablePos + 1 + map.map[s.index]);
    view.dispatch(view.state.tr.setSelection(CellSelection.colSelection($cell)));
    view.focus();
    openMenu(anchor.left, anchor.bottom + 4, tableMenuItems(editor));
  };

  return (
    <>
      {lit && spot && !look && <div className="column-lit" style={{ left: spot.left, width: spot.width, top: spot.top, height: spot.height }} aria-hidden />}
      {look && <div className="column-slot" style={look.slot} aria-hidden />}
      {spot && (
        <button
          key="grip"
          className={clsx("column-handle", look && "is-dragging")}
          style={{ left: spot.left + spot.width / 2 - GRIP_W / 2, top: spot.top - GRIP_H / 2 }}
          title="Drag to move the column · Click for options"
          aria-label="Column options"
          onMouseEnter={() => setLit(true)}
          onMouseLeave={() => setLit(false)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            press.current = { x: e.clientX, spot };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) {
              d.pointerX = e.clientX;
              return;
            }
            const p = press.current;
            if (p && Math.abs(e.clientX - p.x) > 4) {
              press.current = null;
              begin(p.spot, p.x, e.clientX);
            }
          }}
          onPointerUp={(e) => {
            if (drag.current) return finish(false, e.clientX);
            const p = press.current;
            press.current = null;
            if (p) select(p.spot, e.currentTarget.getBoundingClientRect());
          }}
          onLostPointerCapture={() => {
            press.current = null;
            if (drag.current) finish(true);
          }}
        >
          <GripHorizontal size={14} strokeWidth={2.25} />
        </button>
      )}
    </>
  );
}
