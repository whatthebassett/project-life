import { useEffect, useRef, useState } from "react";
import { formatDue, startOfDay } from "../tasks/dates";
import { listFor } from "../tasks/lists";
import { newTask } from "../tasks/model";
import { parseCapture } from "../tasks/quick";
import { Icon } from "../ui/icons";
import type { HomeData } from "./useHome";

interface Props {
  home: HomeData;
  // Changes each time Ctrl+K is pressed, to bring focus here.
  focusSignal: number;
}

// Home's quick capture (Ctrl K): type a task the way you'd say it, press
// Enter. "Pay rent fri 5pm !high #personal" becomes a task due Friday at 5,
// high priority, on Personal. Notes and events join in later phases.
export default function Capture({ home, focusSignal }: Props) {
  const [draft, setDraft] = useState("");
  const [said, setSaid] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSignal) input.current?.focus();
  }, [focusSignal]);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const now = new Date();
    const parsed = parseCapture(text, home.now);
    home.updateTasks((tasks) => [...tasks, newTask(parsed, now)]);
    setDraft("");
    const when = parsed.due ? formatDue(parsed.due, parsed.time, startOfDay(home.now)) : "no date";
    setSaid(`Added task: ${parsed.title}, due ${when}, on ${listFor(parsed.list).name}.`);
  };

  return (
    <div className="flex shrink items-center gap-[10px]">
      <label htmlFor="pl-capture" className="sr-only">
        Quick capture
      </label>
      <div className="flex h-[50px] w-[420px] min-w-[220px] shrink items-center gap-[10px] rounded-[16px] border border-line bg-panel pr-2 pl-4 text-muted transition-colors focus-within:border-accent">
        <Icon name="search" size={18} />
        <input
          ref={input}
          id="pl-capture"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") setDraft("");
          }}
          placeholder="Capture a task, note or event…"
          className="h-full min-w-0 flex-1 border-0 bg-transparent text-14 text-text"
        />
        <span className="shrink-0 rounded-[7px] border border-line px-[7px] py-1 font-mono text-11 text-muted">Ctrl K</span>
      </div>
      <button
        type="button"
        onClick={add}
        className="flex h-[50px] shrink-0 items-center gap-2 rounded-[16px] bg-accent px-5 text-14 font-semibold text-accent-ink transition-[filter] hover:brightness-110"
      >
        <Icon name="plus" size={16} stroke={2.2} />
        Add
      </button>
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
