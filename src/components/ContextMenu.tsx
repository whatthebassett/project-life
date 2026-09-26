import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import clsx from "clsx";

export type MenuItem =
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      children?: MenuItem[];
      onSelect?: () => void;
    }
  | { type: "separator" };

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

interface Props {
  menu: MenuState | null;
  onClose: () => void;
}

// A compact right-click menu with hover submenus. Rendered into <body> so it
// sits above everything and is never clipped by a scrolling list.
export default function ContextMenu({ menu, onClose }: Props) {
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => {
      if (!(e.target as Element).closest("[data-menu]")) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [menu, onClose]);

  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={onClose} top />;
}

// Every menu and submenu unrolls downward as it opens, its rows following one
// after another (index.css: .menu-drop). Settings → Accessibility → Animations
// turns that off with the rest of the app's motion.
//
// The keyboard works it too: focus starts on the first item, Up and Down (Home,
// End) move, Enter or Space picks, Right opens a submenu and Left goes back,
// and Esc or Tab closes; focus then goes back where it was.
function MenuList({
  items,
  x,
  y,
  onClose,
  onBack,
  top,
  focusFirst,
}: {
  items: MenuItem[];
  x: number;
  y: number;
  onClose: () => void;
  // A submenu: Left goes back to its row.
  onBack?: () => void;
  top?: boolean;
  // A submenu opened by hovering keeps focus on its row.
  focusFirst?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<{ index: number; x: number; y: number; focus: boolean } | null>(null);
  // What had focus before the menu opened, noted on the first render.
  const opener = useRef<Element | null | undefined>(undefined);
  if (top && opener.current === undefined) opener.current = document.activeElement;

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  const usable = items.map((item, i) => (item.type !== "separator" && !item.disabled ? i : -1)).filter((i) => i >= 0);
  const focusRow = (i: number | undefined) => i !== undefined && rows.current[i]?.focus();

  // Opened from the keyboard or not, the first item takes focus; closing
  // gives it back, unless something else (a pop-up the item opened) has it.
  useEffect(() => {
    // A dropdown starts on its current choice.
    if (top || focusFirst) focusRow(usable.find((i) => items[i].type !== "separator" && items[i].checked) ?? usable[0]);
    const before = opener.current;
    const box = ref.current;
    return () => {
      if (!top) return;
      setTimeout(() => {
        const now = document.activeElement;
        if (box?.isConnected || !(before instanceof HTMLElement) || !before.isConnected) return;
        if (!now || now === document.body) before.focus();
      });
    };
    // Only when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSub = (i: number, el: HTMLElement, focus: boolean) => {
    const r = el.getBoundingClientRect();
    setSub({ index: i, x: r.right + 4, y: r.top - 7, focus });
  };

  const pick = (item: MenuItem, i: number, el: HTMLElement) => {
    if (item.type === "separator" || item.disabled) return;
    if (item.children) return openSub(i, el, true);
    item.onSelect?.();
    onClose();
  };

  const onKey = (e: React.KeyboardEvent<HTMLDivElement>, i: number) => {
    const item = items[i];
    const at = usable.indexOf(i);
    const step = (by: number) => focusRow(usable[(at + by + usable.length) % usable.length]);
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === "ArrowDown") (handled(), step(1));
    else if (e.key === "ArrowUp") (handled(), step(-1));
    else if (e.key === "Home") (handled(), focusRow(usable[0]));
    else if (e.key === "End") (handled(), focusRow(usable[usable.length - 1]));
    else if (e.key === "Enter" || e.key === " ") (handled(), pick(item, i, e.currentTarget));
    else if (e.key === "ArrowRight" && item.type !== "separator" && item.children) (handled(), openSub(i, e.currentTarget, true));
    else if (e.key === "ArrowLeft" && onBack) (handled(), onBack());
    else if (e.key === "Tab") (handled(), onClose());
  };

  const open = sub && items[sub.index];
  return createPortal(
    <div
      ref={ref}
      data-menu
      role="menu"
      className="menu-drop fixed z-50 min-w-[230px] rounded-[16px] border border-line p-1.5 text-13 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      style={{ left: pos.x, top: pos.y, background: "var(--menu)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={i} role="separator" className="menu-drop-row mx-2 my-1.5 h-px bg-line" style={{ "--row": i } as React.CSSProperties} />
        ) : (
          <div
            key={i}
            ref={(el) => {
              rows.current[i] = el;
            }}
            role={item.checked !== undefined ? "menuitemcheckbox" : "menuitem"}
            aria-checked={item.checked !== undefined ? item.checked : undefined}
            aria-disabled={item.disabled || undefined}
            aria-haspopup={item.children ? "menu" : undefined}
            aria-expanded={item.children ? sub?.index === i : undefined}
            tabIndex={-1}
            style={{ "--row": i } as React.CSSProperties}
            className={clsx(
              "menu-drop-row flex h-9 cursor-default items-center gap-2.5 rounded-[10px] px-2.5 outline-none",
              item.disabled ? "text-faint" : "hover:bg-panel2 focus-visible:bg-panel2",
              item.danger && !item.disabled && "text-danger",
              sub?.index === i && "bg-panel2",
            )}
            onMouseEnter={(e) => {
              if (!item.disabled) e.currentTarget.focus();
              if (item.children) openSub(i, e.currentTarget, false);
              else setSub(null);
            }}
            onKeyDown={(e) => onKey(e, i)}
            onClick={(e) => pick(item, i, e.currentTarget)}
          >
            {/* The item's icon; a checked item without one shows the check here instead. */}
            <span className={clsx("menu-icon flex w-[18px] shrink-0 items-center justify-center", !(item.danger && !item.disabled) && "text-muted")}>
              {item.icon ?? (item.checked ? <Check size={15} className="text-accent-text" /> : null)}
            </span>
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            {item.hint && <span className="pl-5 font-mono text-11 text-muted">{item.hint}</span>}
            {item.checked && item.icon && <Check size={14} className="ml-1 shrink-0 text-accent-text" />}
            {item.children && <ChevronRight size={14} className="text-muted" />}
          </div>
        ),
      )}
      {open && open.type !== "separator" && open.children && (
        <MenuList
          key={sub.index}
          items={open.children}
          x={sub.x}
          y={sub.y}
          onClose={onClose}
          onBack={() => {
            const at = sub.index;
            setSub(null);
            focusRow(at);
          }}
          focusFirst={sub.focus}
        />
      )}
    </div>,
    document.body,
  );
}
