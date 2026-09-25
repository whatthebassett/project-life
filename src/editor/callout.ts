import { mergeAttributes, Node } from "@tiptap/core";
import type { MarkdownToken } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { motionReduced } from "../lib/motion";

// A callout that was just added bounces in: it carries the "callout-bounce"
// class briefly, and the CSS animation does the rest.
const bounceKey = new PluginKey<DecorationSet>("calloutBounce");
const BOUNCE_MS = 700;

// Colored blocks saved the way Obsidian writes callouts, so they stay ordinary
// Markdown: "> [!info] first line" followed by "> " lines.
//
// Noted's own five kinds come first; the rest are Obsidian's, shown in color
// too. Obsidian treats text after the marker as a title; Noted shows it as the
// callout's first line.

interface Kind {
  color: string;
  icon: string;
}

const icons = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  zap: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
};

// Project Life: theme colors, so callouts follow all four themes. Info (and
// the other "blue" kinds) takes the accent, as in Notes.dc.html.
const blue = "var(--accent)", purple = "var(--hue-5)", orange = "var(--warn)", green = "var(--accent2)", red = "var(--danger)", teal = "var(--hue-1)", yellow = "var(--hue-2)", gray = "var(--muted)";

const kinds: Record<string, Kind> = {
  // Noted
  info: { color: blue, icon: icons.info },
  notification: { color: purple, icon: icons.bell },
  alert: { color: orange, icon: icons.warning },
  success: { color: green, icon: icons.check },
  emergency: { color: red, icon: icons.error },
  // Obsidian
  note: { color: blue, icon: icons.pencil },
  abstract: { color: teal, icon: icons.clipboard },
  summary: { color: teal, icon: icons.clipboard },
  tldr: { color: teal, icon: icons.clipboard },
  todo: { color: blue, icon: icons.check },
  tip: { color: teal, icon: icons.flame },
  hint: { color: teal, icon: icons.flame },
  important: { color: teal, icon: icons.flame },
  check: { color: green, icon: icons.check },
  done: { color: green, icon: icons.check },
  question: { color: yellow, icon: icons.help },
  help: { color: yellow, icon: icons.help },
  faq: { color: yellow, icon: icons.help },
  warning: { color: orange, icon: icons.warning },
  caution: { color: orange, icon: icons.warning },
  attention: { color: orange, icon: icons.warning },
  failure: { color: red, icon: icons.error },
  fail: { color: red, icon: icons.error },
  missing: { color: red, icon: icons.error },
  danger: { color: red, icon: icons.zap },
  error: { color: red, icon: icons.zap },
  bug: { color: red, icon: icons.bug },
  example: { color: purple, icon: icons.list },
  quote: { color: gray, icon: icons.quote },
  cite: { color: gray, icon: icons.quote },
};

export const notedCallouts = ["info", "notification", "alert", "success", "emergency"] as const;
export type NotedCallout = (typeof notedCallouts)[number];

// The callout's own color, for the slash menu's icons.
export function calloutColor(kind: string): string {
  return (kinds[kind.toLowerCase()] ?? kinds.info).color;
}

export function calloutStyle(kind: string): string {
  const k = kinds[kind.toLowerCase()] ?? kinds.info;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg>`;
  return `--callout-color:${k.color};--callout-icon:url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (kind: string) => ReturnType;
      toggleCallout: (kind: string) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

const CALLOUT_LINE = /^> ?\[!([\w-]+)\][+-]?[ \t]*(.*)(?:\n|$)/;

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      kind: {
        default: "info",
        parseHTML: (el) => el.getAttribute("data-callout") ?? "info",
        renderHTML: (attrs) => ({ "data-callout": attrs.kind, style: calloutStyle(attrs.kind) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ class: "callout" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      // Every way of adding a callout (slash menu, toolbar, shortcuts, menus)
      // comes through here, so this is where a new one is marked to bounce.
      // Changing an existing callout's kind doesn't bounce.
      setCallout:
        (kind) =>
        ({ commands, editor, tr }) => {
          if (editor.isActive("callout")) return commands.updateAttributes("callout", { kind });
          if (!commands.wrapIn("callout", { kind })) return false;
          const $from = tr.selection.$from;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "callout") {
              tr.setMeta(bounceKey, { add: $from.before(d) });
              break;
            }
          }
          return true;
        },
      toggleCallout:
        (kind) =>
        ({ commands, editor }) =>
          editor.isActive("callout", { kind }) ? commands.lift("callout") : commands.setCallout(kind),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift("callout"),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: bounceKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(bounceKey) as { add?: number; clear?: boolean } | undefined;
            if (meta?.clear) return DecorationSet.empty;
            let next = set.map(tr.mapping, tr.doc);
            if (meta?.add !== undefined && !motionReduced()) {
              const node = tr.doc.nodeAt(meta.add);
              if (node?.type.name === "callout") {
                next = next.add(tr.doc, [Decoration.node(meta.add, meta.add + node.nodeSize, { class: "callout-bounce" })]);
              }
            }
            return next;
          },
        },
        props: {
          decorations: (state) => bounceKey.getState(state),
        },
        // Take the class off once the animation has played.
        view: () => {
          let timer = 0;
          return {
            update(view) {
              if (timer || !bounceKey.getState(view.state)?.find().length) return;
              timer = window.setTimeout(() => {
                timer = 0;
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(bounceKey, { clear: true }));
              }, BOUNCE_MS);
            },
            destroy() {
              window.clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },

  // Markdown: claim "> [!kind]" blockquotes before the ordinary blockquote does.
  markdownTokenName: "callout",
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => {
      const m = /(^|\n)> ?\[!/.exec(src);
      return m ? m.index + m[1].length : -1;
    },
    tokenize: (src, _tokens, lexer) => {
      const first = CALLOUT_LINE.exec(src);
      if (!first) return;
      const lines = [first[2]];
      let raw = first[0];
      let rest = src.slice(raw.length);
      // Following lines belong to the callout while they keep the "> " prefix.
      for (;;) {
        const line = /^>(?: ?(.*))?(?:\n|$)/.exec(rest);
        if (!line || line[0].length === 0) break;
        lines.push(line[1] ?? "");
        raw += line[0];
        rest = rest.slice(line[0].length);
      }
      return { type: "callout", raw, kind: first[1].toLowerCase(), tokens: lexer.blockTokens(lines.join("\n")) };
    },
  },
  parseMarkdown: (token: MarkdownToken, helpers) => {
    const children = (helpers.parseBlockChildren ?? helpers.parseChildren)(token.tokens ?? []);
    return helpers.createNode("callout", { kind: token.kind }, children.length ? children : [helpers.createNode("paragraph")]);
  },
  renderMarkdown: (node, h) => {
    const kind = node.attrs?.kind ?? "info";
    const inner = (node.content ?? []).map((child, i) => (h.renderChild ? h.renderChild(child, i) : h.renderChildren([child]))).join("\n\n");
    return inner
      .split("\n")
      .map((line, i) => (i === 0 ? `> [!${kind}] ${line}`.trimEnd() : line.trim() === "" ? ">" : `> ${line}`))
      .join("\n");
  },
});
