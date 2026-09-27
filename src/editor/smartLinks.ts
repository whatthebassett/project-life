import { Extension } from "@tiptap/core";
import { Link } from "@tiptap/extension-link";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { previewFor, type LinkPreview } from "./linkPreviews";

// How a web link shows in a note, as Confluence's smart links do:
// - url: its address, as an ordinary link;
// - inline: a chip with the site's icon and the page's title;
// - card: the chip, with a card beneath the line (picture, title, description);
// - embed: the chip, with the page playing beneath the line (YouTube, see videoEmbeds.ts).
// The choice is kept in the link's Markdown title, [Title](https://… "view:card"),
// so the note stays plain Markdown. A link with no choice shows as written.
export type LinkView = "url" | "inline" | "card" | "embed";

const VIEWS: LinkView[] = ["url", "inline", "card", "embed"];

export function viewOf(link: Mark): LinkView | null {
  const title = String(link.attrs.title ?? "");
  const v = title.startsWith("view:") ? (title.slice(5) as LinkView) : null;
  return v && VIEWS.includes(v) ? v : null;
}

export const viewTitle = (v: LinkView | null) => (v && v !== "url" ? `view:${v}` : null);

// The link mark, keeping a view out of the page: it's for the note file, and
// as a title attribute it would pop up as the link's tooltip.
export const NotedLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: {
        default: null,
        renderHTML: (attrs: { title?: string | null }) => (attrs.title && !attrs.title.startsWith("view:") ? { title: attrs.title } : {}),
      },
    };
  },
});

export interface SmartLinkOptions {
  fetch: (url: string) => Promise<LinkPreview | null>;
  open: (url: string) => void;
}

const key = new PluginKey("smartLinks");

// Site icons that loaded, by link; null when the site has none that loads.
const icons = new Map<string, string | null>();
const asked = new Set<string>();

export const SmartLinks = Extension.create<SmartLinkOptions>({
  name: "smartLinks",

  addOptions() {
    return { fetch: async () => null, open: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    const build = (doc: PMNode) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        if (node.type.spec.code) return false;
        const cards: string[] = [];
        // Runs of text under one link: a link can be several text nodes when
        // part of it is bold, and the chip wraps them all.
        let run: { link: Mark; parts: [number, number][] } | null = null;
        const flush = () => {
          if (!run) return;
          const href = String(run.link.attrs.href);
          const view = viewOf(run.link);
          if (view === "inline" || view === "card" || view === "embed") {
            const icon = icons.get(href);
            run.parts.forEach(([from, to], i) => {
              const cls = ["smart-link", i === 0 && "smart-first", i === run!.parts.length - 1 && "smart-last", !icon && "smart-generic"].filter(Boolean).join(" ");
              decos.push(Decoration.inline(from, to, { class: cls, ...(icon ? { style: `--smart-icon: url("${icon.replace(/"/g, "%22")}")` } : {}) }));
            });
            if (view === "card" && !cards.includes(href)) cards.push(href);
          }
          run = null;
        };
        node.forEach((child, offset) => {
          const from = pos + 1 + offset;
          const link = child.isText ? child.marks.find((m) => m.type.name === "link" && /^https?:\/\//i.test(String(m.attrs.href))) : undefined;
          if (link && run && run.link.eq(link)) run.parts.push([from, from + child.nodeSize]);
          else {
            flush();
            if (link) run = { link, parts: [[from, from + child.nodeSize]] };
          }
        });
        flush();
        for (const href of cards) {
          decos.push(Decoration.widget(pos + node.nodeSize, () => card(href, options), { side: 1, key: `card:${href}`, ignoreSelection: true }));
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
        // The site icons for smart links, looked up once each.
        view: (view) => {
          const lookUp = () => {
            view.state.doc.descendants((node) => {
              const link = node.isText ? node.marks.find((m) => m.type.name === "link") : undefined;
              const shown = link ? viewOf(link) : null;
              if (!link || !shown || shown === "url") return;
              const href = String(link.attrs.href);
              if (asked.has(href) || !/^https?:\/\//i.test(href)) return;
              asked.add(href);
              void previewFor(href, options.fetch).then((p) => loadIcon(p?.icon || fallbackIcon(href))).then((icon) => {
                icons.set(href, icon);
                if (icon && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, true));
              });
            });
          };
          lookUp();
          return { update: lookUp };
        },
      }),
    ];
  },
});

// The site's /favicon.ico, when the page didn't name an icon.
function fallbackIcon(href: string): string {
  try {
    return new URL("/favicon.ico", href).toString();
  } catch {
    return "";
  }
}

// Only an icon that actually loads is used, so a chip never shows a broken image.
function loadIcon(src: string): Promise<string | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth > 0 ? src : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The card beneath a line, for a link shown as a card.
function card(url: string, options: SmartLinkOptions): HTMLElement {
  const el = document.createElement("div");
  el.className = "link-card";
  el.contentEditable = "false";
  el.innerHTML = `<div class="link-card-body"><div class="link-card-title"></div><div class="link-card-desc"></div><div class="link-card-site"></div></div>`;
  const title = el.querySelector(".link-card-title") as HTMLElement;
  const desc = el.querySelector(".link-card-desc") as HTMLElement;
  const site = el.querySelector(".link-card-site") as HTMLElement;
  title.textContent = hostOf(url);
  site.textContent = url;
  desc.hidden = true;
  el.title = url;
  el.addEventListener("click", (e) => {
    e.preventDefault();
    options.open(url);
  });
  void previewFor(url, options.fetch).then((preview) => {
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
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
