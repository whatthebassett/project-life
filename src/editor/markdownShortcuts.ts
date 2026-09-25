import { Extension } from "@tiptap/core";
import type { Mark, MarkType, Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping } from "@tiptap/pm/transform";
import { codeLanguage } from "./code";

// Markdown typed straight into the Visual editor becomes the real thing.
//
// Inline: `code`, **bold**, __bold__, *italic*, _italic_, ~~struck~~,
// ||spoiler||, <u>underline</u>, ++underline++ and [text](address). Two ways
// of typing them work:
// - In order: it converts as the closing mark is typed.
// - Markers first, then filled in (type `` or []() and go back inside): it
//   converts once it's complete and the cursor leaves it, so a link's address
//   isn't cut short while it's being typed. Only where you've just typed, so
//   clicking through old text never changes it.
//
// Blocks: ``` (or ~~~, with a language if you like) then Enter starts a code
// block; | a | b | then Enter starts a table with those headings; and in a
// quote, [!info] (or any callout kind) then a space turns it into a callout.
// Headings, lists, to-dos, quotes and dividers are TipTap's own.
//
// TipTap's own typing rules only see characters typed one at a time, in order.
// On many Windows keyboard layouts (US-International, most European ones) ` and
// ~ are dead keys that arrive as composed text, which those rules never see.
// This works from the text itself after every change, however it arrived.
//
// Backspace straight after an inline conversion puts the Markdown back as
// typed, for the times the characters were meant literally.

// The conversion just made, until anything else changes.
interface Converted {
  start: number;
  end: number;
  markdown: string;
  marks: readonly Mark[];
}

interface ShortcutState {
  converted: Converted | null;
  // The start of the line just typed in, while the cursor is still in it.
  edited: number | null;
}

const key = new PluginKey<ShortcutState>("markdownShortcuts");

interface Shortcut {
  // Group 1 is the whole Markdown to replace; group 2 the text to keep.
  pattern: RegExp;
  mark: string;
  // The link's address, for [text](address).
  attrs?: (m: RegExpExecArray) => Record<string, unknown>;
}

// Each opening mark must start the line or follow a space or bracket, so
// snake_case, 2*3*4 and file paths are left alone. Doubled marks come before
// single ones so **bold** is never taken for *italic*.
const shortcuts: Shortcut[] = [
  { pattern: /(?:^|[\s([{])(`([^`\n]+)`)/, mark: "code" },
  { pattern: /(?:^|[\s([{])(\*\*([^*\s](?:[^*\n]*[^*\s])?)\*\*)/, mark: "bold" },
  { pattern: /(?:^|[\s([{])(__([^_\s](?:[^_\n]*[^_\s])?)__)/, mark: "bold" },
  { pattern: /(?:^|[\s([{])(~~([^~\s](?:[^~\n]*[^~\s])?)~~)/, mark: "strike" },
  { pattern: /(?:^|[\s([{])(\|\|([^|\s](?:[^|\n]*[^|\s])?)\|\|)/, mark: "spoiler" },
  { pattern: /(?:^|[\s([{])(\+\+([^+\s](?:[^+\n]*[^+\s])?)\+\+)/, mark: "underline" },
  { pattern: /()(<u>([^<\n]+)<\/u>)/i, mark: "underline" },
  { pattern: /(?:^|[\s([{])(\*([^*\s](?:[^*\n]*[^*\s])?)\*)(?!\*)/, mark: "italic" },
  { pattern: /(?:^|[\s([{])(_([^_\s](?:[^_\n]*[^_\s])?)_)(?!_)/, mark: "italic" },
  {
    pattern: /(?:^|[^!])(\[([^\]\n]+)\]\(([^()\s]+)\))/,
    mark: "link",
    attrs: (m) => ({ href: /^[a-z][a-z0-9+.-]*:|^[#/]/i.test(m[3]) ? m[3] : `https://${m[3]}` }),
  },
];

// <u>…</u> has an empty group before its own two; line the groups up.
function groups(m: RegExpExecArray, shortcut: Shortcut): { whole: string; text: string } {
  return shortcut.pattern.source.startsWith("()") ? { whole: m[2], text: m[3] } : { whole: m[1], text: m[2] };
}

// Ending right where the cursor is (typed in order), and anywhere in a line.
const atCursor = shortcuts.map((s) => ({ ...s, pattern: new RegExp(`${s.pattern.source}$`, s.pattern.flags) }));
const anywhere = shortcuts.map((s) => ({ ...s, pattern: new RegExp(s.pattern.source, `${s.pattern.flags}g`) }));

export const MarkdownShortcuts = Extension.create({
  name: "markdownShortcuts",

  addProseMirrorPlugins() {
    return [
      new Plugin<ShortcutState>({
        key,
        state: {
          init: () => ({ converted: null, edited: null }),
          apply: (tr, last, _old, state) => {
            const meta = tr.getMeta(key) as { converted?: Converted; done?: boolean } | undefined;
            const converted = meta?.converted ?? (tr.docChanged || tr.selectionSet ? null : last.converted);
            let edited = last.edited === null ? null : tr.mapping.map(last.edited);
            const $at = state.selection.$head;
            if (meta?.done) edited = null;
            else if (typedAtCursor(tr, state) && $at.parent.isTextblock && $at.depth > 0) edited = $at.before();
            return { converted, edited };
          },
        },
        props: {
          handleKeyDown: (view, event) => {
            const state = view.state;
            if (event.key === "Backspace") {
              const last = key.getState(state)?.converted;
              if (!last || !state.selection.empty || state.selection.from !== last.end) return false;
              const tr = state.tr.replaceWith(last.start, last.end, state.schema.text(last.markdown, last.marks));
              view.dispatch(tr.setMeta(key, { done: true }));
              return true;
            }
            if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              const tr = codeFence(state) ?? tableRow(state);
              if (!tr) return false;
              view.dispatch(tr.setMeta(key, { done: true }).scrollIntoView());
              return true;
            }
            return false;
          },
        },
        appendTransaction: (trs, oldState, state) => {
          if (!trs.some((tr) => tr.docChanged || tr.selectionSet)) return null;
          // Not for undo/redo, pastes, loading a note, or this plugin's own change.
          if (trs.some((tr) => tr.getMeta(key) || tr.getMeta("history$") || tr.getMeta("paste") || tr.getMeta("uiEvent") === "paste" || tr.getMeta("addToHistory") === false)) return null;
          return calloutMark(trs, state) ?? typedInOrder(trs, oldState, state) ?? leftFilledIn(trs, oldState, state);
        },
      }),
    ];
  },
});

// Did this change happen right where the cursor now is? Typing does; loading
// a note, tidying up a table and the like happen elsewhere or everywhere.
function typedAtCursor(tr: Transaction, state: EditorState): boolean {
  if (!tr.docChanged || !state.selection.empty || tr.getMeta("addToHistory") === false) return false;
  const head = state.selection.head;
  let touched = false;
  tr.mapping.maps.forEach((map, i) => {
    const rest = tr.mapping.slice(i + 1);
    map.forEach((_a, _b, from, to) => {
      if (head >= rest.map(from, -1) && head <= rest.map(to, 1)) touched = true;
    });
  });
  return touched;
}

// The closing mark was just typed: convert what ends at the cursor.
function typedInOrder(trs: readonly Transaction[], oldState: EditorState, state: EditorState): Transaction | null {
  const { selection } = state;
  if (!trs.some((tr) => typedAtCursor(tr, state)) || !oldState.selection.empty || selection.from <= oldState.selection.from) return null;
  const $at = selection.$from;
  if (!writable($at.parent) || $at.marks().some((m) => m.type.name === "code")) return null;
  const before = $at.parent.textBetween(Math.max(0, $at.parentOffset - 300), $at.parentOffset, undefined, "￼");
  for (const shortcut of atCursor) {
    const m = shortcut.pattern.exec(before);
    if (m) return inline(state, shortcut, m, $at.pos - groups(m, shortcut).whole.length, true);
  }
  return null;
}

// The cursor just left Markdown it had been filling in: convert it.
function leftFilledIn(trs: readonly Transaction[], oldState: EditorState, state: EditorState): Transaction | null {
  const edited = key.getState(state)?.edited ?? null;
  if (edited === null) return null;
  const mapping = new Mapping();
  for (const tr of trs) mapping.appendMapping(tr.mapping);
  const $was = state.doc.resolve(mapping.map(oldState.selection.head));
  if ($was.depth === 0 || $was.before() !== edited || !writable($was.parent)) return null;
  const block = $was.parent;
  const offset = $was.parentOffset;
  const $now = state.selection.$head;
  const sameBlock = $now.depth > 0 && $now.before() === edited;
  const text = block.textBetween(0, block.content.size, undefined, "￼");
  for (const shortcut of anywhere) {
    shortcut.pattern.lastIndex = 0;
    for (let m = shortcut.pattern.exec(text); m; m = shortcut.pattern.exec(text)) {
      const whole = groups(m, shortcut).whole;
      const start = m.index + m[0].length - whole.length;
      const end = start + whole.length;
      const wasInside = offset > start && offset < end;
      const stillInside = sameBlock && $now.parentOffset > start && $now.parentOffset < end;
      if (!wasInside || stillInside) continue;
      const from = edited + 1 + start;
      if (state.doc.resolve(from + 1).marks().some((mk) => mk.type.name === "code")) continue;
      return inline(state, shortcut, m, from, false);
    }
  }
  return null;
}

// Text that can take formatting: a line of writing, not a code block.
function writable(block: PMNode): boolean {
  return block.isTextblock && !block.type.spec.code;
}

function inline(state: EditorState, shortcut: Shortcut, m: RegExpExecArray, start: number, undoable: boolean): Transaction | null {
  const type: MarkType | undefined = state.schema.marks[shortcut.mark];
  if (!type) return null;
  const { whole, text } = groups(m, shortcut);
  const around = state.doc.resolve(start).marks();
  const mark = type.create(shortcut.attrs?.(m) ?? null);
  const tr = state.tr.replaceWith(start, start + whole.length, state.schema.text(text, mark.addToSet(around)));
  // Carry on typing in plain text after it.
  tr.removeStoredMark(type);
  tr.setMeta(key, undoable ? { converted: { start, end: start + text.length, markdown: whole, marks: around }, done: true } : { done: true });
  return tr;
}

// The paragraph the cursor ends, if the cursor is at its end and it's a plain line.
function lineAtEnd(state: EditorState): { node: PMNode; pos: number; text: string } | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth === 0 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== $from.parent.content.size) return null;
  return { node: $from.parent, pos: $from.before(), text: $from.parent.textContent };
}

// ``` or ~~~ (and a language), then Enter: a code block.
function codeFence(state: EditorState): Transaction | null {
  const line = lineAtEnd(state);
  const type = state.schema.nodes.codeBlock;
  const m = line && /^(?:```|~~~)\s*([\w+#.-]*)\s*$/.exec(line.text);
  if (!line || !type || !m) return null;
  const block = type.create({ language: m[1] || codeLanguage() });
  const tr = state.tr.replaceWith(line.pos, line.pos + line.node.nodeSize, block);
  return tr.setSelection(TextSelection.create(tr.doc, line.pos + 1));
}

// | Name | Date |, then Enter: a table with those headings and a row to fill.
function tableRow(state: EditorState): Transaction | null {
  const line = lineAtEnd(state);
  const { table, tableRow: row, tableHeader: header, tableCell: cell, paragraph } = state.schema.nodes;
  if (!line || !table || !row || !header || !cell || !paragraph) return null;
  if (state.selection.$from.depth !== 1) return null;
  const m = /^\|(.+)\|\s*$/.exec(line.text);
  if (!m) return null;
  const names = m[1].split("|").map((c) => c.trim());
  if (names.length < 2 || names.every((c) => c === "") || names.every((c) => /^:?-+:?$/.test(c))) return null;
  const heads = names.map((n) => header.create(null, paragraph.create(null, n ? state.schema.text(n) : null)));
  const blanks = names.map(() => cell.create(null, paragraph.create()));
  const node = table.create(null, [row.create(null, heads), row.create(null, blanks)]);
  const tr = state.tr.replaceWith(line.pos, line.pos + line.node.nodeSize, node);
  // Into the first empty cell: table, header row, then its cells, then the body row.
  const firstBody = line.pos + 1 + node.child(0).nodeSize + 1 + 1 + 1;
  return tr.setSelection(TextSelection.create(tr.doc, firstBody));
}

// In a quote, [!info] and a space at the start of its first line: a callout.
function calloutMark(trs: readonly Transaction[], state: EditorState): Transaction | null {
  if (!trs.some((tr) => typedAtCursor(tr, state))) return null;
  const { $from, empty } = state.selection;
  const type = state.schema.nodes.callout;
  if (!empty || !type || $from.depth < 2) return null;
  const quote = $from.node(-1);
  if (quote.type.name !== "blockquote" || $from.index(-1) !== 0 || !$from.parent.isTextblock) return null;
  const m = /^\[!([\w-]+)\][+-]?\s$/.exec($from.parent.textBetween(0, $from.parentOffset, undefined, "￼"));
  if (!m) return null;
  const quotePos = $from.before(-1);
  const tr = state.tr.delete($from.start(), $from.pos);
  tr.setNodeMarkup(quotePos, type, { kind: m[1].toLowerCase() });
  return tr.setMeta(key, { done: true });
}
