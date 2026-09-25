import { Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { motionReduced } from "../lib/motion";

// A table of contents: the note's headings as a list, kept up to date as you
// write. Click one to jump to it.
//
// In the file it's the form other Markdown tools write too: an ordinary list
// of links between two comments, so other apps show a working contents list
// and Checkpoint reads the whole block back as this one.
//   <!-- toc -->
//   - [Plans](#plans)
//     - [This week](#this-week)
//   <!-- /toc -->
// The list is written fresh each time the note is saved.

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

// The document being saved. renderMarkdown only sees its own node, so the
// extension keeps the latest document here as it changes.
let currentDoc: PMNode | null = null;

const START = /^<!--\s*toc\s*-->[ \t]*(?:\n|$)/i;
const END = /<!--\s*\/toc\s*-->[ \t]*(?:\n|$)/i;

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },

  renderHTML() {
    return ["nav", { "data-toc": "", class: "toc" }];
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

  // Drawn by hand and redrawn whenever the note changes.
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("nav");
      dom.className = "toc";
      dom.dataset.toc = "";
      dom.contentEditable = "false";

      const draw = () => {
        const headings = headingsOf(editor.state.doc);
        dom.replaceChildren();
        const title = document.createElement("div");
        title.className = "toc-title";
        title.textContent = "Contents";
        dom.append(title);
        if (!headings.length) {
          const empty = document.createElement("div");
          empty.className = "toc-empty";
          empty.textContent = "Add headings to this note and they'll show up here.";
          dom.append(empty);
          return;
        }
        const top = Math.min(...headings.map((h) => h.level));
        const list = document.createElement("ol");
        list.className = "toc-list";
        for (const h of headings) {
          const item = document.createElement("li");
          item.className = `toc-item toc-level-${Math.min(h.level - top, 4)}`;
          const link = document.createElement("button");
          link.type = "button";
          link.className = "toc-link";
          link.textContent = h.text;
          link.title = `Go to “${h.text}”`;
          link.addEventListener("mousedown", (e) => e.preventDefault());
          link.addEventListener("click", () => jumpTo(editor.view, h.pos));
          item.append(link);
          list.append(item);
        }
        dom.append(list);
      };

      draw();
      editor.on("update", draw);
      return {
        dom,
        ignoreMutation: () => true,
        stopEvent: (e) => (e.target as HTMLElement | null)?.closest?.(".toc-link") != null,
        destroy: () => editor.off("update", draw),
      };
    };
  },

  markdownTokenName: "tableOfContents",
  markdownTokenizer: {
    name: "tableOfContents",
    level: "block",
    start: (src: string) => src.search(/^<!--\s*toc\s*-->/im),
    tokenize: (src) => {
      const start = START.exec(src);
      if (!start) return;
      // Everything up to the closing comment is the old list; it's redrawn.
      const rest = src.slice(start[0].length);
      const end = END.exec(rest);
      const raw = end ? start[0] + rest.slice(0, end.index + end[0].length) : start[0];
      return { type: "tableOfContents", raw };
    },
  },
  parseMarkdown: (_token, helpers) => helpers.createNode("tableOfContents"),
  renderMarkdown: () => {
    const headings = currentDoc ? headingsOf(currentDoc) : [];
    if (!headings.length) return "<!-- toc -->\n<!-- /toc -->";
    const top = Math.min(...headings.map((h) => h.level));
    const ids = anchors(headings);
    const lines = headings.map((h, i) => `${"  ".repeat(h.level - top)}- [${h.text.replace(/([[\]])/g, "\\$1")}](#${ids[i]})`);
    return `<!-- toc -->\n${lines.join("\n")}\n<!-- /toc -->`;
  },
});

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
