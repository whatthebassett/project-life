import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { motionReduced } from "../lib/motion";
import type { EditorSpot } from "../lib/positions";
import { autocompletion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { emojiPattern, loadEmoji, nativeOf, rememberEmoji, searchEmoji } from "../lib/emoji";
import { Decoration, MatchDecorator, ViewPlugin, placeholder, type DecorationSet, type ViewUpdate } from "@codemirror/view";

// Emoji in the source draw at the chosen emoji size too.
const emojiMarks = new MatchDecorator({ regexp: emojiPattern, decoration: Decoration.mark({ class: "cm-emoji" }) });
const emojiGlyphs = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = emojiMarks.createDeco(view);
    }
    update(u: ViewUpdate) {
      this.decorations = emojiMarks.updateDeco(u, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

// ":query" suggests emoji here too; picking one inserts the character.
async function emojiCompletions(ctx: CompletionContext): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/:[a-z0-9_+-]+$/i);
  if (!word) return null;
  const before = word.from > 0 ? ctx.state.sliceDoc(word.from - 1, word.from) : "";
  if (before && !/[\s([]/.test(before)) return null;
  const matches = searchEmoji(await loadEmoji(), word.text.slice(1), 40);
  if (!matches.length) return null;
  return {
    from: word.from,
    filter: false,
    options: matches.map((e) => {
      const native = nativeOf(e);
      return {
        label: `:${e.id}:`,
        displayLabel: `${native}  :${e.id}:`,
        detail: e.name,
        apply: (view, _completion, from, to) => {
          view.dispatch({ changes: { from, to, insert: native }, selection: { anchor: from + native.length } });
          rememberEmoji(native);
        },
      };
    }),
  };
}

interface Props {
  initial: string;
  lineNumbers: boolean;
  wordWrap: boolean;
  // Windows' blink time in ms; 0 keeps the cursor solid.
  blinkMs: number;
  onChange: (markdown: string) => void;
  onView?: (view: EditorView | null) => void;
  // The note's cover and title, scrolling with the text above it.
  header?: React.ReactNode;
  // Where the cursor and scroll were last time, and where they are now.
  spot?: EditorSpot;
  onSpot?: (spot: EditorSpot) => void;
}

const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: "var(--accent-text)" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--accent-text)" },
  { tag: t.url, color: "var(--muted)" },
  { tag: t.monospace, background: "var(--code-bg)" },
  { tag: t.processingInstruction, color: "var(--muted)" },
  { tag: t.quote, color: "var(--muted)" },
  { tag: t.contentSeparator, color: "var(--muted)" },
  { tag: t.keyword, color: "var(--accent-text)" },
  { tag: t.comment, color: "var(--muted)" },
]);

// The Markdown source, shown as is. Mount with a key per note.
export default function SourceEditor({ initial, lineNumbers: gutter, wordWrap, blinkMs, onChange, onView, header, spot, onSpot }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // Changing line numbers or wrapping rebuilds the editor; it comes back to
  // the latest spot, not the one the note opened with.
  const lastSpot = useRef(spot);
  const onSpotRef = useRef(onSpot);
  onSpotRef.current = onSpot;
  const report = (view: EditorView) => {
    const { anchor, head } = view.state.selection.main;
    lastSpot.current = { anchor, head, scroll: box.current?.scrollTop ?? 0 };
    onSpotRef.current?.(lastSpot.current);
  };
  const change = useRef(onChange);
  change.current = onChange;
  const viewCb = useRef(onView);
  viewCb.current = onView;

  useEffect(() => {
    if (!host.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initial,
        extensions: [
          history(),
          drawSelection({ cursorBlinkRate: blinkMs > 0 && !motionReduced() ? blinkMs * 2 : 0 }),
          highlightActiveLine(),
          ...(gutter ? [lineNumbers()] : []),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          autocompletion({ override: [emojiCompletions], icons: false, activateOnTyping: true }),
          placeholder("Write in Markdown: # for headings, - for lists, > [!info] for a callout. Type : for emoji."),
          emojiGlyphs,
          ...(wordWrap ? [EditorView.lineWrapping] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
            if (update.selectionSet) report(update.view);
          }),
        ],
      }),
      parent: host.current,
    });
    viewCb.current?.(view);
    const saved = lastSpot.current;
    let frame = 0;
    if (saved) {
      const clamp = (n: number) => Math.max(0, Math.min(n, view.state.doc.length));
      view.dispatch({ selection: { anchor: clamp(saved.anchor), head: clamp(saved.head) } });
      frame = window.requestAnimationFrame(() => {
        if (box.current) box.current.scrollTop = saved.scroll;
        view.focus();
      });
    }
    const onScroll = () => report(view);
    const outer = box.current;
    outer?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      outer?.removeEventListener("scroll", onScroll);
      viewCb.current?.(null);
      view.destroy();
    };
    // The document is only read on mount; the parent remounts per note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gutter, wordWrap, blinkMs]);

  return (
    <div ref={box} className="h-full overflow-y-auto">
      {header}
      <div ref={host} className="noted-source px-10 pb-6" />
    </div>
  );
}
