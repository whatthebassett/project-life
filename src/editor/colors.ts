import { Mark, mergeAttributes, type Editor } from "@tiptap/core";

// Text colors and highlights. Each is a palette color by name (gray, brown,
// orange, yellow, green, blue, purple, pink, red), drawn from theme variables
// so it reads on dark and light themes alike (editor.css), or any custom
// color the writer picked.
//
// Markdown has neither, so the file gets what other apps can show: a yellow
// highlight as ==text== (Obsidian's), other highlights as
//   <mark style="background: rgba(…)">text</mark>
// in see-through colors that work on any background, and text colors as
//   <span style="color: #…">text</span>
// Reading a file back, a palette color's value turns back into its name.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textColor: {
      setTextColor: (color: string) => ReturnType;
      unsetTextColor: () => ReturnType;
    };
    highlight: {
      setHighlight: (color: string) => ReturnType;
      unsetHighlight: () => ReturnType;
      // The selection's highlight off, or on in `color` (the last one used).
      toggleHighlight: (color?: string) => ReturnType;
    };
  }
}

export const palette = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type PaletteColor = (typeof palette)[number];

// What the file gets for each palette color.
const fileText: Record<PaletteColor, string> = {
  gray: "#8a8a85",
  brown: "#a27458",
  orange: "#d9730d",
  yellow: "#c29a1c",
  green: "#3f9a6b",
  blue: "#3a86c8",
  purple: "#9065b0",
  pink: "#c84f93",
  red: "#d44c47",
};
const fileHighlight: Record<PaletteColor, string> = {
  gray: "rgba(150, 150, 145, 0.3)",
  brown: "rgba(165, 115, 80, 0.3)",
  orange: "rgba(245, 140, 40, 0.3)",
  yellow: "rgba(250, 205, 50, 0.4)",
  green: "rgba(70, 180, 110, 0.3)",
  blue: "rgba(60, 150, 230, 0.3)",
  purple: "rgba(150, 100, 210, 0.3)",
  pink: "rgba(230, 90, 160, 0.3)",
  red: "rgba(235, 80, 70, 0.3)",
};

const isPalette = (c: string): c is PaletteColor => (palette as readonly string[]).includes(c);

// Only plain color values (#hex, rgb(), hsl(), a name) go into the file.
const safeColor = (c: string) => /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\([\d\s.,%]+\)|[a-z]+)$/i.test(c.trim());

const squash = (c: string) => c.toLowerCase().replace(/\s+/g, "");

// A color read from a file: its palette name when it's one of ours.
function fromFile(value: string, table: Record<PaletteColor, string>): string | null {
  const c = value.trim();
  if (!safeColor(c)) return null;
  const name = palette.find((p) => squash(table[p]) === squash(c));
  return name ?? c;
}

const toFile = (color: string, table: Record<PaletteColor, string>) => (isPalette(color) ? table[color] : color);

// The text color, or highlight, of the selection (null for none).
export const textColorOf = (editor: Editor) => (editor.getAttributes("textColor").color as string | undefined) ?? null;
export const highlightOf = (editor: Editor) => (editor.isActive("highlight") ? ((editor.getAttributes("highlight").color as string | undefined) ?? "yellow") : null);

// The highlight Ctrl+Shift+H puts on: the last one picked, kept on this PC.
const LAST = "cura:last-highlight";
export function lastHighlight(): string {
  try {
    const c = localStorage.getItem(LAST);
    if (c && (isPalette(c) || safeColor(c))) return c;
  } catch {
    // No storage: yellow.
  }
  return "yellow";
}
function rememberHighlight(color: string) {
  try {
    localStorage.setItem(LAST, color);
  } catch {
    // Only a convenience.
  }
}

// How a color shows in the editor: by name for the palette (styled in
// editor.css), or as it is.
function colorAttrs(kind: "text" | "highlight", color: string | null): Record<string, string> {
  if (!color) return {};
  const data = kind === "text" ? "data-text-color" : "data-highlight";
  if (isPalette(color)) return { [data]: color };
  return { [data]: "custom", style: kind === "text" ? `color: ${color}` : `background: ${color}` };
}

export const TextColor = Mark.create({
  name: "textColor",

  addAttributes() {
    return {
      color: {
        default: null,
        // Only Cura's own (pasted from a note): a web page's colored spans
        // would bring along black or white text that vanishes on some themes.
        parseHTML: (el: HTMLElement) => {
          const name = el.getAttribute("data-text-color");
          return name && name !== "custom" ? name : el.style.color || null;
        },
        renderHTML: (attrs: Record<string, unknown>) => colorAttrs("text", attrs.color as string | null),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-color]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextColor:
        (color) =>
        ({ commands }) =>
          commands.setMark(this.name, { color }),
      unsetTextColor:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  markdownTokenName: "textColor",
  markdownTokenizer: {
    name: "textColor",
    level: "inline",
    start: (src: string) => src.search(/<span\s+style=/i),
    tokenize: (src, _tokens, lexer) => {
      const m = /^<span\s+style="\s*color:\s*([^";]+);?\s*">([\s\S]+?)<\/span>/i.exec(src);
      const color = m && fromFile(m[1], fileText);
      if (!m || !color) return;
      return { type: "textColor", raw: m[0], text: m[2], color, tokens: lexer.inlineTokens(m[2]) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.applyMark("textColor", helpers.parseInline(token.tokens ?? []), { color: (token as { color?: string }).color }),
  renderMarkdown: (node, h) => {
    const color = node.attrs?.color as string | null;
    const inner = h.renderChildren(node);
    return color ? `<span style="color: ${toFile(color, fileText)}">${inner}</span>` : inner;
  },
});

export const Highlight = Mark.create({
  name: "highlight",

  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el: HTMLElement) => {
          const name = el.getAttribute("data-highlight");
          return name && name !== "custom" ? name : el.style.background || el.style.backgroundColor || "yellow";
        },
        renderHTML: (attrs: Record<string, unknown>) => colorAttrs("highlight", (attrs.color as string | null) ?? "yellow"),
      },
    };
  },

  parseHTML() {
    return [{ tag: "mark" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setHighlight:
        (color) =>
        ({ commands }) => {
          rememberHighlight(color);
          return commands.setMark(this.name, { color });
        },
      unsetHighlight:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
      toggleHighlight:
        (color) =>
        ({ editor, commands }) =>
          editor.isActive(this.name) ? commands.unsetMark(this.name) : commands.setMark(this.name, { color: color ?? lastHighlight() }),
    };
  },

  markdownTokenName: "highlight",
  markdownTokenizer: {
    name: "highlight",
    level: "inline",
    start: (src: string) => {
      const html = src.search(/<mark[\s>]/i);
      const eq = src.indexOf("==");
      return html < 0 ? eq : eq < 0 ? html : Math.min(html, eq);
    },
    tokenize: (src, _tokens, lexer) => {
      // ==text==, with no space just inside, so "a == b == c" stays as it is.
      const plain = /^==(?=\S)([^\n]*?\S)==(?!=)/.exec(src);
      if (plain) return { type: "highlight", raw: plain[0], text: plain[1], color: "yellow", tokens: lexer.inlineTokens(plain[1]) };
      const m = /^<mark(?:\s+style="\s*background(?:-color)?:\s*([^";]+);?\s*")?\s*>([\s\S]+?)<\/mark>/i.exec(src);
      if (!m) return;
      const color = m[1] ? fromFile(m[1], fileHighlight) : "yellow";
      if (!color) return;
      return { type: "highlight", raw: m[0], text: m[2], color, tokens: lexer.inlineTokens(m[2]) };
    },
  },
  parseMarkdown: (token, helpers) => helpers.applyMark("highlight", helpers.parseInline(token.tokens ?? []), { color: (token as { color?: string }).color ?? "yellow" }),
  renderMarkdown: (node, h) => {
    const color = (node.attrs?.color as string | null) ?? "yellow";
    const inner = h.renderChildren(node);
    return color === "yellow" ? `==${inner}==` : `<mark style="background: ${toFile(color, fileHighlight)}">${inner}</mark>`;
  },
});
