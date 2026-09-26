import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink } from "lucide-react";
import { api, openUrl } from "../lib/api";
import { previewFor, type LinkPreview } from "../editor/linkPreviews";
import { toast } from "../ui/Toast";

interface Props {
  // The editor's own element; links inside it get the card.
  root: HTMLElement | null;
  // Settings → Notes → Link previews.
  enabled: boolean;
}

interface Hover {
  url: string;
  // The line of the link the pointer is on, so a wrapped link's card sits
  // under the part you're pointing at.
  rect: DOMRect;
}

const SHOW_MS = 400;
const HIDE_MS = 250;
const WIDTH = 340;

// Point at a web link in a note for a moment and a card comes up with the
// page's picture, title and description, and buttons to copy the link or open
// it in the browser. Moving onto the card keeps it open.
export default function LinkHoverCard({ root, enabled }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);
  const [preview, setPreview] = useState<{ url: string; data: LinkPreview | null } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const showTimer = useRef(0);
  const hideTimer = useRef(0);

  const hideSoon = () => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHover(null), HIDE_MS);
  };
  const stay = () => window.clearTimeout(hideTimer.current);

  useEffect(() => {
    if (!root || !enabled) {
      setHover(null);
      return;
    }
    const linkAt = (target: EventTarget | null) => {
      const a = (target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      return a && root.contains(a) && /^https?:\/\//i.test(a.getAttribute("href") ?? "") ? a : null;
    };
    const over = (e: MouseEvent) => {
      const a = linkAt(e.target);
      if (!a) return;
      stay();
      window.clearTimeout(showTimer.current);
      const url = a.getAttribute("href")!;
      const rects = Array.from(a.getClientRects());
      const rect = rects.find((r) => e.clientY >= r.top && e.clientY <= r.bottom) ?? rects[0] ?? a.getBoundingClientRect();
      showTimer.current = window.setTimeout(() => setHover({ url, rect }), SHOW_MS);
    };
    const out = (e: MouseEvent) => {
      const a = linkAt(e.target);
      if (!a || a.contains(e.relatedTarget as Node | null)) return;
      window.clearTimeout(showTimer.current);
      hideSoon();
    };
    const hideNow = () => {
      window.clearTimeout(showTimer.current);
      window.clearTimeout(hideTimer.current);
      setHover(null);
    };
    const onScroll = (e: Event) => {
      if (!card.current?.contains(e.target as Node)) hideNow();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || !card.current?.contains(e.target as Node)) hideNow();
    };
    root.addEventListener("mouseover", over);
    root.addEventListener("mouseout", out);
    root.addEventListener("mousedown", hideNow);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", hideNow);
    window.addEventListener("resize", hideNow);
    return () => {
      hideNow();
      root.removeEventListener("mouseover", over);
      root.removeEventListener("mouseout", out);
      root.removeEventListener("mousedown", hideNow);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", hideNow);
      window.removeEventListener("resize", hideNow);
    };
  }, [root, enabled]);

  // The page's details, fetched once per link and shared with LinkTitles.
  useEffect(() => {
    if (!hover) return;
    let live = true;
    void previewFor(hover.url, api.fetchLinkPreview).then((data) => {
      if (live) setPreview({ url: hover.url, data });
    });
    return () => {
      live = false;
    };
  }, [hover?.url]);

  // Under the link, or above it when there's no room below; kept on screen.
  useLayoutEffect(() => {
    if (!hover || !card.current) {
      setPos(null);
      return;
    }
    const h = card.current.offsetHeight;
    const left = Math.max(8, Math.min(hover.rect.left, window.innerWidth - WIDTH - 8));
    const below = hover.rect.bottom + 6;
    const top = below + h > window.innerHeight - 8 ? Math.max(8, hover.rect.top - 6 - h) : below;
    setPos({ left, top });
  }, [hover, preview]);

  if (!hover) return null;
  const data = preview?.url === hover.url ? preview.data : undefined;
  const loading = data === undefined;
  const host = hostOf(hover.url);
  const done = () => {
    window.clearTimeout(hideTimer.current);
    setHover(null);
  };

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label={data?.title || host}
      className="fixed z-50 overflow-hidden rounded-[16px] border border-line text-13 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      style={{ width: WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? -9999, background: "var(--menu)" }}
      onMouseEnter={stay}
      onMouseLeave={hideSoon}
    >
      {data?.image && (
        <img
          src={data.image}
          alt=""
          className="block h-[150px] w-full border-b border-line object-cover"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      <div className="flex flex-col gap-1 px-4 pt-3.5 pb-3">
        <div className="truncate text-11 text-muted">{data?.site || host}</div>
        <div className="line-clamp-2 text-14 font-semibold">{data?.title || host}</div>
        {loading ? (
          <div className="text-muted">Loading details…</div>
        ) : data?.description ? (
          <div className="line-clamp-4 text-muted">{data.description}</div>
        ) : (
          <div className="truncate font-mono text-11 text-muted">{hover.url}</div>
        )}
      </div>
      <div className="flex gap-2 border-t border-line px-3 py-2.5">
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line px-3 font-medium hover:bg-panel2 focus-visible:bg-panel2"
          onClick={() => {
            const url = hover.url;
            done();
            void navigator.clipboard.writeText(url).then(
              () => toast("Copied the link"),
              () => toast("Couldn't copy the link"),
            );
          }}
        >
          <Copy size={14} className="text-muted" />
          Copy link
        </button>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-line px-3 font-medium hover:bg-panel2 focus-visible:bg-panel2"
          onClick={() => {
            const url = hover.url;
            done();
            void openUrl(url);
          }}
        >
          <ExternalLink size={14} className="text-muted" />
          Open in browser
        </button>
      </div>
    </div>,
    document.body,
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
