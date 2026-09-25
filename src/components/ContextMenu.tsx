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
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={onClose} />;
}

// Every menu and submenu unrolls downward as it opens, its rows following one
// after another (index.css: .menu-drop). Settings → Accessibility → Animations
// turns that off with the rest of the app's motion.
function MenuList({ items, x, y, onClose }: { items: MenuItem[]; x: number; y: number; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<{ index: number; x: number; y: number } | null>(null);

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  const open = sub && items[sub.index];
  return createPortal(
    <div
      ref={ref}
      data-menu
      className="menu-drop fixed z-50 min-w-[230px] rounded-[16px] border border-line p-1.5 text-13 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      style={{ left: pos.x, top: pos.y, background: "var(--menu)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        item.type === "separator" ? (
          <div key={i} className="menu-drop-row mx-2 my-1.5 h-px bg-line" style={{ "--row": i } as React.CSSProperties} />
        ) : (
          <div
            key={i}
            style={{ "--row": i } as React.CSSProperties}
            className={clsx(
              "menu-drop-row flex h-9 cursor-default items-center gap-2.5 rounded-[10px] px-2.5",
              item.disabled ? "text-faint" : "hover:bg-panel2",
              item.danger && !item.disabled && "text-danger",
              sub?.index === i && "bg-panel2",
            )}
            onMouseEnter={(e) => {
              if (item.children) {
                const r = e.currentTarget.getBoundingClientRect();
                setSub({ index: i, x: r.right + 4, y: r.top - 7 });
              } else setSub(null);
            }}
            onClick={() => {
              if (item.disabled || item.children) return;
              item.onSelect?.();
              onClose();
            }}
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
        <MenuList items={open.children} x={sub.x} y={sub.y} onClose={onClose} />
      )}
    </div>,
    document.body,
  );
}
