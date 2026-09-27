import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Mark, Node as PMNode } from "@tiptap/pm/model";
import { viewOf } from "./smartLinks";

export interface VideoEmbedOptions {
  // Settings → Notes → YouTube videos, read live.
  enabled: () => boolean;
}

const key = new PluginKey("videoEmbeds");

// A YouTube link shown as Embed (smartLinks.ts) plays right in the note, in a
// player beneath its line. So does one on a line of its own that has no view
// chosen yet, while Settings → Notes → YouTube videos is on. The player is a
// decoration: the note keeps saving the link, so it reads the same in any
// other app.
export const VideoEmbeds = Extension.create<VideoEmbedOptions>({
  name: "videoEmbeds",

  addOptions() {
    return { enabled: () => true };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    const build = (doc: PMNode) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (!node.isTextblock) return true;
        if (node.type.spec.code) return false;
        const players: string[] = [];
        node.forEach((child) => {
          const link = child.isText ? child.marks.find((m) => m.type.name === "link") : undefined;
          const embed = link && viewOf(link) === "embed" ? youTubeEmbed(String(link.attrs.href)) : null;
          if (embed && !players.includes(embed)) players.push(embed);
        });
        if (!players.length && node.type.name === "paragraph" && options.enabled()) {
          const link = soleLink(node);
          const embed = link && !viewOf(link) ? youTubeEmbed(String(link.attrs.href)) : null;
          if (embed) players.push(embed);
        }
        for (const embed of players) {
          // Keyed by the address, so typing elsewhere keeps the same player
          // (and whatever it's playing) rather than loading it again.
          decos.push(Decoration.widget(pos + node.nodeSize, () => player(embed), { side: 1, key: `video:${embed}`, ignoreSelection: true, stopEvent: () => true }));
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

// Show or hide the players after the setting changes.
export function refreshVideoEmbeds(view: EditorView) {
  view.dispatch(view.state.tr.setMeta(key, true));
}

// The link, when a line is nothing but one link.
function soleLink(node: PMNode): Mark | null {
  let found: Mark | null = null;
  let only = node.childCount > 0;
  node.forEach((child) => {
    if (!only) return;
    if (child.isText && !child.text!.trim()) return;
    const link = child.marks.find((m) => m.type.name === "link");
    if (!child.isText || !link || (found && link.attrs.href !== found.attrs.href) || child.marks.some((m) => m.type.name === "code")) only = false;
    else found = link;
  });
  return only ? found : null;
}

// The player's address for a YouTube video, Short, live stream or playlist
// link, with the start time if the link has one. Null for anything else.
export function youTubeEmbed(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const id = /^[\w-]{11}$/;
  let video: string | null = null;
  if (host === "youtu.be") video = url.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, first, second] = url.pathname.split("/");
    if (first === "watch") video = url.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(first)) video = second ?? null;
    else if (first === "playlist" && url.searchParams.get("list")) {
      return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(url.searchParams.get("list")!)}&rel=0`;
    }
  } else return null;
  if (!video || !id.test(video)) return null;
  const params = new URLSearchParams({ rel: "0" });
  const list = url.searchParams.get("list");
  if (list) params.set("list", list);
  const start = seconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
  if (start) params.set("start", String(start));
  return `https://www.youtube-nocookie.com/embed/${video}?${params}`;
}

// "90", "90s", "1m30s" or "1h2m3s" as seconds.
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+s?$/.test(t)) return parseInt(t, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? (Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0) : 0;
}

function player(src: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "video-embed";
  el.contentEditable = "false";
  const frame = document.createElement("iframe");
  frame.src = src;
  frame.title = "YouTube video";
  frame.loading = "lazy";
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  frame.allowFullscreen = true;
  // YouTube refuses to play embeds that don't say which site they're on.
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  el.append(frame);
  return el;
}
