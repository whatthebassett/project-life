import { Mark, mergeAttributes } from "@tiptap/core";

// ||hidden text||, revealed on hover or when the cursor is inside it.
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    spoiler: {
      toggleSpoiler: () => ReturnType;
    };
  }
}

export const Spoiler = Mark.create({
  name: "spoiler",

  parseHTML() {
    return [{ tag: "span[data-spoiler]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-spoiler": "", class: "spoiler" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  markdownTokenName: "spoiler",
  markdownTokenizer: {
    name: "spoiler",
    level: "inline",
    start: "||",
    tokenize: (src, _tokens, lexer) => {
      const m = /^\|\|(?!\|)([^\n]+?)\|\|(?!\|)/.exec(src);
      if (!m) return;
      return { type: "spoiler", raw: m[0], text: m[1], tokens: lexer.inlineTokens(m[1]) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.applyMark("spoiler", helpers.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, h) => `||${h.renderChildren(node)}||`,
});
