import { EditorView as CodeView } from "@codemirror/view";
import type { Editor } from "@tiptap/core";
import { BookPlus, EyeOff } from "lucide-react";
import type { MenuItem } from "./ContextMenu";
import { misspellingAt } from "../editor/spellcheck";
import { addToDictionary, ignoreSpelling, misspelled, spellOn, suggestSpelling, wordAround } from "../lib/spell";

// Right-clicking a misspelled word, anywhere you can type: Windows'
// suggestions to swap it for, Add to dictionary, and Ignore, above the
// menu's usual items (AppMenu, and a note's table and to-do menus).

interface Hit {
  word: string;
  replace: (with_: string) => void;
}

// Where in a text box's text the point clicked is. A text box doesn't say,
// so for a moment an invisible copy of its text lies exactly over it (same
// box, font, padding and scroll) and the browser finds the point in that.
// Failing that, where its cursor is.
function inField(field: HTMLInputElement | HTMLTextAreaElement, x: number, y: number): number {
  const area = field instanceof HTMLTextAreaElement;
  const cs = getComputedStyle(field);
  const box = field.getBoundingClientRect();
  const copy = document.createElement("div");
  const same = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "letterSpacing", "wordSpacing", "textTransform", "textIndent", "textAlign", "tabSize", "boxSizing"] as const;
  for (const prop of same) copy.style[prop] = cs[prop];
  for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
    copy.style[`padding${side}`] = cs[`padding${side}`];
    copy.style[`border${side}Width`] = cs[`border${side}Width`];
  }
  // A one-line box centres its text: one line as tall as the space inside.
  const inside = field.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  Object.assign(copy.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    overflow: "hidden",
    borderStyle: "solid",
    borderColor: "transparent",
    lineHeight: area ? cs.lineHeight : `${inside}px`,
    whiteSpace: area ? "pre-wrap" : "pre",
    overflowWrap: area ? "break-word" : "normal",
    opacity: "0",
    pointerEvents: "auto",
    zIndex: "2147483647",
  });
  const text = document.createTextNode(field.value);
  copy.appendChild(text);
  document.body.appendChild(copy);
  copy.scrollTop = field.scrollTop;
  copy.scrollLeft = field.scrollLeft;
  const spot = document.caretRangeFromPoint?.(x, y);
  copy.remove();
  if (spot && spot.startContainer === text) return spot.startOffset;
  return field.selectionStart ?? 0;
}

async function wordAt(target: Element, x: number, y: number): Promise<Hit | null> {
  // A note in Visual mode: the words it has underlined itself.
  const note = target.closest(".ProseMirror") as (HTMLElement & { editor?: Editor }) | null;
  if (note?.editor) {
    const view = note.editor.view;
    const pos = view.posAtCoords({ left: x, top: y })?.pos;
    const m = pos === undefined ? null : misspellingAt(view, pos);
    if (!m) return null;
    return {
      word: m.word,
      replace: (s) => {
        view.dispatch(view.state.tr.insertText(s, m.from, m.to));
        view.focus();
      },
    };
  }
  if (target.closest('[spellcheck="false"]')) return null;

  // A note in Markdown mode.
  const host = target.closest(".cm-editor");
  const code = host ? CodeView.findFromDOM(host as HTMLElement) : null;
  if (code) {
    const pos = code.posAtCoords({ x, y });
    const range = pos === null ? null : code.state.wordAt(pos);
    const word = range ? code.state.sliceDoc(range.from, range.to) : "";
    if (!range || !(await misspelled(word))) return null;
    return {
      word,
      replace: (s) => {
        code.dispatch({ changes: { from: range.from, to: range.to, insert: s } });
        code.focus();
      },
    };
  }

  // A text box.
  const field = target.closest("input, textarea") as HTMLInputElement | HTMLTextAreaElement | null;
  if (field) {
    if (field instanceof HTMLInputElement && !["", "text", "search"].includes(field.getAttribute("type") ?? "")) return null;
    const span = wordAround(field.value, inField(field, x, y));
    const word = span ? field.value.slice(span.start, span.end) : "";
    if (!span || !(await misspelled(word))) return null;
    return {
      word,
      replace: (s) => {
        field.focus();
        field.setSelectionRange(span.start, span.end);
        // As if typed, so Undo takes it back and the screen hears about it.
        document.execCommand("insertText", false, s);
      },
    };
  }

  // Any other editable text.
  if (!(target instanceof HTMLElement ? target : target.parentElement)?.isContentEditable) return null;
  const range = document.caretRangeFromPoint?.(x, y);
  const node = range?.startContainer;
  if (!range || !node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const span = wordAround(text, range.startOffset);
  const word = span ? text.slice(span.start, span.end) : "";
  if (!span || !(await misspelled(word))) return null;
  return {
    word,
    replace: (s) => {
      const r = document.createRange();
      r.setStart(node, span.start);
      r.setEnd(node, span.end);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      document.execCommand("insertText", false, s);
    },
  };
}

// The spelling items for a right-click at (x, y) on `target`: none when the
// word there is spelled right (or spell check is off).
export async function spellingItems(target: Element | null, x: number, y: number): Promise<MenuItem[]> {
  if (!target || !spellOn()) return [];
  const hit = await wordAt(target, x, y);
  if (!hit) return [];
  const suggestions = await suggestSpelling(hit.word);
  return [
    ...(suggestions.length
      ? suggestions.map((s): MenuItem => ({ label: s, onSelect: () => hit.replace(s) }))
      : [{ label: "No suggestions", disabled: true } as MenuItem]),
    { label: "Add to dictionary", icon: <BookPlus size={15} />, onSelect: () => void addToDictionary(hit.word) },
    { label: "Ignore", icon: <EyeOff size={15} />, onSelect: () => void ignoreSpelling(hit.word) },
    { type: "separator" },
  ];
}
