import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { checkSpelling, onSpellChange, spellOn } from "../lib/spell";

// Misspelled words in a note, underlined in red (lib/spell.ts asks Windows).
// Each paragraph is checked once for what it says, so typing only sends the
// paragraph being typed in. Code, links and the word still being typed (the
// cursor at its end) aren't marked. While this is on, the browser's own
// spell check stays out of the note, so words aren't underlined twice.

interface Block {
  text: string;
  // The note position of each character of `text`.
  at: number[];
}

// What each paragraph's text was found to have, by text, for every note.
const known = new Map<string, [number, number][]>();

// Every paragraph's text, with code and links blanked out (kept the same
// length so the positions still line up) and anything that isn't text a space.
function blocks(doc: PMNode): Block[] {
  const out: Block[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false;
    if (!node.isTextblock) return true;
    let text = "";
    const at: number[] = [];
    node.forEach((child, offset) => {
      const start = pos + 1 + offset;
      if (child.isText && child.text) {
        const skip = child.marks.some((m) => m.type.name === "code" || m.type.name === "link");
        for (let i = 0; i < child.text.length; i++) {
          text += skip ? " " : child.text[i];
          at.push(start + i);
        }
      } else {
        text += " ";
        at.push(start);
      }
    });
    if (text.trim()) out.push({ text, at });
    return false;
  });
  return out;
}

export interface Misspelling {
  from: number;
  to: number;
  word: string;
}

function misspellings(doc: PMNode): Misspelling[] {
  const out: Misspelling[] = [];
  for (const b of blocks(doc)) {
    for (const [start, length] of known.get(b.text) ?? []) {
      const from = b.at[start];
      const last = b.at[start + length - 1];
      if (from === undefined || last === undefined) continue;
      out.push({ from, to: last + 1, word: b.text.slice(start, start + length) });
    }
  }
  return out;
}

interface SpellState {
  decos: DecorationSet;
  // Where the cursor was after the last edit: the word ending there is
  // still being typed.
  typing: number | null;
}

const key = new PluginKey<SpellState>("spellcheck");

function decorate(state: EditorState, typing: number | null): DecorationSet {
  if (!spellOn()) return DecorationSet.empty;
  const decos = misspellings(state.doc)
    .filter((m) => m.to !== typing)
    .map((m) => Decoration.inline(m.from, m.to, { class: "misspelled" }));
  return DecorationSet.create(state.doc, decos);
}

// The misspelled word at `pos`, if there is one (for the right-click menu).
export function misspellingAt(view: EditorView, pos: number): Misspelling | null {
  if (!spellOn() || !key.getState(view.state)) return null;
  return misspellings(view.state.doc).find((m) => pos >= m.from && pos <= m.to) ?? null;
}

export const SpellCheck = Extension.create({
  name: "spellcheck",

  addProseMirrorPlugins() {
    return [
      new Plugin<SpellState>({
        key,
        state: {
          init: (_, state) => ({ decos: decorate(state, null), typing: null }),
          apply(tr, prev, _old, state) {
            const typing = tr.docChanged ? (tr.selection.empty ? tr.selection.head : null) : tr.selectionSet ? null : prev.typing;
            if (!tr.docChanged && !tr.getMeta(key) && typing === prev.typing) return prev;
            return { decos: decorate(state, typing), typing };
          },
        },
        props: {
          decorations: (state) => key.getState(state)?.decos,
          attributes: (): Record<string, string> => (spellOn() ? { spellcheck: "false" } : {}),
        },
        view(view) {
          let timer = 0;
          // Ask about the paragraphs not seen yet, then redraw.
          const run = async () => {
            if (!spellOn()) return redraw();
            const fresh = [...new Set(blocks(view.state.doc).map((b) => b.text))].filter((t) => !known.has(t));
            if (!fresh.length) return;
            const found = await checkSpelling(fresh);
            if (known.size > 5000) known.clear();
            fresh.forEach((t, i) => known.set(t, found[i] ?? []));
            redraw();
          };
          const redraw = () => {
            if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true).setMeta("addToHistory", false));
          };
          const soon = (ms = 350) => {
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void run(), ms);
          };
          // Turned on or off, or a word added or ignored: check afresh.
          const off = onSpellChange(() => {
            known.clear();
            redraw();
            soon(0);
          });
          soon(0);
          return {
            update(v, prevState) {
              if (v.state.doc !== prevState.doc) soon();
            },
            destroy() {
              window.clearTimeout(timer);
              off();
            },
          };
        },
      }),
    ];
  },
});
