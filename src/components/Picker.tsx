import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import clsx from "clsx";

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
  keywords?: string;
  style?: CSSProperties;
}

interface PopoverProps {
  anchor: DOMRect;
  options: PickerOption[];
  value?: string;
  placeholder?: string;
  // Offer the typed text itself when nothing matches exactly.
  allowCustom?: boolean;
  width?: number;
  onPick: (value: string) => void;
  onClose: () => void;
}

// A themed, searchable list that opens below an anchor. Type to filter,
// arrows and Enter to choose, Escape to close.
export function PickerPopover({ anchor, options, value, placeholder = "Search", allowCustom, width, onPick, onClose }: PopoverProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 4 });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hits = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q) || o.keywords?.toLowerCase().includes(q)) : options;
    if (allowCustom && q && !options.some((o) => o.value.toLowerCase() === q || o.label.toLowerCase() === q)) {
      return [...hits, { value: query.trim(), label: `Use "${query.trim()}"` }];
    }
    return hits;
  }, [options, query, allowCustom]);

  useEffect(() => {
    const at = filtered.findIndex((o) => o.value === value);
    setIndex(query ? 0 : Math.max(0, at));
  }, [query, filtered, value]);

  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = anchor.bottom + 4;
    const top = below + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - r.height - 4) : below;
    setPos({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - r.width - 8)), top });
  }, [anchor]);

  // Window capture runs before the dialog's own Escape handling.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    const down = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", key, true);
    document.addEventListener("mousedown", down, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.removeEventListener("mousedown", down, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={box}
      data-menu
      className="menu-drop fixed z-50 flex max-h-[320px] flex-col rounded-lg border border-line text-[12.5px] shadow-xl"
      style={{ left: pos.left, top: pos.top, width: width ?? Math.max(anchor.width, 220), background: "var(--menu)" }}
    >
      <div className="m-1 flex h-7 items-center gap-1.5 rounded-md bg-hover px-2">
        <Search size={13} className="text-muted" />
        <input
          autoFocus
          className="w-full bg-transparent outline-none placeholder:text-muted"
          style={{ caretColor: "auto" }}
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndex((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && filtered[index]) {
              e.preventDefault();
              onPick(filtered[index].value);
            }
          }}
        />
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1 pt-0">
        {filtered.map((o, i) => (
          <div
            key={o.value}
            style={{ "--row": i } as React.CSSProperties}
            className={clsx("menu-drop-row flex h-[26px] cursor-default items-center gap-2 rounded-md px-2", i === index && "bg-active")}
            onMouseEnter={() => setIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(o.value);
            }}
          >
            <span className="flex w-3.5 shrink-0 justify-center text-muted">{o.value === value && <Check size={12} />}</span>
            <span className="min-w-0 flex-1 truncate" style={o.style}>
              {o.label}
            </span>
            {o.hint && <span className="shrink-0 text-[11px] text-muted">{o.hint}</span>}
          </div>
        ))}
        {filtered.length === 0 && <div className="px-2 py-2 text-muted">No matches.</div>}
      </div>
    </div>,
    document.body,
  );
}

interface SelectProps {
  value: string;
  display?: ReactNode;
  options: PickerOption[];
  placeholder?: string;
  allowCustom?: boolean;
  onChange: (value: string) => void;
}

// A field that opens the picker, for Settings.
export function SearchSelect({ value, display, options, placeholder, allowCustom, onChange }: SelectProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button
        type="button"
        className="flex h-7 w-full items-center gap-2 rounded-md border border-line px-2 text-left hover:bg-hover"
        onClick={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        <span className="min-w-0 flex-1 truncate">{display ?? (value || <span className="text-muted">{placeholder}</span>)}</span>
        <ChevronDown size={13} className="shrink-0 text-muted" />
      </button>
      {anchor && (
        <PickerPopover
          anchor={anchor}
          options={options}
          value={value}
          placeholder={placeholder}
          allowCustom={allowCustom}
          onPick={(v) => {
            onChange(v);
            setAnchor(null);
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </>
  );
}
