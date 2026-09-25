import { useEffect, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  Code,
  Copy,
  Grip,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Pilcrow,
  Plus,
  Quote,
  Repeat2,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import type { MenuItem } from "./ContextMenu";
import { motionReduced } from "../lib/motion";
import { calloutIcon } from "../lib/menuIcons";
import { calloutColor } from "../editor/callout";
import {
  addBlockBelow,
  blockList,
  blockMarkdown,
  canTurn,
  deleteBlock,
  duplicateBlock,
  floatingCopy,
  kindOf,
  land,
  moveBlock,
  setLook,
  turnInto,
  type BlockKind,
} from "../editor/blocks";

interface Props {
  editor: Editor | null;
  // The box the note's blocks sit in (positioned), and the note's scroller.
  wrapper: RefObject<HTMLDivElement | null>;
  scroller: RefObject<HTMLDivElement | null>;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  keyFor: (id: string) => string;
}

interface Spot {
  index: number;
  top: number;
  left: number;
}

interface Slot {
  top: number;
  left: number;
  width: number;
  height: number;
}

// A drag in progress. Positions are "content" coordinates (from the top of
// the scrolled page), so the note can scroll under the drag.
interface Drag {
  index: number;
  target: number;
  mids: number[];
  tops: number[];
  // How far the other blocks slide to make room: the block plus its spacing.
  room: number;
  height: number;
  left: number;
  width: number;
  // Where the card started (viewport), where it is, and where the pointer holds it.
  startLeft: number;
  startTop: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  pointerX: number;
  pointerY: number;
  tilt: number;
  scale: number;
  card: HTMLElement;
  content: HTMLElement;
  frame: number;
}

const HANDLE = 22;

// The handle beside each block: hover to see it, click for the block's menu,
// drag to move the block.
export default function BlockHandle({ editor, wrapper, scroller, openMenu, keyFor }: Props) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<Drag | null>(null);
  const press = useRef<{ x: number; y: number; index: number } | null>(null);

  // Which block the pointer is beside, and where its first line is.
  const spotFor = (clientY: number): Spot | null => {
    const box = wrapper.current;
    if (!editor || !editor.isEditable || !box) return null;
    const list = blockList(editor.view);
    if (!list.length) return null;
    let pick = list[0];
    for (const b of list) {
      if (b.el.getBoundingClientRect().top - 6 <= clientY) pick = b;
      else break;
    }
    const r = pick.el.getBoundingClientRect();
    if (clientY > r.bottom + 24) return null;
    const wrap = box.getBoundingClientRect();
    const type = pick.node.type.name;
    let line: number;
    if (type === "horizontalRule") line = r.height / 2 - HANDLE / 2;
    else if (type === "image" || type === "table") line = 4;
    else {
      const cs = getComputedStyle(pick.el);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 24;
      line = (parseFloat(cs.paddingTop) || 0) + Math.max(0, (lh - HANDLE) / 2);
    }
    return { index: pick.index, top: r.top - wrap.top + line, left: r.left - wrap.left - HANDLE - 8 };
  };

  // Follow the pointer over the note; hide while typing, as Notion does.
  useEffect(() => {
    const box = wrapper.current;
    if (!box || !editor) return;
    const onMove = (e: MouseEvent) => {
      if (drag.current) return;
      const next = spotFor(e.clientY);
      setSpot((s) => (s && next && s.index === next.index && Math.abs(s.top - next.top) < 0.5 && s.left === next.left ? s : next));
    };
    const onLeave = () => {
      if (!drag.current && !press.current) setSpot(null);
    };
    const onKey = () => {
      if (!drag.current) setSpot(null);
    };
    box.addEventListener("mousemove", onMove);
    box.addEventListener("mouseleave", onLeave);
    editor.view.dom.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("mousemove", onMove);
      box.removeEventListener("mouseleave", onLeave);
      editor.view.dom.removeEventListener("keydown", onKey);
    };
    // spotFor reads refs and the editor only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, wrapper]);

  // ----- the block menu -----

  const menuFor = (index: number): MenuItem[] => {
    if (!editor) return [];
    const view = editor.view;
    const node = editor.state.doc.maybeChild(index);
    if (!node) return [];
    const kind = kindOf(node);
    const count = editor.state.doc.childCount;
    const turn = (k: BlockKind, label: string, icon: React.ReactNode): MenuItem => ({
      label,
      icon,
      checked: kind === k,
      onSelect: () => turnInto(editor, index, k),
    });
    return [
      {
        label: "Turn into",
        icon: <Repeat2 size={13} />,
        disabled: !canTurn(node),
        children: [
          turn("paragraph", "Text", <Pilcrow size={13} />),
          turn("h1", "Heading 1", <Heading1 size={13} />),
          turn("h2", "Heading 2", <Heading2 size={13} />),
          turn("h3", "Heading 3", <Heading3 size={13} />),
          { type: "separator" },
          turn("bullet", "Bulleted list", <List size={13} />),
          turn("numbered", "Numbered list", <ListOrdered size={13} />),
          turn("task", "Task list", <ListChecks size={13} />),
          { type: "separator" },
          turn("quote", "Quote", <Quote size={13} />),
          turn("code", "Code block", <Code size={13} />),
          {
            label: "Callout",
            icon: <MessageSquareWarning size={13} />,
            children: (["info", "notification", "alert", "success", "emergency"] as const).map((k) => turn(k, k[0].toUpperCase() + k.slice(1), calloutIcon(k, calloutColor(k)))),
          },
        ],
      },
      { type: "separator" },
      { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => duplicateBlock(view, index) },
      { label: "Move up", icon: <ArrowUp size={13} />, hint: keyFor("block.up"), disabled: index === 0, onSelect: () => void moveBlock(view, index, index - 1) },
      { label: "Move down", icon: <ArrowDown size={13} />, hint: keyFor("block.down"), disabled: index >= count - 1, onSelect: () => void moveBlock(view, index, index + 2) },
      { label: "Add a block below", icon: <Plus size={13} />, onSelect: () => addBlockBelow(editor, index) },
      { label: "Copy as Markdown", icon: <ClipboardCopy size={13} />, onSelect: () => void navigator.clipboard.writeText(blockMarkdown(editor, index)) },
      { type: "separator" },
      { label: "Delete", icon: <Trash2 size={13} />, danger: true, onSelect: () => deleteBlock(view, index) },
    ];
  };

  // ----- dragging -----

  const begin = (index: number, clientX: number, clientY: number) => {
    const view = editor?.view;
    const box = scroller.current;
    const wrap = wrapper.current;
    if (!view || !box || !wrap) return;
    const list = blockList(view);
    const src = list[index];
    if (!src) return;
    const view0 = box.getBoundingClientRect();
    const toContent = (clientTop: number) => clientTop - view0.top + box.scrollTop;
    const rects = list.map((b) => b.el.getBoundingClientRect());
    const tops = rects.map((r) => toContent(r.top));
    const mids = rects.map((r) => toContent(r.top + r.height / 2));
    const rect = rects[index];
    const room = index + 1 < list.length ? tops[index + 1] - tops[index] : rect.height;
    const { card, content } = floatingCopy(src.el, rect);
    drag.current = {
      index,
      target: index,
      mids,
      tops,
      room,
      height: rect.height,
      left: rect.left - wrap.getBoundingClientRect().left,
      width: rect.width,
      startLeft: rect.left,
      startTop: rect.top,
      x: rect.left,
      y: rect.top,
      grabX: clientX - rect.left,
      grabY: clientY - rect.top,
      pointerX: clientX,
      pointerY: clientY,
      tilt: 0,
      scale: 1,
      card,
      content,
      frame: 0,
    };
    document.body.classList.add("block-dragging");
    setDragging(true);
    retarget(true);
    drag.current.frame = requestAnimationFrame(tick);
  };

  // Where the block would land, and the room opened for it there.
  const retarget = (force = false) => {
    const d = drag.current;
    const box = scroller.current;
    const wrap = wrapper.current;
    if (!d || !box || !wrap || !editor) return;
    const y = d.pointerY - box.getBoundingClientRect().top + box.scrollTop;
    const count = d.mids.length;
    let target = count;
    for (let i = 0; i < count; i++) {
      if (i === d.index) continue;
      if (y < d.mids[i]) {
        target = i;
        break;
      }
    }
    if (!force && target === d.target) return;
    d.target = target;
    // Blocks between the block's old place and its new one slide over by its
    // room; every other block keeps a zero shift so it can slide back.
    const shifts = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      if (i === d.index) continue;
      const between = target > d.index ? i > d.index && i < target : i >= target && i < d.index;
      shifts.set(i, between ? (target > d.index ? -d.room : d.room) : 0);
    }
    setLook(editor.view, { shifts, lifted: d.index, hovered: null });
    const endTop = d.tops[count - 1] + (d.mids[count - 1] - d.tops[count - 1]) * 2 + (d.room - d.height);
    const gapTop = target > d.index + 1 ? (d.tops[target] ?? endTop) - d.room : target <= d.index ? d.tops[target] : d.tops[d.index];
    const wrapTop = wrap.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    setSlot({ top: gapTop - wrapTop, left: d.left, width: d.width, height: d.height });
  };

  // Each frame: scroll near the edges, and let the card follow the pointer a
  // little behind, leaning into the motion and lifting as it goes.
  const tick = () => {
    const d = drag.current;
    const box = scroller.current;
    if (!d || !box) return;
    const r = box.getBoundingClientRect();
    const edge = 56;
    if (d.pointerY < r.top + edge) box.scrollTop -= Math.ceil((r.top + edge - d.pointerY) / 3);
    else if (d.pointerY > r.bottom - edge) box.scrollTop += Math.ceil((d.pointerY - (r.bottom - edge)) / 3);
    const still = motionReduced();
    const tx = d.pointerX - d.grabX;
    const ty = d.pointerY - d.grabY;
    d.x += (tx - d.x) * (still ? 1 : 0.3);
    d.y += (ty - d.y) * (still ? 1 : 0.3);
    const lean = still ? 0 : Math.max(-5, Math.min(5, (tx - d.x) * 0.09));
    d.tilt += (lean - d.tilt) * 0.18;
    d.scale += ((still ? 1 : 1.03) - d.scale) * 0.2;
    d.card.style.transform = `translate(${d.x - d.startLeft}px, ${d.y - d.startTop}px) rotate(${d.tilt}deg) scale(${d.scale})`;
    retarget();
    d.frame = requestAnimationFrame(tick);
  };

  // Let go: move the block (or send it home) and let it land from the card.
  const finish = (cancel: boolean) => {
    const d = drag.current;
    drag.current = null;
    document.body.classList.remove("block-dragging");
    setDragging(false);
    setSlot(null);
    if (!d || !editor) return;
    cancelAnimationFrame(d.frame);
    const from = d.content.getBoundingClientRect();
    d.card.remove();
    const view = editor.view;
    const moved = !cancel && moveBlock(view, d.index, d.target, from, d.tilt, true);
    if (!moved) {
      setLook(view, null);
      const el = blockList(view)[d.index]?.el;
      if (el) land(el, from, d.tilt);
    }
    setSpot(null);
  };

  // Escape puts the block back.
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // If the editor goes away mid-drag (note switched), clean up.
  useEffect(
    () => () => {
      const d = drag.current;
      if (!d) return;
      cancelAnimationFrame(d.frame);
      d.card.remove();
      document.body.classList.remove("block-dragging");
    },
    [],
  );

  const hover = (on: boolean) => {
    if (!editor || drag.current || !spot) return;
    setLook(editor.view, on ? { shifts: new Map(), lifted: null, hovered: spot.index } : null);
  };

  return (
    <>
      {slot && <div className="block-slot" style={{ top: slot.top, left: slot.left, width: slot.width, height: slot.height }} aria-hidden />}
      {spot && (
        <button
          key="handle"
          className={clsx("block-handle", dragging && "is-dragging")}
          style={{ top: spot.top, left: spot.left }}
          title="Drag to move · Click for options"
          aria-label="Block options"
          onMouseEnter={() => hover(true)}
          onMouseLeave={() => hover(false)}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            press.current = { x: e.clientX, y: e.clientY, index: spot.index };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) {
              d.pointerX = e.clientX;
              d.pointerY = e.clientY;
              return;
            }
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
              press.current = null;
              begin(p.index, e.clientX, e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (drag.current) return finish(false);
            const p = press.current;
            press.current = null;
            if (!p) return;
            const r = e.currentTarget.getBoundingClientRect();
            openMenu(r.left, r.bottom + 4, menuFor(p.index));
          }}
          onLostPointerCapture={() => {
            press.current = null;
            if (drag.current) finish(true);
          }}
        >
          <Grip size={14} strokeWidth={2.25} />
        </button>
      )}
    </>
  );
}
