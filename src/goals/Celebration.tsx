import { useEffect, useMemo, useRef, useState } from "react";
import { announce } from "../lib/announce";
import { useSettings } from "../lib/SettingsContext";
import { habitDay } from "../habits/model";
import { rulesOf, useHabits } from "../habits/useHabits";
import { progressOn } from "./model";
import { useGoals } from "./useGoals";

// Settings → Habits and goals → Celebrate finished goals: when a goal reaches
// 100% while Project Life is open, a little confetti and a note. With Reduce
// motion on, just the note.
export default function Celebration() {
  const { goals, loaded } = useGoals();
  const { habits, loaded: habitsLoaded } = useHabits();
  const { settings } = useSettings();
  const seen = useRef<Set<string> | null>(null);
  const [party, setParty] = useState<{ key: number; title: string } | null>(null);
  const today = habitDay(new Date(), rulesOf(settings));

  useEffect(() => {
    // Both files first, so a goal that counts habits isn't "finished" just
    // because the habits arrived.
    if (!loaded || !habitsLoaded) return;
    const done = new Set(goals.filter((g) => progressOn(g, habits, today) >= 100).map((g) => g.Id));
    const before = seen.current;
    seen.current = done;
    if (!before || settings.Celebrate === false) return;
    const fresh = goals.find((g) => done.has(g.Id) && !before.has(g.Id));
    if (!fresh) return;
    setParty({ key: Date.now(), title: fresh.Title });
    announce(`Goal finished: ${fresh.Title}`);
  }, [goals, habits, loaded, habitsLoaded, today, settings.Celebrate]);

  useEffect(() => {
    if (!party) return;
    const t = window.setTimeout(() => setParty(null), 4200);
    return () => window.clearTimeout(t);
  }, [party]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.4,
        drift: (Math.random() - 0.5) * 220,
        spin: (Math.random() - 0.5) * 1080,
        hue: i % 6,
        wide: Math.random() > 0.5,
      })),
    // New confetti for each party.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party?.key],
  );

  if (!party) return null;
  const still = settings.ReduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {!still &&
        pieces.map((p, i) => (
          <span
            key={`${party.key}-${i}`}
            className="pl-confetti absolute top-[-16px] rounded-[2px]"
            style={
              {
                left: `${p.left}%`,
                width: p.wide ? 10 : 6,
                height: p.wide ? 6 : 12,
                background: `var(--hue-${p.hue})`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                "--drift": `${p.drift}px`,
                "--spin": `${p.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      <div className="pl-toast absolute inset-x-0 top-24 flex justify-center">
        <div className="flex flex-col items-center gap-1 rounded-[20px] border border-line bg-panel px-8 py-5 shadow-[0_18px_50px_rgba(0,0,0,0.4)]">
          <span className="font-mono text-11 tracking-[0.14em] text-accent2">GOAL FINISHED</span>
          <span className="max-w-[420px] truncate font-head text-24 font-bold">{party.title || "Untitled goal"}</span>
          <span className="text-13 text-muted">You hit 100%. Nice work.</span>
        </div>
      </div>
    </div>
  );
}
