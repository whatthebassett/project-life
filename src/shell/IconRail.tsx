import clsx from "clsx";
import { useSettings } from "../lib/SettingsContext";
import { Icon } from "../ui/icons";
import { initialOf, navItems, type Screen } from "./nav";

interface Props {
  screen: Screen;
  onNavigate: (screen: Screen) => void;
  onSettings: () => void;
}

// The 72px rail on every screen but Home (Tasks.dc.html and friends): logo,
// the six places, then Settings and the avatar at the bottom.
export default function IconRail({ screen, onNavigate, onSettings }: Props) {
  const { settings } = useSettings();
  return (
    <nav aria-label="App" className="flex w-[72px] shrink-0 flex-col items-center gap-1.5 border-r border-line bg-side pt-5 pb-[18px]">
      <div className="mb-[14px] flex h-9 w-9 items-center justify-center rounded-[11px] bg-accent text-accent-ink">
        <Icon name="logo" size={20} stroke={2} />
      </div>
      {navItems.map((item) => {
        const on = item.id === screen;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            title={item.label}
            aria-current={on ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
            className={clsx(
              "flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors duration-150",
              on ? "bg-accent-soft text-accent" : "text-muted hover:bg-panel hover:text-text",
            )}
          >
            <Icon name={item.icon} size={20} />
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        type="button"
        aria-label="Settings"
        title="Settings (Ctrl+,)"
        onClick={onSettings}
        className="flex h-12 w-12 items-center justify-center rounded-[14px] text-muted transition-colors duration-150 hover:bg-panel hover:text-text"
      >
        <Icon name="settings" size={20} />
      </button>
      <div
        title={settings.DisplayName}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-panel2 text-14 font-semibold text-accent"
      >
        {initialOf(settings.DisplayName)}
      </div>
    </nav>
  );
}
