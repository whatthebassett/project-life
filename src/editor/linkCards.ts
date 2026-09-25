import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  site: string;
  image: string;
}

export interface LinkCardOptions {
  fetch: (url: string) => Promise<LinkPreview | null>;
  open: (url: string) => void;
  // Settings → Editing → Link previews, read live.
  enabled: () => boolean;
}

const key = new PluginKey("linkCards");
const cache = new Map<string, Promise<LinkPreview | null>>();

// Every web link gets a metadata card beneath its line. The cards are
// decorations: they never enter the document or the saved Markdown.
// Turning them on or off in Settings takes effect through refreshLinkCards.
export const LinkCards = Extension.create<LinkCardOptions>({
  name: "linkCards",

  addOptions() {
    return { fetch: async () => null, open: () => {}, enabled: () => true };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    const build = (doc: PMNode) => {
      if (!options.enabled()) return DecorationSet.empty;
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock || node.type.name === "codeBlock") return true;
        const urls: string[] = [];
        node.forEach((child) => {
          const marks = child.marks;
          if (marks.some((m) => m.type.name === "code" || m.type.name === "spoiler")) return;
          const link = marks.find((m) => m.type.name === "link");
          const href = link?.attrs.href as string | undefined;
          if (href && /^https?:\/\//i.test(href) && !urls.includes(href)) urls.push(href);
        });
        for (const url of urls) {
          decos.push(
            Decoration.widget(pos + node.nodeSize, () => card(url, options), { side: 1, key: `card:${url}`, ignoreSelection: true }),
          );
        }
        return false;
      });
      return DecorationSet.create(doc, decos);
    };

    return [
      new Plugin({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(key) ? build(tr.doc) : old),
        },
        props: {
          decorations: (state) => key.getState(state),
        },
      }),
    ];
  },
});

// Redraw the cards after the setting changes.
export function refreshLinkCards(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(key, true));
}

function card(url: string, options: LinkCardOptions): HTMLElement {
  const el = document.createElement("div");
  el.className = "link-card";
  el.contentEditable = "false";
  el.innerHTML = `<div class="link-card-body"><div class="link-card-title"></div><div class="link-card-desc"></div><div class="link-card-site"></div></div>`;
  const title = el.querySelector(".link-card-title") as HTMLElement;
  const desc = el.querySelector(".link-card-desc") as HTMLElement;
  const site = el.querySelector(".link-card-site") as HTMLElement;
  title.textContent = hostOf(url);
  site.textContent = url;
  el.title = url;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    options.open(url);
  });

  let pending = cache.get(url);
  if (!pending) {
    pending = options.fetch(url).catch(() => null);
    cache.set(url, pending);
  }
  void pending.then((preview) => {
    if (!preview) return;
    if (preview.title) title.textContent = preview.title;
    desc.textContent = preview.description;
    desc.hidden = !preview.description;
    site.textContent = preview.site || hostOf(url);
    if (preview.image) {
      const img = document.createElement("img");
      img.className = "link-card-image";
      img.src = preview.image;
      img.alt = "";
      img.onerror = () => img.remove();
      el.prepend(img);
    }
  });
  return el;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
