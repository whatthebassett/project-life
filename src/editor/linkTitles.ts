import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { closeHistory } from "@tiptap/pm/history";
import { previewFor, type LinkPreview } from "./linkPreviews";

export interface LinkTitleOptions {
  fetch: (url: string) => Promise<LinkPreview | null>;
  // Settings → Notes → Link titles, read live.
  enabled: () => boolean;
}

// A pasted link waiting for its page's title, and where it sits now.
interface Pending {
  id: number;
  url: string;
  from: number;
  to: number;
}

type Meta = { add: Pending } | { done: number };

const key = new PluginKey<Pending[]>("linkTitles");
const bareUrl = /^https?:\/\/[^\s<>"]+$/i;
let nextId = 1;

// Pasting a web address on its own goes in as a link, then its text turns
// into the page's title once that arrives. Ctrl+Z puts the address back.
// Pasting onto selected words still links those words, and the link is left
// alone if it's edited before the title comes.
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
            if (meta && "add" in meta) next = [...next, meta.add];
            if (meta && "done" in meta) next = next.filter((p) => p.id !== meta.done);
            return next;
          },
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

            const id = nextId++;
            const from = selection.from;
            const tr = state.tr.replaceSelectionWith(schema.text(url, [...marks, linkType.create({ href: url })]), false);
            tr.setMeta(key, { add: { id, url, from, to: from + url.length } } satisfies Meta);
            tr.setMeta("paste", true).setMeta("uiEvent", "paste");
            view.dispatch(tr.scrollIntoView());

            void previewFor(url, options.fetch).then((preview) => {
              if (view.isDestroyed) return;
              const p = key.getState(view.state)?.find((x) => x.id === id);
              if (!p) return;
              const tr = view.state.tr.setMeta(key, { done: id } satisfies Meta);
              const title = preview?.title.replace(/\s+/g, " ").trim();
              const node = view.state.doc.nodeAt(p.from);
              if (title && title !== url && node && stillBare(view.state, p)) {
                closeHistory(tr);
                tr.replaceWith(p.from, p.to, schema.text(title, node.marks));
                tr.setMeta("paste", true);
              }
              view.dispatch(tr);
            });
            return true;
          },
        },
      }),
    ];
  },
});

// Is the pasted link still just its address, as pasted?
function stillBare(state: EditorState, p: Pending) {
  if (state.doc.textBetween(p.from, p.to) !== p.url) return false;
  let whole = true;
  state.doc.nodesBetween(p.from, p.to, (node) => {
    if (node.isText && !node.marks.some((m) => m.type.name === "link" && m.attrs.href === p.url)) whole = false;
  });
  return whole;
}
