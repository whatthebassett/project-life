import { Underline } from "@tiptap/extension-underline";

// Markdown has no underline of its own. Noted writes <u>text</u>, which
// Obsidian, GitHub and most Markdown viewers show, and still reads the
// ++text++ form the editor wrote before.
export const NotedUnderline = Underline.extend({
  markdownTokenName: "underline",
  markdownTokenizer: {
    name: "underline",
    level: "inline",
    start: (src: string) => {
      const html = src.search(/<u>/i);
      const plus = src.indexOf("++");
      return html < 0 ? plus : plus < 0 ? html : Math.min(html, plus);
    },
    tokenize: (src, _tokens, lexer) => {
      const m = /^<u>([\s\S]+?)<\/u>/i.exec(src) ?? /^\+\+(?!\+)([^\n]+?)\+\+(?!\+)/.exec(src);
      if (!m) return;
      return { type: "underline", raw: m[0], text: m[1], tokens: lexer.inlineTokens(m[1]) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.applyMark("underline", helpers.parseInline(token.tokens ?? [])),
  renderMarkdown: (node, h) => `<u>${h.renderChildren(node)}</u>`,
});
