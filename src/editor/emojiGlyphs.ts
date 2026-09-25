import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { emojiPattern } from "../lib/emoji";

const key = new PluginKey<DecorationSet>("emojiGlyphs");

// Wraps each emoji in the note in a span so Settings → Editing → Emoji size
// can draw it larger than the text around it. Only the display changes; the
// Markdown keeps the plain character. Code keeps emoji at text size.
function build(doc: PMNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.name === "codeBlock") return false;
    if (!node.isText || !node.text || parent?.type.name === "codeBlock") return true;
    if (node.marks.some((m) => m.type.name === "code")) return false;
    for (const m of node.text.matchAll(emojiPattern)) {
      const from = pos + m.index;
      decos.push(Decoration.inline(from, from + m[0].length, { class: "emoji" }));
    }
    return false;
  });
  return DecorationSet.create(doc, decos);
}

export const EmojiGlyphs = Extension.create({
  name: "emojiGlyphs",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});
