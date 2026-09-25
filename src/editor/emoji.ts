import { Extension, InputRule } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { emojiNow, loadEmoji, nativeOf, rememberEmoji, searchEmoji, type Emoji } from "../lib/emoji";

export interface EmojiSuggestState {
  items: Emoji[];
  query: string;
  index: number;
  rect: DOMRect | null;
  select: (e: Emoji) => void;
}

// Type ":" and a few letters for matching emoji; Enter or Tab inserts one.
// Typing the whole ":shortcode:" turns it into the emoji too.
export const EmojiSuggest = Extension.create<{ onState: (state: EmojiSuggestState | null) => void }>({
  name: "emojiSuggest",

  addOptions() {
    return { onState: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<Emoji>({
        editor: this.editor,
        pluginKey: new PluginKey("emojiSuggest"),
        char: ":",
        allowedPrefixes: [" ", "(", "[", " "],
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === "codeBlock") return false;
          return !$from.marks().some((m) => m.type.name === "code");
        },
        // Nothing for a lone ":" (it's usually punctuation); the data loads on
        // the first letter.
        items: async ({ query }) => (query.length ? searchEmoji(await loadEmoji(), query, 40) : []),
        command: ({ editor, range, props }) => {
          const native = nativeOf(props);
          editor.chain().focus().deleteRange(range).insertContent(native).run();
          rememberEmoji(native);
        },
        render: () => {
          let index = 0;
          let props: SuggestionProps<Emoji> | null = null;
          const publish = () => {
            if (!props || props.items.length === 0) return options.onState(null);
            const p = props;
            options.onState({ items: p.items, query: p.query, index, rect: p.clientRect?.() ?? null, select: (e) => p.command(e) });
          };
          return {
            onStart: (p) => {
              props = p;
              index = 0;
              publish();
            },
            onUpdate: (p) => {
              props = p;
              index = 0;
              publish();
            },
            onKeyDown: ({ event }) => {
              if (!props || props.items.length === 0) return false;
              if (event.key === "Escape") {
                options.onState(null);
                props = null;
                return true;
              }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                const n = props.items.length;
                index = (index + (event.key === "ArrowDown" ? 1 : n - 1)) % n;
                publish();
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                props.command(props.items[index]);
                return true;
              }
              return false;
            },
            onExit: () => {
              props = null;
              options.onState(null);
            },
          };
        },
      }),
    ];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|[\s([])(:([a-z0-9_+-]+):)$/i,
        handler: ({ state, range, match }) => {
          const emoji = emojiNow()?.byCode.get(match[2].toLowerCase());
          if (!emoji) return null;
          const native = nativeOf(emoji);
          const start = range.from + match[0].length - match[1].length;
          state.tr.insertText(native, start, range.to);
          rememberEmoji(native);
        },
      }),
    ];
  },
});
