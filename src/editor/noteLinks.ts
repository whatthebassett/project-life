import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { titleOf, type NoteInfo } from "../lib/api";

// Links from one note to another. Type "\" and a few letters to find a note;
// Enter (or a click) puts a link to it where you are. In the file it's an
// ordinary Markdown link to the note's file, [Plans](Plans.md), so other
// Markdown apps follow it too. In the note it shows as a chip with a page
// icon; a click opens the note, Ctrl+click opens it in a new tab. A link to a
// note that's gone (renamed or deleted) shows faded.

export interface NoteLinkState {
  items: NoteInfo[];
  query: string;
  index: number;
  rect: DOMRect | null;
  select: (note: NoteInfo) => void;
}

export interface NoteLinkOptions {
  // Every note, the one being edited, and what to do with a link's click.
  notes: () => NoteInfo[];
  current: () => string | null;
  open: (name: string, newTab: boolean) => void;
  onState: (state: NoteLinkState | null) => void;
}

const LIMIT = 8;

// A link's address names a note when it's a file of ours: no scheme, ending
// in .md. The note's name is the address, decoded.
export function noteOfHref(href: string | null | undefined): string | null {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#")) return null;
  let name: string;
  try {
    name = decodeURIComponent(href);
  } catch {
    name = href;
  }
  name = name.replace(/^\.\//, "");
  return /\.md$/i.test(name) && !name.includes("/") ? name : null;
}

export const hrefOfNote = (name: string) => encodeURIComponent(name).replace(/%2E/gi, ".");

// How well a title matches what's typed: its start, then a word's start,
// then anywhere. -1 is no match.
function score(title: string, q: string): number {
  const t = title.toLowerCase();
  if (t.startsWith(q)) return 3;
  if (t.split(/[\s\-_]+/).some((w) => w.startsWith(q))) return 2;
  return t.includes(q) ? 1 : -1;
}

function matching(notes: NoteInfo[], current: string | null, query: string): NoteInfo[] {
  const q = query.trim().toLowerCase();
  const others = notes.filter((n) => n.name.toLowerCase() !== current?.toLowerCase());
  if (!q) return [...others].sort((a, b) => b.modified - a.modified).slice(0, LIMIT);
  return others
    .map((note) => ({ note, rank: score(titleOf(note.name), q) }))
    .filter((r) => r.rank >= 0)
    .sort((a, b) => b.rank - a.rank || b.note.modified - a.note.modified)
    .slice(0, LIMIT)
    .map((r) => r.note);
}

const decorations = new PluginKey("noteLinkChips");

// The chips: every link to a note gets the note-link class (and is-missing
// when there's no such note any more).
function chips(doc: PMNode, exists: (name: string) => boolean): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const link = node.marks.find((m) => m.type.name === "link");
    const name = noteOfHref(link?.attrs.href as string | undefined);
    if (!name) return;
    found.push(Decoration.inline(pos, pos + node.nodeSize, { class: exists(name) ? "note-link" : "note-link is-missing", "data-note": name }));
  });
  return DecorationSet.create(doc, found);
}

export const NoteLinks = Extension.create<NoteLinkOptions>({
  name: "noteLinks",

  addOptions() {
    return { notes: () => [], current: () => null, open: () => {}, onState: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const exists = (name: string) => options.notes().some((n) => n.name.toLowerCase() === name.toLowerCase());
    return [
      Suggestion<NoteInfo>({
        editor: this.editor,
        pluginKey: new PluginKey("noteLinkSuggest"),
        char: "\\",
        allowedPrefixes: [" ", "(", "[", " "],
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.name === "codeBlock") return false;
          return !$from.marks().some((m) => m.type.name === "code");
        },
        items: ({ query }) => matching(options.notes(), options.current(), query),
        // The note's title, linked, then a space to carry on typing after it.
        command: ({ editor, range, props: note }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              { type: "text", text: titleOf(note.name), marks: [{ type: "link", attrs: { href: hrefOfNote(note.name) } }] },
              { type: "text", text: " " },
            ])
            .run();
        },
        render: () => {
          let index = 0;
          let props: SuggestionProps<NoteInfo> | null = null;
          const publish = () => {
            if (!props) return options.onState(null);
            const p = props;
            options.onState({ items: p.items, query: p.query, index, rect: p.clientRect?.() ?? null, select: (n) => p.command(n) });
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
              if (!props) return false;
              if (event.key === "Escape") {
                options.onState(null);
                props = null;
                return true;
              }
              if (!props.items.length) return false;
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
      new Plugin({
        key: decorations,
        state: {
          init: (_config, state) => chips(state.doc, exists),
          // Redrawn when the note changes, or when asked (the notebook changed).
          apply: (tr, old, _before, state) => (tr.docChanged || tr.getMeta(decorations) ? chips(state.doc, exists) : old),
        },
        props: {
          decorations: (state) => decorations.getState(state),
          handleDOMEvents: {
            // A note link opens its note: here, or with Ctrl in a new tab.
            click: (_view, event) => {
              const a = (event.target as HTMLElement | null)?.closest?.("a[href]");
              const name = noteOfHref(a?.getAttribute("href"));
              if (!name || event.button !== 0) return false;
              event.preventDefault();
              options.open(name, event.ctrlKey || event.metaKey);
              return true;
            },
          },
        },
      }),
    ];
  },
});

// Asks the chips to look again (a note was added, renamed or deleted).
export const noteLinksChanged = decorations;
