import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { calloutColor, notedCallouts } from "./callout";
import { codeLanguage } from "./code";
import { nowAttrs } from "./dateTime";

export type SlashGroup = "Basic blocks" | "Lists" | "Callouts" | "Insert";

export interface SlashItem {
  id: string;
  label: string;
  // A few words on what it makes, under the label.
  description: string;
  group: SlashGroup;
  // A color of its own for the icon (callouts); otherwise the theme's.
  tint?: string;
  keywords?: string;
  run: (editor: Editor, range: Range) => void;
}

export interface SlashState {
  items: SlashItem[];
  query: string;
  index: number;
  rect: DOMRect | null;
  select: (item: SlashItem) => void;
  // Pointing at a row highlights it, like the arrow keys.
  setIndex: (index: number) => void;
}

export interface SlashOptions {
  onState: (state: SlashState | null) => void;
  onLink: () => void;
  onImage: () => void;
  // Open the calendar at the cursor to pick a date and time.
  onDate: () => void;
  // Open the emoji picker at the cursor (Project Life: it's a pop-over here).
  onEmoji: () => void;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

const calloutDescriptions: Record<string, string> = {
  info: "A helpful note",
  notification: "Something to keep in mind",
  alert: "A heads-up or warning",
  success: "Good news, or a job done",
  emergency: "Something urgent",
};

function allItems(options: SlashOptions): SlashItem[] {
  const block = (run: (editor: Editor, range: Range) => void) => (editor: Editor, range: Range) => {
    editor.chain().focus().deleteRange(range).run();
    run(editor, range);
  };
  const basic = "Basic blocks" as const;
  return [
    { id: "h1", group: basic, label: "Heading 1", description: "Big section heading", keywords: "title", run: block((e) => e.chain().focus().setHeading({ level: 1 }).run()) },
    { id: "h2", group: basic, label: "Heading 2", description: "Medium section heading", run: block((e) => e.chain().focus().setHeading({ level: 2 }).run()) },
    { id: "h3", group: basic, label: "Heading 3", description: "Small section heading", run: block((e) => e.chain().focus().setHeading({ level: 3 }).run()) },
    { id: "table", group: basic, label: "Table", description: "Rows and columns", run: block((e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()) },
    { id: "code", group: basic, label: "Code block", description: "Code, highlighted for its language", keywords: "pre", run: block((e) => e.chain().focus().setCodeBlock({ language: codeLanguage() }).run()) },
    { id: "quote", group: basic, label: "Quote", description: "Set off a quotation", keywords: "blockquote", run: block((e) => e.chain().focus().setBlockquote().run()) },
    { id: "toc", group: basic, label: "Table of contents", description: "This note's headings, kept up to date", keywords: "toc contents outline index headings", run: block((e) => e.chain().focus().insertTableOfContents().run()) },
    { id: "divider", group: basic, label: "Divider", description: "A line between sections", keywords: "hr rule line", run: block((e) => e.chain().focus().setHorizontalRule().run()) },
    { id: "bullet", group: "Lists", label: "Bullet list", description: "A simple list", keywords: "ul", run: block((e) => e.chain().focus().toggleBulletList().run()) },
    { id: "numbered", group: "Lists", label: "Numbered list", description: "A list that counts", keywords: "ol ordered", run: block((e) => e.chain().focus().toggleOrderedList().run()) },
    { id: "task", group: "Lists", label: "To-do list", description: "Check things off as you go", keywords: "task todo checkbox", run: block((e) => e.chain().focus().toggleTaskList().run()) },
    ...notedCallouts.map<SlashItem>((kind) => ({
      id: kind,
      group: "Callouts",
      label: capitalize(kind),
      description: calloutDescriptions[kind],
      tint: calloutColor(kind),
      keywords: "callout box",
      run: block((e) => e.chain().focus().setCallout(kind).run()),
    })),
    { id: "link", group: "Insert", label: "Link", description: "Link to a web page", keywords: "url", run: block(() => options.onLink()) },
    { id: "image", group: "Insert", label: "Image", description: "A picture from your PC", keywords: "picture photo img", run: block(() => options.onImage()) },
    { id: "emoji", group: "Insert", label: "Emoji", description: "Pick from every emoji", keywords: "smiley face symbol", run: block(() => options.onEmoji()) },
    { id: "date", group: "Insert", label: "Date and time", description: "Pick a day, and a time if you like", keywords: "calendar when due day deadline remind schedule future", run: block(() => options.onDate()) },
    { id: "now", group: "Insert", label: "Now", description: "Today's date and the time right now", keywords: "current date time timestamp clock", run: block((e) => e.chain().focus().insertDateTime(nowAttrs(true)).run()) },
    { id: "today", group: "Insert", label: "Today", description: "Today's date", keywords: "date day", run: block((e) => e.chain().focus().insertDateTime(nowAttrs(false)).run()) },
  ];
}

// Type "/" at the start of a line or after a space to open the insertion menu.
export const SlashCommands = Extension.create<SlashOptions>({
  name: "slashCommands",

  addOptions() {
    return { onState: () => {}, onLink: () => {}, onImage: () => {}, onDate: () => {}, onEmoji: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey("slashCommands"),
        char: "/",
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === "codeBlock") return false;
          return !$from.marks().some((m) => m.type.name === "code");
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return allItems(options).filter((i) => !q || i.label.toLowerCase().includes(q) || i.keywords?.includes(q) || i.group.toLowerCase().includes(q));
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: () => {
          let index = 0;
          let props: SuggestionProps<SlashItem> | null = null;
          const publish = () => {
            if (!props) {
              options.onState(null);
              return;
            }
            const p = props;
            options.onState({
              items: p.items,
              query: p.query,
              index,
              rect: p.clientRect?.() ?? null,
              select: (item) => p.command(item),
              setIndex: (i) => {
                if (i === index) return;
                index = i;
                publish();
              },
            });
          };
          return {
            onStart: (p) => {
              props = p;
              index = 0;
              publish();
            },
            onUpdate: (p) => {
              props = p;
              index = Math.min(index, Math.max(0, p.items.length - 1));
              publish();
            },
            onKeyDown: ({ event }) => {
              if (!props) return false;
              if (event.key === "Escape") {
                options.onState(null);
                return true;
              }
              if (props.items.length === 0) return false;
              if (event.key === "ArrowDown") {
                index = (index + 1) % props.items.length;
                publish();
                return true;
              }
              if (event.key === "ArrowUp") {
                index = (index - 1 + props.items.length) % props.items.length;
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
});
