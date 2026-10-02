import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Apple, Car, Clock, Flag, Heart, Lightbulb, PawPrint, Search, Smile, Trophy, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { loadEmoji, nativeOf, recentEmoji, searchEmoji, type Emoji, type EmojiData } from "../lib/emoji";

// Every emoji, to pick from at the cursor (Ctrl+; or the / menu's Emoji), or
// for a note's icon.
// Checkpoint's emoji window, as a pop-over: search, jump by category, arrow
// keys and Enter, recently used first, and the skin tone.
const icons: Record<string, LucideIcon> = {
  recent: Clock,
  people: Smile,
  nature: PawPrint,
  foods: Apple,
  activity: Trophy,
  places: Car,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

const tones = [
  { name: "Default", color: "#FFC83D" },
  { name: "Light", color: "#F7DECE" },
  { name: "Medium-light", color: "#F3D2A2" },
  { name: "Medium", color: "#D5AB88" },
  { name: "Medium-dark", color: "#AF7E57" },
  { name: "Dark", color: "#7C533E" },
];

const COLUMNS = 8;
const WIDTH = 380;
const HEIGHT = 440;

interface Cell {
  native: string;
  emoji: Emoji | undefined;
}

interface Section {
  id: string;
  name: string;
  cells: Cell[];
}

interface Props {
  x: number;
  y: number;
  tone: number;
  onTone: (tone: number) => void;
  // The line at the bottom before one is pointed at.
  hint?: string;
  onPick: (native: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ x, y, tone, onTone, hint = "Pick as many as you like.", onPick, onClose }: Props) {
  const [data, setData] = useState<EmojiData | null>(null);
  const [recents, setRecents] = useState<string[]>(() => recentEmoji());
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState<Cell | null>(null);
  const [focus, setFocus] = useState(-1);
  const [active, setActive] = useState("recent");
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useEffect(() => void loadEmoji().then(setData), []);

  // Below the cursor, kept inside the window (above the line when it won't fit).
  useLayoutEffect(() => {
    const left = Math.max(8, Math.min(x, window.innerWidth - WIDTH - 8));
    const top = y + HEIGHT > window.innerHeight - 8 ? Math.max(8, y - HEIGHT - 28) : y;
    setPos({ left, top });
  }, [x, y]);

  // Clicking anywhere else closes it.
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", down, true);
    return () => document.removeEventListener("mousedown", down, true);
  }, [onClose]);

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const cell = (e: Emoji): Cell => ({ native: nativeOf(e, tone), emoji: e });
    if (query.trim()) return [{ id: "results", name: "Results", cells: searchEmoji(data, query, 240).map(cell) }];
    const recent: Section[] = recents.length ? [{ id: "recent", name: "Recently used", cells: recents.map((native) => ({ native, emoji: data.byNative.get(native) })) }] : [];
    return [...recent, ...data.categories.map((c) => ({ id: c.id, name: c.name, cells: c.emojis.map(cell) }))];
  }, [data, query, recents, tone]);

  const flat = useMemo(() => sections.flatMap((s) => s.cells), [sections]);

  useEffect(() => setFocus(query.trim() ? 0 : -1), [query]);

  useEffect(() => {
    if (focus < 0) return;
    scroller.current?.querySelector(`[data-index="${focus}"]`)?.scrollIntoView({ block: "nearest" });
    setHover(flat[focus] ?? null);
  }, [focus, flat]);

  const pick = (cell: Cell) => {
    onPick(cell.native);
    setRecents((r) => [cell.native, ...r.filter((n) => n !== cell.native)].slice(0, 32));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const move = (d: number) => {
      e.preventDefault();
      setFocus((f) => Math.max(0, Math.min(flat.length - 1, f < 0 ? 0 : f + d)));
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery("");
      else onClose();
    } else if (e.key === "ArrowRight") move(1);
    else if (e.key === "ArrowLeft") move(-1);
    else if (e.key === "ArrowDown") move(COLUMNS);
    else if (e.key === "ArrowUp") move(-COLUMNS);
    else if (e.key === "Enter" && flat[focus]) {
      e.preventDefault();
      pick(flat[focus]);
    }
  };

  // The tab for whichever section is at the top of the list.
  const onScroll = () => {
    const box = scroller.current;
    if (!box || query.trim()) return;
    let current = sections[0]?.id ?? "";
    for (const s of sections) {
      const el = box.querySelector<HTMLElement>(`[data-section="${s.id}"]`);
      if (el && el.offsetTop - box.offsetTop <= box.scrollTop + 4) current = s.id;
    }
    setActive(current);
  };

  const jump = (id: string) => {
    setQuery("");
    requestAnimationFrame(() => {
      const box = scroller.current;
      const el = box?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (box && el) box.scrollTop = el.offsetTop - box.offsetTop;
      setActive(id);
    });
  };

  let index = -1;
  return createPortal(
    <div
      ref={panel}
      data-menu
      role="dialog"
      aria-label="Emoji"
      className="menu-drop fixed z-50 flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel text-13 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      style={{ ...pos, width: WIDTH, height: HEIGHT }}
      onKeyDown={onKey}
    >
      <div className="flex flex-col gap-2 p-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-[12px] border border-line bg-bg px-3 text-muted focus-within:border-accent">
          <Search size={15} />
          <input
            ref={search}
            autoFocus
            className="w-full border-0 bg-transparent text-text outline-none placeholder:text-muted"
            placeholder="Search emoji"
            aria-label="Search emoji"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="flex justify-between">
          {["recent", ...(data?.categories.map((c) => c.id) ?? [])].map((id) => {
            const Icon = icons[id] ?? Smile;
            const disabled = id === "recent" && recents.length === 0;
            const name = id === "recent" ? "Recently used" : (data?.categories.find((c) => c.id === id)?.name ?? id);
            return (
              <button
                key={id}
                disabled={disabled}
                title={name}
                aria-label={name}
                className={clsx(
                  "flex h-8 w-9 items-center justify-center rounded-[9px] disabled:opacity-30",
                  !query.trim() && active === id ? "bg-accent-soft text-accent" : "text-muted hover:bg-panel2 hover:text-text",
                )}
                onClick={() => jump(id)}
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto border-y border-line px-3 pb-2" onScroll={onScroll}>
        {!data && <div className="p-4 text-center text-muted">Loading emoji…</div>}
        {sections.map((s) => (
          <div key={s.id} data-section={s.id}>
            <div className="sticky top-0 z-10 bg-panel pt-2 pb-1 font-mono text-11 tracking-[0.12em] text-muted uppercase">{s.name}</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${COLUMNS}, minmax(0, 1fr))` }}>
              {s.cells.map((cell) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={`${s.id}:${cell.native}`}
                    data-index={i}
                    className={clsx("flex aspect-square items-center justify-center rounded-[9px] leading-none hover:bg-panel2", focus === i && "bg-accent-soft ring-1 ring-accent")}
                    style={{ fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Segoe UI Symbol", sans-serif', fontSize: 26 }}
                    title={cell.emoji ? `${cell.emoji.name}  :${cell.emoji.id}:` : cell.native}
                    onMouseEnter={() => setHover(cell)}
                    onClick={() => {
                      setFocus(i);
                      pick(cell);
                      search.current?.focus();
                    }}
                  >
                    {cell.native}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {data && sections.length === 1 && sections[0].cells.length === 0 && <div className="p-4 text-center text-muted">No emoji match “{query}”.</div>}
      </div>

      <div className="flex h-14 shrink-0 items-center gap-2.5 px-3">
        {hover ? (
          <>
            <span className="text-[30px] leading-none" style={{ fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", sans-serif' }}>
              {hover.native}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{hover.emoji?.name ?? ""}</span>
              {hover.emoji && <span className="block truncate font-mono text-11 text-muted">:{hover.emoji.id}:</span>}
            </span>
          </>
        ) : (
          <span className="flex-1 text-muted">{hint}</span>
        )}
        <div className="flex shrink-0 items-center gap-1" role="radiogroup" aria-label="Skin tone">
          {tones.map((t, i) => (
            <button
              key={t.name}
              role="radio"
              aria-checked={tone === i}
              title={`${t.name} skin tone`}
              aria-label={`${t.name} skin tone`}
              className={clsx("relative h-5 w-5 rounded-full border-2", tone === i ? "border-text" : "border-transparent")}
              style={{ background: t.color }}
              onClick={() => onTone(i)}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
