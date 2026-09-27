import { Extension, getMarkRange } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { AddMarkStep, ReplaceStep } from "@tiptap/pm/transform";
import { closeHistory } from "@tiptap/pm/history";
import type { EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { currentSettings } from "../lib/settings";
import { previewFor, type LinkPreview } from "./linkPreviews";
import { viewOf, viewTitle, type LinkView } from "./smartLinks";
import { youTubeEmbed } from "./videoEmbeds";

export interface LinkTitleOptions {
  fetch: (url: string) => Promise<LinkPreview | null>;
  // Settings → Notes → Link titles, read live.
  enabled: () => boolean;
}

// A link waiting for its page's title, and where it sits now.
interface Pending {
  id: number;
  url: string;
  from: number;
  to: number;
}

// `keep`: a change this plugin made (or was asked to make) that mustn't set
// off another title lookup, like putting the address back.
type Meta = { add: Pending[] } | { done: number } | { keep: true };

const key = new PluginKey<Pending[]>("linkTitles");
const bareUrl = /^https?:\/\/[^\s<>"]+$/i;
let nextId = 1;

// A web address that becomes a link, pasted or typed (the link mark turns it
// into one after a space or Enter) or added with Ctrl K, turns into a smart
// link once its page's title arrives: a chip with the site's icon and the
// title (smartLinks.ts), or a YouTube player when it's on a line of its own.
// Ctrl+Z puts the address back, and so does right-click → Display as → URL.
// Pasting onto selected words still links those words, and a link edited
// before the title comes is left alone.
export const LinkTitles = Extension.create<LinkTitleOptions>({
  name: "linkTitles",
  // Ahead of the link mark's own paste handling.
  priority: 1100,

  addOptions() {
    return { fetch: async () => null, enabled: () => true };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<Pending[]>({
        key,
        state: {
          init: () => [],
          apply: (tr, pending) => {
            let next = pending;
            if (tr.docChanged) {
              next = next
                .map((p) => ({ ...p, from: tr.mapping.map(p.from, 1), to: tr.mapping.map(p.to, -1) }))
                .filter((p) => p.from < p.to);
            }
            const meta = tr.getMeta(key) as Meta | undefined;
            if (meta && "add" in meta) next = [...next, ...meta.add];
            if (meta && "done" in meta) next = next.filter((p) => p.id !== meta.done);
            return next;
          },
        },

        // Links that just appeared as their bare address: typed ones the link
        // mark picked up, and ones added with Ctrl K. Not undo and redo, pastes
        // (handled below), loading a note, or this plugin's own changes.
        appendTransaction: (trs, _old, state) => {
          if (!options.enabled()) return null;
          if (trs.some((tr) => tr.getMeta(key) || tr.getMeta("history$") || tr.getMeta("paste") || tr.getMeta("uiEvent") === "paste" || tr.getMeta("addToHistory") === false)) return null;
          const found = newBareLinks(trs, state);
          return found.length ? state.tr.setMeta(key, { add: found } satisfies Meta) : null;
        },

        // Each link waiting for a title gets its page looked up once.
        view: (view) => {
          const started = new Set<number>();
          return {
            update: () => {
              for (const p of key.getState(view.state) ?? []) {
                if (started.has(p.id)) continue;
                started.add(p.id);
                void previewFor(p.url, options.fetch).then((preview) => putTitle(view, p.id, preview));
              }
            },
          };
        },

        props: {
          handlePaste: (view, event) => {
            if (!options.enabled()) return false;
            const url = event.clipboardData?.getData("text/plain").trim() ?? "";
            if (!bareUrl.test(url) || !URL.canParse(url)) return false;
            const { state } = view;
            const { selection, schema } = state;
            const linkType = schema.marks.link;
            if (!linkType || !selection.empty || selection.$from.parent.type.spec.code) return false;
            const marks = (state.storedMarks ?? selection.$from.marks()).filter((m) => m.type !== linkType);
            if (marks.some((m) => m.type.spec.code)) return false;

            const from = selection.from;
            const tr = state.tr.replaceSelectionWith(schema.text(url, [...marks, linkType.create({ href: url })]), false);
            tr.setMeta(key, { add: [{ id: nextId++, url, from, to: from + url.length }] } satisfies Meta);
            tr.setMeta("paste", true).setMeta("uiEvent", "paste");
            view.dispatch(tr.scrollIntoView());
            return true;
          },
        },
      }),
    ];
  },
});

// Where links were added in these changes: a link mark put on text, or text
// put in that already carries one. Returns those still showing their address.
function newBareLinks(trs: readonly Transaction[], state: EditorState): Pending[] {
  const linkType = state.schema.marks.link;
  if (!linkType) return [];
  const ranges: [number, number][] = [];
  trs.forEach((tr, ti) => {
    tr.steps.forEach((step, si) => {
      let from: number;
      let to: number;
      if (step instanceof AddMarkStep && step.mark.type === linkType) {
        from = step.from;
        to = step.to;
      } else if (step instanceof ReplaceStep && hasLink(step.slice.content, linkType)) {
        from = step.from;
        to = step.from + step.slice.size;
      } else return;
      // Where that is once everything after it has happened.
      const rest = tr.mapping.slice(si + 1);
      from = rest.map(from, -1);
      to = rest.map(to, 1);
      for (const later of trs.slice(ti + 1)) {
        from = later.mapping.map(from, -1);
        to = later.mapping.map(to, 1);
      }
      if (from < to) ranges.push([from, to]);
    });
  });
  const waiting = key.getState(state) ?? [];
  const found: Pending[] = [];
  for (const [from, to] of ranges) {
    state.doc.nodesBetween(from, Math.min(to, state.doc.content.size), (node, pos, parent) => {
      if (!node.isText || parent?.type.spec.code) return;
      const link = node.marks.find((m) => m.type === linkType);
      const href = link?.attrs.href as string | undefined;
      if (!href || node.text !== href || !bareUrl.test(href) || node.marks.some((m) => m.type.spec.code)) return;
      const end = pos + node.nodeSize;
      if (waiting.some((p) => p.from === pos) || found.some((p) => p.from === pos)) return;
      found.push({ id: nextId++, url: href, from: pos, to: end });
    });
  }
  return found;
}

function hasLink(content: PMNode["content"], linkType: PMNode["marks"][number]["type"]): boolean {
  let yes = false;
  content.descendants((node) => {
    if (yes) return false;
    if (node.isText && node.marks.some((m) => m.type === linkType)) yes = true;
    return !yes;
  });
  return yes;
}

// The title arrived: swap it in, if the link still shows just its address.
// It becomes a smart link: the view picked for it, else a player for a
// YouTube link alone on its line, else an inline chip.
function putTitle(view: EditorView, id: number, preview: LinkPreview | null) {
  if (view.isDestroyed) return;
  const p = key.getState(view.state)?.find((x) => x.id === id);
  if (!p) return;
  const tr = view.state.tr.setMeta(key, { done: id } satisfies Meta);
  const title = preview?.title.replace(/\s+/g, " ").trim();
  const node = view.state.doc.nodeAt(p.from);
  if (title && title !== p.url && node && stillBare(view.state, p)) {
    const linkType = view.state.schema.marks.link;
    const $from = view.state.doc.resolve(p.from);
    const alone = $from.parent.textContent.trim() === p.url;
    const shown: LinkView = alone && youTubeEmbed(p.url) && currentSettings().VideoEmbeds !== false ? "embed" : "inline";
    const marks = node.marks.map((m) => (m.type === linkType ? linkType.create({ ...m.attrs, title: m.attrs.title ?? viewTitle(shown) }) : m));
    // Its own undo step, so Ctrl+Z puts the address back.
    closeHistory(tr);
    tr.replaceWith(p.from, p.to, view.state.schema.text(title, marks));
  }
  view.dispatch(tr);
}

// Is the link still just its address?
function stillBare(state: EditorState, p: Pending) {
  if (state.doc.textBetween(p.from, p.to) !== p.url) return false;
  let whole = true;
  state.doc.nodesBetween(p.from, p.to, (node) => {
    if (node.isText && !node.marks.some((m) => m.type.name === "link" && m.attrs.href === p.url)) whole = false;
  });
  return whole;
}

// ----- right-click: Display as URL, Inline, Card or Embed -----

export interface LinkSpan {
  from: number;
  to: number;
  href: string;
  // True when it shows its address rather than a title or other words.
  bare: boolean;
  // How it shows now: its view, or "url" for a bare address with none.
  view: LinkView | null;
}

// The link a right-click landed on, from its element in the note.
export function linkSpanAt(view: EditorView, el: Element): LinkSpan | null {
  const linkType = view.state.schema.marks.link;
  if (!linkType) return null;
  let pos: number;
  try {
    pos = view.posAtDOM(el, 0);
  } catch {
    return null;
  }
  const href = el.getAttribute("href") ?? "";
  const range = getMarkRange(view.state.doc.resolve(pos), linkType, { href });
  if (!range) return null;
  const bare = view.state.doc.textBetween(range.from, range.to) === href;
  const link = view.state.doc.nodeAt(range.from)?.marks.find((m) => m.type === linkType);
  return { ...range, href, bare, view: (link && viewOf(link)) ?? (bare ? "url" : null) };
}

// Shows the link another way. URL puts the address back as plain link text;
// the others make it a smart link, looking the page's title up when it's
// showing its address.
export function setLinkView(view: EditorView, span: LinkSpan, shown: LinkView) {
  const { state } = view;
  const linkType = state.schema.marks.link;
  const node = state.doc.nodeAt(span.from);
  const link = node?.marks.find((m) => m.type === linkType);
  if (!node || !link) return;
  const mark = linkType.create({ ...link.attrs, title: viewTitle(shown) });
  if (shown === "url") {
    const marks = node.marks.map((m) => (m.type === linkType ? mark : m));
    view.dispatch(state.tr.replaceWith(span.from, span.to, state.schema.text(span.href, marks)).setMeta(key, { keep: true } satisfies Meta));
    return;
  }
  const tr = state.tr.addMark(span.from, span.to, mark);
  tr.setMeta(key, span.bare ? ({ add: [{ id: nextId++, url: span.href, from: span.from, to: span.to }] } satisfies Meta) : ({ keep: true } satisfies Meta));
  view.dispatch(tr);
}
