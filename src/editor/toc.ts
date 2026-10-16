import { mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { motionReduced } from "../lib/motion";

// A table of contents: the note's headings as a list, kept up to date as you
// write. Click one to jump to it.
//
// In the file it's the form other Markdown tools write too: an ordinary list
// of links between two comments, so other apps show a working contents list
// and Project Life reads the whole block back as this one.
//   <!-- toc -->
//   - [Plans](#plans)
//     - [This week](#this-week)
//   <!-- /toc -->
// The list is written fresh each time the note is saved.
//
// How it looks is picked in the note, from the block's Edit button
// (components/TocPanel.tsx): its layout, and bullets or numbers on its lines.
// A look other than the plain list is kept in the opening comment,
//   <!-- toc layout=columns markers=numbers -->
// and the list in the file follows it as far as Markdown can: numbers make a
// numbered list, and the inline layout a single line of links.

export const tocLayouts = ["list", "columns", "inline"] as const;
export type TocLayout = (typeof tocLayouts)[number];
export const tocMarkers = ["none", "bullets", "numbers"] as const;
export type TocMarkers = (typeof tocMarkers)[number];

export interface TocAttrs {
  layout: TocLayout;
  markers: TocMarkers;
}

export interface TocOptions {
  // The block's Edit button was pressed; `pos` is where the block is.
  onEdit: (pos: number) => void;
}

const oneOf = <T extends string>(all: readonly T[], value: unknown): T => (all.includes(value as T) ? (value as T) : all[0]);

export function tocAttrs(attrs: Record<string, unknown> | null | undefined): TocAttrs {
  return { layout: oneOf(tocLayouts, attrs?.layout), markers: oneOf(tocMarkers, attrs?.markers) };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      insertTableOfContents: () => ReturnType;
    };
  }
}

interface Heading {
  level: number;
  text: string;
  pos: number;
}

function headingsOf(doc: PMNode): Heading[] {
  const out: Heading[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name === "heading" && node.textContent.trim()) out.push({ level: node.attrs.level as number, text: node.textContent.trim(), pos });
    // Headings don't nest in other headings or paragraphs; skip their insides.
    return !node.isTextblock;
  });
  return out;
}

// GitHub's anchors: lowercase, punctuation dropped, spaces to hyphens, and a
// number on repeats.
function anchors(headings: Heading[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((h) => {
    const base = h.text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .trim()
      .replace(/\s/g, "-");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  });
}

// How far each heading steps in as a list: by its level, but never more than
// one step past the heading before. So a note that skips a level (a heading 3
// straight under a heading 1) still saves as a list, and numbers 2.1, not 2.1.1.
function steps(headings: Heading[], top: number): number[] {
  let before = -1;
  return headings.map((h) => (before = Math.min(h.level - top, before + 1)));
}

// Outline numbers: 1, 1.1, 1.2, 2 …
function outline(headings: Heading[], top: number): string[] {
  const counts: number[] = [];
  return steps(headings, top).map((depth) => {
    counts.length = depth + 1;
    counts[depth] = (counts[depth] || 0) + 1;
    return counts.join(".");
  });
}

// The document being saved. renderMarkdown only sees its own node, so the
// extension keeps the latest document here as it changes.
let currentDoc: PMNode | null = null;

const START = /^<!--\s*toc(\s[^>]*?)?\s*-->[ \t]*(?:\n|$)/i;
const END = /<!--\s*\/toc\s*-->[ \t]*(?:\n|$)/i;

// The Edit button's icon (Lucide's settings-2).
const editIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 17H5"/><path d="M19 7h-9"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>';

export const TableOfContents = Node.create<TocOptions>({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { onEdit: () => {} };
  },

  addAttributes() {
    return {
      layout: {
        default: tocLayouts[0],
        parseHTML: (el) => oneOf(tocLayouts, el.getAttribute("data-layout")),
        renderHTML: (attrs) => ({ "data-layout": attrs.layout }),
      },
      markers: {
        default: tocMarkers[0],
        parseHTML: (el) => oneOf(tocMarkers, el.getAttribute("data-markers")),
        renderHTML: (attrs) => ({ "data-markers": attrs.markers }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["nav", mergeAttributes({ "data-toc": "", class: "toc" }, HTMLAttributes)];
  },

  // Track the note from the moment its editor exists, not only once it
  // changes: a note is saved (and its contents written) straight after opening.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view: (view) => {
          currentDoc = view.state.doc;
          return { update: (v) => void (currentDoc = v.state.doc) };
        },
      }),
    ];
  },

  onTransaction({ transaction }) {
    currentDoc = transaction.doc;
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },

  // Drawn by hand and redrawn whenever the note changes, or its own look does.
  addNodeView() {
    return ({ editor, node, getPos }) => {
      const dom = document.createElement("nav");
      dom.className = "toc";
      dom.dataset.toc = "";
      dom.contentEditable = "false";
      let look = tocAttrs(node.attrs);

      // Shown while the block is selected or pointed at (index.css). It
      // selects the block, so it's plain which one the panel is changing.
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "toc-edit";
      edit.title = "Change the layout, bullets and numbering";
      edit.innerHTML = `${editIcon}<span>Edit</span>`;
      edit.addEventListener("mousedown", (e) => e.preventDefault());
      edit.addEventListener("click", () => {
        const pos = getPos();
        if (pos === undefined) return;
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
        this.options.onEdit(pos);
      });

      // What's drawn now. Drawing the same again is skipped, which also
      // leaves a layout change's animation to finish.
      let drawn = "";
      const draw = () => {
        const headings = headingsOf(editor.state.doc);
        const now = JSON.stringify([look, headings]);
        if (now === drawn) return;
        drawn = now;
        dom.dataset.layout = look.layout;
        dom.dataset.markers = look.markers;
        dom.replaceChildren();
        const title = document.createElement("div");
        title.className = "toc-title";
        title.textContent = "Contents";
        dom.append(title, edit);
        if (!headings.length) {
          const empty = document.createElement("div");
          empty.className = "toc-empty";
          empty.textContent = "Add headings to this note and they'll show up here.";
          dom.append(empty);
          return;
        }
        const top = Math.min(...headings.map((h) => h.level));
        const numbers = look.markers === "numbers" ? outline(headings, top) : null;
        const list = document.createElement("ol");
        list.className = "toc-list";
        headings.forEach((h, i) => {
          const item = document.createElement("li");
          item.className = `toc-item toc-level-${Math.min(h.level - top, 4)}`;
          const link = document.createElement("button");
          link.type = "button";
          link.className = "toc-link";
          if (look.markers !== "none") {
            const marker = document.createElement("span");
            marker.className = "toc-marker";
            marker.textContent = numbers ? numbers[i] : h.level === top ? "•" : "◦";
            link.append(marker);
          }
          link.append(h.text);
          link.title = `Go to “${h.text}”`;
          link.addEventListener("mousedown", (e) => e.preventDefault());
          link.addEventListener("click", () => jumpTo(editor.view, h.pos));
          item.append(link);
          list.append(item);
        });
        dom.append(list);
      };

      draw();
      editor.on("update", draw);
      return {
        dom,
        update: (next) => {
          if (next.type !== node.type) return false;
          const was = look.layout;
          look = tocAttrs(next.attrs);
          if (look.layout === was) draw();
          else glide(dom, draw);
          return true;
        },
        ignoreMutation: () => true,
        stopEvent: (e) => (e.target as HTMLElement | null)?.closest?.(".toc-link, .toc-edit") != null,
        destroy: () => editor.off("update", draw),
      };
    };
  },

  markdownTokenName: "tableOfContents",
  markdownTokenizer: {
    name: "tableOfContents",
    level: "block",
    start: (src: string) => src.search(/^<!--\s*toc(?:\s[^>]*)?-->/im),
    tokenize: (src) => {
      const start = START.exec(src);
      if (!start) return;
      // Everything up to the closing comment is the old list; it's redrawn.
      const rest = src.slice(start[0].length);
      const end = END.exec(rest);
      const raw = end ? start[0] + rest.slice(0, end.index + end[0].length) : start[0];
      // The look, as layout=… markers=… in the opening comment.
      const said = Object.fromEntries(Array.from((start[1] ?? "").matchAll(/([\w-]+)=([\w-]+)/g), (m) => [m[1].toLowerCase(), m[2].toLowerCase()]));
      return { type: "tableOfContents", raw, ...tocAttrs(said) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("tableOfContents", tocAttrs(token)),
  renderMarkdown: (node) => {
    const look = tocAttrs(node.attrs);
    const open = `<!-- toc${look.layout === tocLayouts[0] ? "" : ` layout=${look.layout}`}${look.markers === tocMarkers[0] ? "" : ` markers=${look.markers}`} -->`;
    const headings = currentDoc ? headingsOf(currentDoc) : [];
    if (!headings.length) return `${open}\n<!-- /toc -->`;
    const top = Math.min(...headings.map((h) => h.level));
    const ids = anchors(headings);
    const links = headings.map((h, i) => `[${h.text.replace(/([[\]])/g, "\\$1")}](#${ids[i]})`);
    if (look.layout === "inline") return `${open}\n${links.join(" · ")}\n<!-- /toc -->`;
    // A numbered list's lines sit three spaces in per step, a bulleted one's two.
    const mark = look.markers === "numbers" ? "1. " : "- ";
    const depth = steps(headings, top);
    const lines = links.map((link, i) => `${" ".repeat(mark.length * depth[i])}${mark}${link}`);
    return `${open}\n${lines.join("\n")}\n<!-- /toc -->`;
  },
});

// A new layout arrives as one move: each heading glides from where it sat to
// where it sits now, one just after another, while the card grows or shrinks
// to fit. `redraw` puts the new layout in place; the animation plays back to
// it from the old one.
//
// The headings stay inside the card the whole way:
// - They move by `left` and `top`, not a transform. A transform runs apart
//   from the page's layout, so in a long note the headings would get ahead of
//   the card's height and show below it.
// - A card that's shrinking waits for its last heading to set off, so it
//   never closes on one still on its way up.
// - And the card clips for as long as it plays (index.css: [data-gliding]).
let glides = 0;
function glide(dom: HTMLElement, redraw: () => void) {
  if (motionReduced()) return redraw();
  // A change made while the last one is still playing starts from where that
  // one was heading.
  dom.getAnimations().forEach((a) => a.cancel());
  const spots = () => {
    const card = dom.getBoundingClientRect();
    return Array.from(dom.querySelectorAll(".toc-item"), (item) => {
      const r = item.getBoundingClientRect();
      return { item, x: r.left - card.left, y: r.top - card.top };
    });
  };
  const before = spots();
  const height = dom.getBoundingClientRect().height;
  redraw();
  const after = dom.getBoundingClientRect().height;
  const timing = { duration: 300, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "backwards" as const };
  let last = 0;
  spots().forEach((to, i) => {
    const from = before[i];
    if (!from || (from.x === to.x && from.y === to.y)) return;
    last = Math.min(i, 8) * 12;
    to.item.animate([{ left: `${from.x - to.x}px`, top: `${from.y - to.y}px` }, { left: "0px", top: "0px" }], { ...timing, delay: last });
  });
  dom.animate([{ height: `${height}px` }, { height: `${after}px` }], { ...timing, delay: after < height ? last : 0 });
  const run = String(++glides);
  dom.dataset.gliding = run;
  window.setTimeout(() => {
    if (dom.dataset.gliding === run) delete dom.dataset.gliding;
  }, timing.duration + last + 50);
}

// Changes how the contents block at `pos` looks, and keeps it selected.
export function setTocAttrs(view: EditorView, pos: number, patch: Partial<TocAttrs>) {
  const node = view.state.doc.nodeAt(pos);
  if (node?.type.name !== "tableOfContents") return;
  const tr = view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, pos)));
}

// Scroll the heading to the top of the page, put the cursor at its end, and
// give it a brief glow so the eye lands on it.
function jumpTo(view: EditorView, pos: number) {
  const el = view.nodeDOM(pos) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth", block: "start" });
  const node = view.state.doc.nodeAt(pos);
  if (node) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + node.nodeSize - 1), -1)));
  view.focus();
  if (!motionReduced()) {
    el.classList.remove("toc-target");
    void el.offsetWidth;
    el.classList.add("toc-target");
    window.setTimeout(() => el.classList.remove("toc-target"), 1200);
  }
}
