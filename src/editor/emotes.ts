import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { currentSettings } from "../lib/settings";
import { emoteNamed, onEmotesChange, type Emote } from "../lib/emotes";

// A BetterTTV or 7TV emote in a note (lib/emotes.ts). In the file it's
// :Name:, so the note stays plain text; in the note it's the emote's picture,
// one character wide for the cursor. A name the lists don't know (another
// channel's, or Settings → Notes → Twitch emotes off) shows as :Name:.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emote: {
      insertEmote: (name: string) => ReturnType;
    };
  }
}

const NAME = /^[A-Za-z0-9_]{2,40}$/;
export const emotesOn = () => currentSettings().Emotes !== false;
const known = (name: string): Emote | undefined => (emotesOn() ? emoteNamed(name) : undefined);

// ":Name:" in plain text, for turning into emotes once the lists are in.
const IN_TEXT = /(^|[^\w:]):([A-Za-z0-9_]{2,40}):(?![\w:])/g;

const convert = new PluginKey("emotesFromText");

// Every :Name: in the note's text that's a known emote, as [from, to, name].
function namesIn(doc: PMNode): [number, number, string][] {
  const out: [number, number, string][] = [];
  doc.descendants((node, pos, parent) => {
    if (!node.isText || parent?.type.name === "codeBlock" || node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
    for (const m of node.text!.matchAll(IN_TEXT)) {
      if (!known(m[2])) continue;
      const from = pos + m.index! + m[1].length;
      out.push([from, from + m[2].length + 2, m[2]]);
    }
  });
  return out;
}

export const EmoteNode = Node.create({
  name: "emote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  // Ahead of pictures, so a pasted emote stays an emote.
  priority: 1100,

  addAttributes() {
    return { name: { default: "" } };
  },

  parseHTML() {
    return [{ tag: "img[data-emote]", getAttrs: (el) => ({ name: (el as HTMLElement).getAttribute("data-emote") }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const e = known(node.attrs.name);
    return ["img", mergeAttributes(HTMLAttributes, { "data-emote": node.attrs.name, alt: `:${node.attrs.name}:`, src: e?.url ?? "", class: "emote" })];
  },

  renderText: ({ node }) => `:${node.attrs.name}:`,

  // Drawn by hand: the picture, or the name while it isn't known, and swapped
  // as soon as the lists come in.
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "emote";
      dom.contentEditable = "false";
      let name = node.attrs.name as string;
      const draw = () => {
        const e = known(name);
        dom.replaceChildren();
        dom.classList.toggle("is-unknown", !e);
        dom.title = e ? `:${name}: · ${e.source}${e.channel ? " · channel" : ""}` : `:${name}:`;
        if (!e) {
          dom.textContent = `:${name}:`;
          return;
        }
        const img = document.createElement("img");
        img.src = e.url;
        img.alt = `:${name}:`;
        img.draggable = false;
        img.addEventListener("error", () => {
          dom.classList.add("is-unknown");
          dom.textContent = `:${name}:`;
        });
        dom.append(img);
      };
      draw();
      const stop = onEmotesChange(draw);
      return {
        dom,
        update: (next) => {
          if (next.type.name !== "emote") return false;
          if (next.attrs.name !== name) {
            name = next.attrs.name;
            draw();
          }
          return true;
        },
        destroy: stop,
      };
    };
  },

  addCommands() {
    return {
      insertEmote:
        (name) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { name } }),
    };
  },

  // Typing :Name: (the closing colon) turns a known name into its emote.
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[\s([])(:([A-Za-z0-9_]{2,40}):)$/,
        handler: ({ state, range, match }) => {
          if (!known(match[2])) return null;
          const start = range.from + match[0].length - match[1].length;
          state.tr.replaceWith(start, range.to, this.type.create({ name: match[2] }));
        },
      }),
    ];
  },

  // A note opened before the lists came in has its :Name: as text; once
  // they're in (or change), the known names become emotes. Not an edit of
  // the note: the file reads the same either way.
  addProseMirrorPlugins() {
    const type = this.type;
    return [
      new Plugin({
        key: convert,
        view: (view) => {
          const run = () => {
            if (view.isDestroyed) return;
            const found = namesIn(view.state.doc);
            if (!found.length) return;
            const tr = view.state.tr;
            for (const [from, to, name] of found.reverse()) tr.replaceWith(from, to, type.create({ name }));
            view.dispatch(tr.setMeta("addToHistory", false));
          };
          // After the note's first draw, then whenever the lists change.
          const first = window.setTimeout(run);
          const stop = onEmotesChange(run);
          return {
            destroy: () => {
              window.clearTimeout(first);
              stop();
            },
          };
        },
      }),
    ];
  },

  markdownTokenName: "emote",
  markdownTokenizer: {
    name: "emote",
    level: "inline",
    start: (src: string) => {
      const m = /:[A-Za-z0-9_]{2,40}:/.exec(src);
      return m ? m.index : -1;
    },
    tokenize: (src: string) => {
      const m = /^:([A-Za-z0-9_]{2,40}):/.exec(src);
      if (!m || !NAME.test(m[1]) || !known(m[1])) return;
      return { type: "emote", raw: m[0], name: m[1] };
    },
  },
  parseMarkdown: (token, helpers) => helpers.createNode("emote", { name: (token as { name?: string }).name ?? "" }),
  renderMarkdown: (node) => `:${node.attrs?.name ?? ""}:`,
});
