import { dayLabel, greeting, timeLabel, useNow } from "../lib/dates";
import { useSettings } from "../lib/SettingsContext";
import { ComingSoon } from "./ScreenFrame";

// Home (Main.dc.html). Phase 1 has the greeting; the cards arrive in Phase 2.
export default function Home() {
  const now = useNow();
  const { settings } = useSettings();
  const name = settings.DisplayName.trim();

  return (
    <main
      className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-10 py-8"
      style={{ background: "radial-gradient(900px 520px at 88% -12%, var(--glow), transparent 62%), var(--bg)" }}
    >
      <header className="flex flex-col gap-2">
        <div className="font-mono text-12 tracking-[0.14em] text-muted">
          {dayLabel(now)} · {timeLabel(now)}
        </div>
        <h1 className="m-0 font-head text-50 leading-[1.05] font-bold tracking-[-0.02em]">
          {greeting(now)}
          {name ? (
            <>
              , <span className="text-accent">{name}.</span>
            </>
          ) : (
            "."
          )}
        </h1>
      </header>
      <ComingSoon phase={2} what="Up next, Today, your schedule, tasks, habits, notes, news and weather" />
    </main>
  );
}
