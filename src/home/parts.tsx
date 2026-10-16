import { EyeOff, LayoutGrid } from "lucide-react";
import clsx from "clsx";
import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type Ref, type RefObject } from "react";
import { menuPoint, type MenuItem } from "../components/ContextMenu";
import { clockText } from "../lib/format";
import { currentSettings } from "../lib/settings";
import { useSettings } from "../lib/SettingsContext";
import { useNotes } from "../notes/NotesContext";
import { useLayoutMenu } from "./HomeGrid";
import { toast } from "../ui/Toast";

interface CardProps {
  className?: string;
  style?: CSSProperties;
  label?: string;
  // Settings → Home screen's id for the card: right-clicking it offers its
  // own items (menu), then Hide this card.
  id?: string;
  menu?: MenuItem[];
  // For a card that measures itself (useCardSize).
  ref?: Ref<HTMLElement>;
  children: ReactNode;
}

// What a card itself offers: Size and Move (HomeGrid.tsx), then Hide.
function useCardItems(id: string | undefined, label: string | undefined): () => MenuItem[] {
  const { update } = useSettings();
  const layout = useLayoutMenu();
  return () => {
    if (!id) return [];
    const hide: MenuItem = {
      label: "Hide this card",
      icon: <EyeOff size={13} />,
      onSelect: () => {
        const hidden = currentSettings().HiddenCards ?? [];
        update({ HiddenCards: [...hidden.filter((x) => x !== id), id] });
        toast(label ? `Hid the ${label} card` : "Hid the card", () =>
          update({ HiddenCards: (currentSettings().HiddenCards ?? []).filter((x) => x !== id) }),
        );
      },
    };
    const place = layout?.itemsFor(id) ?? [];
    return place.length ? [...place, { type: "separator" }, hide] : [hide];
  };
}

// For the rows inside a card (a task, a habit, a headline): opens the row's
// own menu with the card's items at the end, under Card ▸, so resizing and
// moving work from anywhere on a card, not just its edges and header.
export function useRowMenu(id: string, label: string) {
  const { openMenu } = useNotes();
  const cardItems = useCardItems(id, label);
  return (x: number, y: number, items: MenuItem[]) => {
    const card = cardItems();
    openMenu(x, y, card.length ? [...items, { type: "separator" }, { label: "Card", icon: <LayoutGrid size={13} />, children: card }] : items);
  };
}

// A Home card: panel, 1px line border, radius 24 (DESIGN.md §4). The grid
// cell around it is a container (HomeGrid), so the card and what's inside
// can change with its width (@[19rem]:…).
export function Card({ className, style, label, id, menu, ref, children }: CardProps) {
  const { openMenu } = useNotes();
  const cardItems = useCardItems(id, label);

  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    // Rows with menus of their own stop the event; text boxes keep the app's
    // edit menu, and popups portalled out of the card aren't part of it.
    if (!id || e.defaultPrevented || !e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as Element).closest("input, textarea")) return;
    e.preventDefault();
    const { x, y } = menuPoint(e);
    openMenu(x, y, [...(menu?.length ? [...menu, { type: "separator" } as MenuItem] : []), ...cardItems()]);
  };

  return (
    <section
      ref={ref}
      aria-label={label}
      onContextMenu={onContextMenu}
      className={clsx("flex min-h-0 flex-col rounded-[24px] border border-line bg-panel tiny:gap-2! tiny:rounded-[20px] tiny:p-4! micro:gap-1.5! micro:rounded-[16px] micro:p-3!", className)}
      style={style}
    >
      {children}
    </section>
  );
}

// A card's own size, for the ones whose content is laid out by measuring
// (Up next, Today). Zero until it's first drawn.
export function useCardSize(): [RefObject<HTMLElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((s) => (s.width === el.offsetWidth && s.height === el.offsetHeight ? s : { width: el.offsetWidth, height: el.offsetHeight }));
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, size];
}

// The same sizes the tiny and micro variants go by (index.css), for those cards.
export const isTiny = (s: { width: number; height: number }) => s.width < 208 || s.height < 160;
export const isMicro = (s: { width: number; height: number }) => s.width < 144 || s.height < 144;

// What a card shows when it's small (tiny: too narrow or too short for its
// usual content): one headline and a line or two under it, down to a title
// and a number at 100 × 100. It starts at the top, under the card's title,
// however tall the card is. Hidden on bigger cards; the usual content is
// `hidden roomy:flex` in its place.
export function Tiny({ value, size = "lg", color, children }: { value?: ReactNode; size?: "lg" | "md"; color?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden roomy:hidden">
      {value != null && (
        <div className={clsx("truncate font-head leading-none font-bold tracking-[-0.02em]", size === "lg" ? "text-28 micro:text-22" : "text-18")} style={color ? { color } : undefined}>
          {value}
        </div>
      )}
      {children != null && <div className={clsx("text-12 leading-[1.35] text-muted", value != null ? "line-clamp-2 micro:line-clamp-1" : "line-clamp-3 micro:line-clamp-2")}>{children}</div>}
    </div>
  );
}

// "Schedule" on the left, a link or count on the right.
export function CardHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="m-0 truncate text-16 font-semibold tiny:text-14">{title}</h2>
      {/* The smallest squares keep the title; the link or count is in the card's menu or below. */}
      {children && <span className="hidden shrink-0 items-center whitespace-nowrap roomy:flex">{children}</span>}
    </div>
  );
}

// The small text links in card headers: "View week", "All notes".
export function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-13 text-muted hover:text-text hover:underline">
      {children}
    </button>
  );
}

// What a card says while it has nothing to show.
export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("m-0 text-13 leading-[1.5] text-muted", className)}>{children}</p>;
}

// "9:30 AM"
export function clock(d: Date): string {
  return clockText(d);
}

// "5:00 – 5:45 PM", or "11:30 AM – 12:30 PM" across noon.
export function clockRange(start: Date, end: Date): string {
  const a = clock(start);
  const b = clock(end);
  const same = a.slice(-2) === b.slice(-2);
  return `${same ? a.slice(0, -3) : a} – ${b}`;
}
