import clsx from "clsx";
import { useTodayOpenCount } from "../home/useHome";
import { requestTasks } from "../tasks/nav";
import { useTasks } from "../tasks/useTasks";
import { useSettings } from "../lib/SettingsContext";
import { themeFor, themes } from "../lib/themes";
import { Icon } from "../ui/icons";
import { SectionLabel } from "../ui/bits";
import { initialOf, navItems, type Screen } from "./nav";

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  onSettings: () => void;
}

// Spaces are your task lists (DESIGN.md §2); a click opens one in Tasks.
const MAX_SPACES = 6;

// Home's full 240px sidebar (Main.dc.html): nav, spaces, the theme picker and
// the profile.
export default function HomeSidebar({ screen, onNavigate, onSettings }: Props) {
  const { settings, update } = useSettings();
  // Today's open tasks, beside Tasks.
  const taskCount = useTodayOpenCount();
  const { lists } = useTasks();
  const current = themeFor(settings.Theme);

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-7 border-r border-line bg-side pt-7 pr-[18px] pb-[22px] pl-[18px]">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-accent text-accent-ink">
          <Icon name="logo" size={20} stroke={2} />
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="text-16 font-semibold tracking-[-0.01em]">Project Life</div>
          <div className="font-mono text-11 tracking-[0.04em] text-muted">by Checkpoint</div>
        </div>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {navItems.map((item) => {
          const on = item.id === screen;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
              className={clsx(
                "flex h-11 items-center gap-3 rounded-[12px] px-3 text-left text-14 font-medium transition-colors duration-150",
                on ? "bg-accent-soft text-text" : "text-muted hover:bg-panel hover:text-text",
              )}
            >
              <span className={clsx("flex", on ? "text-accent" : "text-muted")}>
                <Icon name={item.icon} size={18} />
              </span>
              <span className="flex-1">{item.label}</span>
              {item.id === "tasks" && taskCount > 0 && (
                <span className="flex h-[22px] min-w-6 items-center justify-center rounded-full bg-panel2 px-[7px] font-mono text-12 text-text">{taskCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col gap-1.5">
        <SectionLabel className="px-3 pb-1.5">Spaces</SectionLabel>
        {lists.slice(0, MAX_SPACES).map((l) => (
          <button
            key={l.Id}
            onClick={() => requestTasks({ kind: "list", id: l.Id })}
            className="flex h-[38px] items-center gap-3 rounded-[10px] px-3 text-left text-14 text-muted hover:bg-panel hover:text-text"
          >
            <span className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: `var(--${l.Color})` }} />
            <span className="truncate">{l.Name}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-[14px] rounded-[16px] border border-line bg-panel p-4">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Theme</SectionLabel>
          <span className="text-13 font-medium">{current.name}</span>
        </div>
        <div className="flex gap-3" role="radiogroup" aria-label="Theme">
          {themes.map((t) => {
            const on = t.id === current.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Switch to ${t.name} theme`}
                title={t.name}
                onClick={() => update({ Theme: t.id })}
                className="h-[34px] w-[34px] rounded-full border border-line transition-shadow duration-150"
                style={{
                  background: `linear-gradient(135deg, ${t.preview.bg} 0 52%, ${t.preview.accent} 52% 100%)`,
                  boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${on ? "var(--accent)" : "transparent"}`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3 px-1.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel2 text-14 font-semibold text-accent">
          {initialOf(settings.DisplayName)}
        </div>
        <div className="min-w-0 flex-1 truncate text-14 font-medium">{settings.DisplayName || "You"}</div>
        <button
          type="button"
          aria-label="Settings"
          title="Settings (Ctrl+,)"
          onClick={onSettings}
          className="flex h-11 w-11 items-center justify-center rounded-[12px] text-muted transition-colors duration-150 hover:bg-panel hover:text-text"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>
    </aside>
  );
}
