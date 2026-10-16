import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { Check, Copy, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { api, openUrl } from "../lib/api";
import { previewFor, type LinkPreview } from "../editor/linkPreviews";
import { linkSpanAtPos, setLinkView } from "../editor/linkTitles";
import type { LinkView } from "../editor/smartLinks";
import { youTubeEmbed } from "../editor/videoEmbeds";

interface Props {
  editor: Editor | null;
  // Settings → Notes → Link previews: pointing at a link also shows the
  // page's picture, title and description under the bar.
  previews: boolean;
}

// The link the bar is up for.
interface Target {
  url: string;
  // Where the bar hangs from: the line of the link the pointer is on (so a
  // wrapped link's bar sits under the part you're at), or the link's card.
  rect: DOMRect;
  // Where the link starts in the note, and how it shows now.
  from: number;
  view: LinkView | null;
  // Clicked, so it stays until you click or type elsewhere. Pointed at, it
  // goes when the pointer leaves.
  pinned: boolean;
  // Up for a link's card, which already shows the page's details.
  card: boolean;
}

const views: { id: LinkView; label: string }[] = [
  { id: "url", label: "URL" },
  { id: "inline", label: "Inline" },
  { id: "card", label: "Card" },
  { id: "embed", label: "Embed" },
];

const modifierKeys = new Set(["Control", "Alt", "AltGraph", "Shift", "Meta", "CapsLock"]);

const SHOW_MS = 400;
const HIDE_MS = 250;
const PREVIEW_WIDTH = 340;

// Click a web link in a note, or point at it for a moment, and a bar comes up
// beside it: show the link as its address, an inline chip, a card or (for
// YouTube) a video, open the page in the browser, or copy the link. Clicking
// a link never opens it by itself. With Link previews on, pointing at a link
// shows the page's picture, title and description under the bar too.
export default function LinkBar({ editor, previews }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const [preview, setPreview] = useState<{ url: string; data: LinkPreview | null } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const showTimer = useRef(0);
  const hideTimer = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  const hideSoon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setTarget((t) => (t?.pinned ? t : null)), HIDE_MS);
  };
  const stay = () => window.clearTimeout(hideTimer.current);
  const close = () => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    setTarget(null);
  };

  useEffect(() => {
    if (!editor) return;
    const root = editor.view.dom;

    // The link under the pointer: the link itself, or the card beneath its line.
    const linkAt = (at: EventTarget | null): { a: HTMLAnchorElement; card: HTMLElement | null } | null => {
      const el = at as Element | null;
      const card = (el?.closest?.(".link-card[data-href]") as HTMLElement | null) ?? null;
      const a = card ? linkOf(card) : (el?.closest?.("a[href]") as HTMLAnchorElement | null);
      return a && root.contains(a) && /^https?:\/\//i.test(a.getAttribute("href") ?? "") ? { a, card } : null;
    };
    const targetFor = (found: { a: HTMLAnchorElement; card: HTMLElement | null }, y: number, pinned: boolean): Target | null => {
      const url = found.a.getAttribute("href")!;
      let from: number;
      try {
        from = editor.view.posAtDOM(found.a, 0);
      } catch {
        return null;
      }
      const span = linkSpanAtPos(editor.view, from, url);
      if (!span) return null;
      const rects = Array.from(found.a.getClientRects());
      const rect = found.card ? found.card.getBoundingClientRect() : (rects.find((r) => y >= r.top && y <= r.bottom) ?? rects[0] ?? found.a.getBoundingClientRect());
      return { url, rect, from: span.from, view: span.view, pinned, card: Boolean(found.card) };
    };

    const over = (e: MouseEvent) => {
      const found = linkAt(e.target);
      if (!found) return;
      stay();
      window.clearTimeout(showTimer.current);
      const next = targetFor(found, e.clientY, false);
      // Already up for this link, clicked or not: leave it be.
      if (!next || targetRef.current?.from === next.from) return;
      showTimer.current = window.setTimeout(() => setTarget(next), SHOW_MS);
    };
    const out = (e: MouseEvent) => {
      const found = linkAt(e.target);
      if (!found || (found.card ?? found.a).contains(e.relatedTarget as Node | null)) return;
      window.clearTimeout(showTimer.current);
      hideSoon();
    };
    // A plain click on a link brings the bar up at once and keeps it there.
    // Ctrl+click opens the page (VisualEditor), and dragging across a link
    // is selecting text.
    const click = (e: MouseEvent) => {
      const found = linkAt(e.target);
      if (!found || e.button !== 0 || e.ctrlKey || e.metaKey || !window.getSelection()?.isCollapsed) return;
      const next = targetFor(found, e.clientY, true);
      if (!next) return;
      window.clearTimeout(showTimer.current);
      stay();
      setTarget(next);
    };
    // Pressing anywhere else puts it away.
    const down = (e: MouseEvent) => {
      if (box.current?.contains(e.target as Node)) return;
      window.clearTimeout(showTimer.current);
      if (!linkAt(e.target)) close();
    };
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) close();
    };
    // Holding Ctrl (to Ctrl+click the link), Alt or Shift leaves it up;
    // other keys mean you're typing again.
    const onKey = (e: KeyboardEvent) => {
      if (modifierKeys.has(e.key)) return;
      if (e.key === "Escape" || !box.current?.contains(e.target as Node)) close();
    };
    root.addEventListener("mouseover", over);
    root.addEventListener("mouseout", out);
    root.addEventListener("click", click);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      close();
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseout", out);
      root.removeEventListener("click", click);
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [editor]);

  // The page's details show when you point at a link, not when you click it
  // (you're busy with the link then), and not for a card, which shows them.
  const detailed = Boolean(target && previews && !target.pinned && !target.card);

  // Fetched once per link and shared with link titles.
  useEffect(() => {
    if (!target) return;
    setCopied(false);
    if (!detailed) return;
    let live = true;
    void previewFor(target.url, api.fetchLinkPreview).then((data) => {
      if (live) setPreview({ url: target.url, data });
    });
    return () => {
      live = false;
    };
  }, [target?.url, target?.from, detailed]);

  // Under the link, or above it when there's no room below; kept on screen.
  useLayoutEffect(() => {
    if (!target || !box.current) {
      setPos(null);
      return;
    }
    const { offsetWidth: w, offsetHeight: h } = box.current;
    const left = Math.max(8, Math.min(target.rect.left, window.innerWidth - w - 8));
    const below = target.rect.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, target.rect.top - 6 - h) : below;
    setPos({ left, top });
  }, [target, preview, detailed]);

  if (!target || !editor) return null;
  const data = detailed && preview?.url === target.url ? preview.data : undefined;
  const host = hostOf(target.url);

  // Shows the link another way, then hangs the bar from wherever the link is
  // now: its text may have changed (an address for a title), and with it the
  // element it's drawn in. The note is redrawn by the time setLinkView returns.
  const show = (shown: LinkView) => {
    const span = linkSpanAtPos(editor.view, target.from, target.url);
    if (!span) return close();
    setLinkView(editor.view, span, shown);
    const now = linkSpanAtPos(editor.view, span.from, target.url);
    const at = now ? editor.view.domAtPos(now.from + 1).node : null;
    const a = (at instanceof Element ? at : at?.parentElement)?.closest("a[href]");
    if (!now || !a) return close();
    const card = shown === "card" ? cardOf(a, target.url) : null;
    setTarget({ ...target, rect: (card ?? a).getBoundingClientRect(), from: now.from, view: now.view, pinned: true, card: Boolean(card) });
  };

  const button = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-hover";

  return createPortal(
    <div
      ref={box}
      role="toolbar"
      aria-label="Link options"
      className="menu-drop fixed z-50 overflow-hidden rounded-lg border border-line text-[12.5px] shadow-xl"
      style={{ width: detailed ? PREVIEW_WIDTH : undefined, left: pos?.left ?? -9999, top: pos?.top ?? -9999, background: "var(--menu)" }}
      onMouseEnter={stay}
      onMouseLeave={hideSoon}
      // Its buttons act on the note, which keeps the keyboard and its selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-0.5 p-1">
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Display as">
          {views
            .filter((v) => v.id !== "embed" || youTubeEmbed(target.url))
            .map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={target.view === v.id}
                title={`Show as ${v.id === "url" ? "the address" : v.id === "embed" ? "a video" : v.id === "card" ? "a card" : "an inline link"}`}
                className={clsx(button, target.view === v.id ? "bg-active font-medium" : "text-muted hover:text-fg")}
                onClick={() => show(v.id)}
              >
                {v.label}
              </button>
            ))}
        </div>
        <div className="mx-1 h-4 w-px shrink-0 bg-[var(--line)]" />
        <button
          type="button"
          className={clsx(button, "font-medium")}
          title="Open the page in your browser (Ctrl+click)"
          onClick={() => {
            const url = target.url;
            close();
            void openUrl(url);
          }}
        >
          <ExternalLink size={14} className="text-muted" />
          Open
        </button>
        <button
          type="button"
          className={clsx(button, "ml-auto")}
          title="Copy link"
          aria-label="Copy link"
          onClick={() => {
            void navigator.clipboard.writeText(target.url).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? <Check size={14} className="text-accent-text" /> : <Copy size={14} className="text-muted" />}
        </button>
      </div>
      {detailed && (
        <div className="border-t border-line text-[13px]">
          {data?.image && (
            <img
              src={data.image}
              alt=""
              className="block h-[150px] w-full border-b border-line object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          <div className="flex flex-col gap-1 px-4 pt-3 pb-3">
            <div className="truncate text-[11.5px] text-muted">{data?.site || host}</div>
            <div className="line-clamp-2 text-[14px] font-semibold">{data?.title || host}</div>
            {data === undefined ? (
              <div className="text-muted">Loading details…</div>
            ) : data?.description ? (
              <div className="line-clamp-4 text-[12.5px] leading-snug text-muted">{data.description}</div>
            ) : (
              <div className="truncate font-mono text-[11.5px] text-muted">{target.url}</div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// A link's cards come straight after its line (smartLinks.ts), one for each
// link on the line that's shown as a card. So a card's link is in the line
// before the cards, and a link's card is among the ones after its line.
function linkOf(card: HTMLElement): HTMLAnchorElement | null {
  let line = card.previousElementSibling;
  while (line?.classList.contains("link-card")) line = line.previousElementSibling;
  return (Array.from(line?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []).find((a) => a.getAttribute("href") === card.dataset.href)) ?? null;
}

function cardOf(a: Element, url: string): HTMLElement | null {
  let next = a.closest("p, h1, h2, h3, h4, h5, h6")?.nextElementSibling as HTMLElement | null | undefined;
  for (; next?.classList.contains("link-card"); next = next.nextElementSibling as HTMLElement | null) {
    if (next.dataset.href === url) return next;
  }
  return null;
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
