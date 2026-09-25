import type { Theme } from "../lib/themes";
import { Icon } from "../ui/icons";

// A little drawing of the app in that theme's own colors (Settings.dc.html).
export default function ThemeCard({ theme, selected, onPick }: { theme: Theme; selected: boolean; onPick: () => void }) {
  const p = theme.preview;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="flex flex-col gap-[10px] rounded-[18px] bg-panel px-2 pt-2 pb-3 text-left transition-[border-color] duration-150"
      style={{ border: `2px solid ${selected ? "var(--accent)" : "transparent"}` }}
    >
      <span className="flex h-24 overflow-hidden rounded-[12px]" style={{ background: p.bg, border: `1px solid ${p.line}` }}>
        <span className="flex w-[22px] flex-col items-center gap-[5px] pt-2" style={{ background: p.side, borderRight: `1px solid ${p.line}` }}>
          <span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: p.accent }} />
          <span className="h-[3px] w-2 rounded-[2px] opacity-60" style={{ background: p.muted }} />
          <span className="h-[3px] w-2 rounded-[2px] opacity-60" style={{ background: p.muted }} />
        </span>
        <span className="flex flex-1 flex-col gap-1.5 p-[9px]">
          <span className="h-[7px] w-[60%] rounded-[3px]" style={{ background: p.text }} />
          <span className="flex flex-1 gap-[5px]">
            <span className="flex flex-[2] items-end rounded-[6px] p-[5px]" style={{ background: p.panel }}>
              <span className="h-[5px] w-[60%] rounded-[3px]" style={{ background: p.accent }} />
            </span>
            <span className="flex flex-1 items-center justify-center rounded-[6px]" style={{ background: p.panel }}>
              <span className="h-[14px] w-[14px] rounded-full" style={{ border: `3px solid ${p.accent2}` }} />
            </span>
          </span>
        </span>
      </span>
      <span className="flex items-center justify-between px-1">
        <span className="text-14 font-semibold">{theme.name}</span>
        {selected && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Icon name="check" size={11} stroke={3.4} />
          </span>
        )}
      </span>
      <span className="px-1 text-11 text-muted">{theme.mood}</span>
    </button>
  );
}
