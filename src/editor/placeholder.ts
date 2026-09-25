import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// A grey hint on the empty line the cursor is on, and only that line. It's a
// decoration, so it's never saved.
//
// This replaces TipTap's Placeholder: with hints inside lists, quotes and
// callouts turned on, that one keeps a running set of hints and loses track of
// them as Enter adds lines, leaving "Type / for commands" behind on lines the
// cursor has already left. Working out the one line afresh each time can't.

export interface LinePlaceholderOptions {
  // The hint for this empty line; "" shows none.
  placeholder: (props: { editor: Editor; node: PMNode; pos: number }) => string;
}

const key = new PluginKey("linePlaceholder");

export const LinePlaceholder = Extension.create<LinePlaceholderOptions>({
  name: "linePlaceholder",

  addOptions() {
    return { placeholder: () => "" };
  },

  addProseMirrorPlugins() {
    const { editor } = this;
    const options = this.options;
    return [
      new Plugin({
        key,
        props: {
          decorations: ({ doc, selection }) => {
            if (!editor.isEditable) return null;
            const $at = selection.$anchor;
            // The textblock holding the cursor, at any depth; with the whole
            // note selected, the first line.
            const node = $at.depth > 0 ? $at.parent : doc.firstChild;
            const pos = $at.depth > 0 ? $at.before() : 0;
            if (!node || !node.isTextblock || node.content.size > 0) return null;
            const text = options.placeholder({ editor, node, pos });
            if (!text) return null;
            const emptyNote = doc.childCount === 1 && node === doc.firstChild;
            return DecorationSet.create(doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: emptyNote ? "is-empty is-editor-empty" : "is-empty",
                "data-placeholder": text,
              }),
            ]);
          },
        },
      }),
    ];
  },
});
