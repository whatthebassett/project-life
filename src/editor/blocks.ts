// Blocks: the note's top-level pieces (paragraphs, headings, lists, quotes,
// callouts, code, tables, images). Moving, duplicating, deleting and turning
// one into another, each with its own motion.
//
// ProseMirror redraws any node whose DOM attributes change behind its back,
// so the motion here never edits the note's elements directly: the drag's
// shifting blocks are node decorations (ProseMirror applies them itself), and
// everything else is the Web Animations API, which doesn't touch attributes.
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { motionReduced } from "../lib/motion";

export interface Block {
  index: number;
  pos: number;
  node: PMNode;
  el: HTMLElement;
}

export function blockList(view: EditorView): Block[] {
  const out: Block[] = [];
  view.state.doc.forEach((node, pos, index) => {
    const el = view.nodeDOM(pos);
    if (el instanceof HTMLElement) out.push({ index, pos, node, el });
  });
  return out;
}

// The top-level block holding a position (the cursor, say).
export function blockIndexAt(state: EditorState, pos: number): number {
  return state.doc.resolve(Math.min(pos, state.doc.content.size)).index(0);
}

function offsetOf(doc: PMNode, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.childCount; i++) pos += doc.child(i).nodeSize;
  return pos;
}

// ----- the drag's look: shifted and lifted blocks, as decorations -----

export interface DragLook {
  // Top-level index → how far to slide it (px).
  shifts: Map<number, number>;
  lifted: number | null;
  // The block whose handle is under the pointer.
  hovered: number | null;
}

const lookKey = new PluginKey<DecorationSet>("blockLook");

export const BlockLook = Extension.create({
  name: "blockLook",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: lookKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const look = tr.getMeta(lookKey) as DragLook | null | undefined;
            if (look === undefined) return tr.docChanged ? DecorationSet.empty : set;
            if (look === null) return DecorationSet.empty;
            const decos: Decoration[] = [];
            tr.doc.forEach((node, pos, index) => {
              const shift = look.shifts.get(index);
              const classes = [shift !== undefined && "block-shift", look.lifted === index && "block-lifted", look.hovered === index && "block-hovered"].filter(Boolean);
              if (!classes.length) return;
              decos.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: classes.join(" "),
                  ...(shift !== undefined ? { style: `transform: translateY(${shift}px)` } : {}),
                }),
              );
            });
            return DecorationSet.create(tr.doc, decos);
          },
        },
        props: { decorations: (state) => lookKey.getState(state) },
      }),
    ];
  },
});

export function setLook(view: EditorView, look: DragLook | null, tr?: Transaction) {
  view.dispatch((tr ?? view.state.tr).setMeta(lookKey, look).setMeta("addToHistory", tr ? undefined : false));
}

// ----- motion -----

const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

export function snapshot(view: EditorView): Map<HTMLElement, DOMRect> {
  return new Map(blockList(view).map((b) => [b.el, b.el.getBoundingClientRect()]));
}

// Blocks that kept their element glide from where they were to where they are.
export function glide(view: EditorView, before: Map<HTMLElement, DOMRect>, skip?: HTMLElement) {
  if (motionReduced()) return;
  for (const b of blockList(view)) {
    const old = before.get(b.el);
    if (!old || b.el === skip) continue;
    const now = b.el.getBoundingClientRect();
    const dx = old.left - now.left;
    const dy = old.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    b.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 340, easing: EASE_OUT });
  }
}

// A block arriving from `from` (where the drag card was, say): it travels
// there, overshoots a touch, settles, and glows briefly in the accent color.
export function land(el: HTMLElement, from?: DOMRect, tilt = 0) {
  if (motionReduced()) return;
  if (from) {
    const to = el.getBoundingClientRect();
    el.animate(
      [
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) rotate(${tilt}deg) scale(1.02)` },
        { transform: "none" },
      ],
      { duration: 460, easing: SPRING },
    );
  }
  glow(el, 900);
}

function glow(el: HTMLElement, duration: number) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#5b8def";
  el.animate(
    [
      { boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 55%, transparent), 0 10px 28px rgba(0, 0, 0, 0.16)`, backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)`, borderRadius: "6px" },
      { boxShadow: "0 0 0 2px transparent, 0 0 0 transparent", backgroundColor: "transparent", borderRadius: "6px" },
    ],
    { duration, easing: "ease-out" },
  );
}

// A quick flash, for a block that just changed type.
export function flash(view: EditorView, index: number) {
  if (motionReduced()) return;
  const el = blockList(view)[index]?.el;
  if (!el) return;
  el.animate([{ transform: "scale(0.985)", opacity: 0.6 }, { transform: "none", opacity: 1 }], { duration: 260, easing: SPRING });
  glow(el, 700);
}

// A copy of a block, floating above the page where the block was: the drag
// card, and what's left behind as a deleted block fades away.
export function floatingCopy(el: HTMLElement, rect = el.getBoundingClientRect()): { card: HTMLElement; content: HTMLElement } {
  const card = document.createElement("div");
  card.className = "block-float noted-editor";
  const pm = document.createElement("div");
  pm.className = "ProseMirror";
  const content = el.cloneNode(true) as HTMLElement;
  content.removeAttribute("contenteditable");
  pm.appendChild(content);
  card.appendChild(pm);
  Object.assign(card.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
  document.body.appendChild(card);
  return { card, content };
}

// ----- operations -----

// Move block `from` to sit before block `to` (`to` = the count means the end).
// `landFrom` is where the drag card was; keyboard moves start from the block.
export function moveBlock(view: EditorView, from: number, to: number, landFrom?: DOMRect, tilt = 0, clearLook = false): boolean {
  const { state } = view;
  const count = state.doc.childCount;
  if (from < 0 || from >= count || to < 0 || to > count) return false;
  const before = snapshot(view);
  const oldEl = blockList(view)[from]?.el;
  const oldRect = oldEl?.getBoundingClientRect();
  if (to === from || to === from + 1) {
    if (clearLook) setLook(view, null);
    return false;
  }
  const node = state.doc.child(from);
  const start = offsetOf(state.doc, from);
  const insertAt = to >= count ? state.doc.content.size : offsetOf(state.doc, to);
  const tr = state.tr.delete(start, start + node.nodeSize);
  const at = tr.mapping.map(insertAt);
  tr.insert(at, node);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(at + 1, tr.doc.content.size))));
  if (clearLook) tr.setMeta(lookKey, null);
  view.dispatch(tr);
  const moved = view.nodeDOM(at);
  glide(view, before, moved instanceof HTMLElement ? moved : undefined);
  if (moved instanceof HTMLElement) land(moved, landFrom ?? oldRect, tilt);
  return true;
}

export function moveBlockBy(editor: Editor, step: -1 | 1) {
  const view = editor.view;
  const index = blockIndexAt(view.state, view.state.selection.from);
  const target = step < 0 ? index - 1 : index + 2;
  if (target < 0 || target > view.state.doc.childCount) return;
  const head = view.state.selection.head;
  const offset = head - offsetOf(view.state.doc, index);
  if (moveBlock(view, index, target)) {
    // Keep the cursor where it was inside the block.
    const newIndex = step < 0 ? index - 1 : index + 1;
    const pos = offsetOf(view.state.doc, newIndex) + offset;
    view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(Math.min(pos, view.state.doc.content.size)))).scrollIntoView());
    view.focus();
  }
}

export function duplicateBlock(view: EditorView, index: number) {
  const block = blockList(view)[index];
  if (!block) return;
  const before = snapshot(view);
  const at = block.pos + block.node.nodeSize;
  view.dispatch(view.state.tr.insert(at, block.node.copy(block.node.content)));
  glide(view, before);
  const copy = view.nodeDOM(at);
  if (copy instanceof HTMLElement && !motionReduced()) {
    copy.animate([{ opacity: 0, transform: "translateY(-8px) scale(0.98)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: SPRING });
  }
}

export function deleteBlock(view: EditorView, index: number) {
  const block = blockList(view)[index];
  if (!block) return;
  const before = snapshot(view);
  // What's left behind floats where the block was and fades, shrinking, while
  // the blocks below close the gap.
  const leaving = motionReduced() ? null : floatingCopy(block.el);
  view.dispatch(view.state.tr.delete(block.pos, block.pos + block.node.nodeSize));
  glide(view, before);
  if (leaving) {
    const fade = leaving.card.animate(
      [
        { opacity: 1, transform: "none", filter: "blur(0)" },
        { opacity: 0, transform: "scale(0.94) translateX(-12px)", filter: "blur(2px)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.4, 0, 1, 1)" },
    );
    fade.onfinish = () => leaving.card.remove();
  }
}

// A new empty paragraph below the block, with the cursor in it.
export function addBlockBelow(editor: Editor, index: number) {
  const view = editor.view;
  const block = blockList(view)[index];
  if (!block) return;
  const before = snapshot(view);
  const at = block.pos + block.node.nodeSize;
  const tr = view.state.tr.insert(at, view.state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
  view.dispatch(tr.scrollIntoView());
  glide(view, before);
  view.focus();
}

export type BlockKind = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "numbered" | "task" | "quote" | "code" | "info" | "notification" | "alert" | "success" | "emergency";

// Text blocks (and their wrappers: lists, quotes, callouts) can change type;
// tables, images and dividers can't.
export function canTurn(node: PMNode): boolean {
  return node.isTextblock || ["bulletList", "orderedList", "taskList", "blockquote", "callout"].includes(node.type.name);
}

export function turnInto(editor: Editor, index: number, kind: BlockKind) {
  const view = editor.view;
  const block = blockList(view)[index];
  if (!block || !canTurn(block.node)) return;
  const { pos, node } = block;
  const schema = view.state.schema;
  // First back to plain paragraphs, keeping each line's formatting: a list,
  // quote or callout gives up every line inside it (TipTap's clearNodes
  // throws on lists), a heading or code block just changes type.
  const tr = view.state.tr;
  let end = pos + node.nodeSize;
  if (!node.isTextblock) {
    const lines: PMNode[] = [];
    node.descendants((child) => {
      if (!child.isTextblock) return true;
      lines.push(schema.nodes.paragraph.create(null, child.content));
      return false;
    });
    tr.replaceWith(pos, end, lines);
    end = pos + lines.reduce((size, p) => size + p.nodeSize, 0);
  } else if (node.type !== schema.nodes.paragraph) {
    tr.setNodeMarkup(pos, schema.nodes.paragraph);
  }
  tr.setSelection(TextSelection.between(tr.doc.resolve(pos + 1), tr.doc.resolve(end - 1)));
  view.dispatch(tr);
  // Then into the new type (the two steps undo together).
  let chain = editor.chain().focus();
  switch (kind) {
    case "paragraph":
      chain = chain.setParagraph();
      break;
    case "h1":
    case "h2":
    case "h3":
      chain = chain.setHeading({ level: Number(kind[1]) as 1 | 2 | 3 });
      break;
    case "bullet":
      chain = chain.toggleBulletList();
      break;
    case "numbered":
      chain = chain.toggleOrderedList();
      break;
    case "task":
      chain = chain.toggleTaskList();
      break;
    case "quote":
      chain = chain.setBlockquote();
      break;
    case "code":
      chain = chain.setCodeBlock();
      break;
    default:
      chain = chain.setCallout(kind);
  }
  chain.run();
  flash(view, blockIndexAt(view.state, view.state.selection.from));
}

// The block as Markdown, as Noted would save it.
export function blockMarkdown(editor: Editor, index: number): string {
  const node = editor.state.doc.maybeChild(index);
  if (!node) return "";
  return editor.markdown?.serialize({ type: "doc", content: [node.toJSON()] }).trim() ?? node.textContent;
}

// The kind a block is now, to check it in the Turn into menu.
export function kindOf(node: PMNode): BlockKind | null {
  switch (node.type.name) {
    case "paragraph":
      return "paragraph";
    case "heading":
      return node.attrs.level <= 3 ? (`h${node.attrs.level}` as BlockKind) : null;
    case "bulletList":
      return "bullet";
    case "orderedList":
      return "numbered";
    case "taskList":
      return "task";
    case "blockquote":
      return "quote";
    case "codeBlock":
      return "code";
    case "callout":
      return node.attrs.kind as BlockKind;
    default:
      return null;
  }
}
