import { useSettings } from "../lib/SettingsContext";
import { keysFor, shortcutCommands, type ShortcutGroup } from "../lib/shortcuts";
import { Icon, type IconName } from "../ui/icons";
import { KeyCaps, SectionLabel } from "../ui/bits";
import { Popup, PopupHeader } from "../ui/Popup";

const places: { icon: IconName; name: string; text: string }[] = [
  { icon: "home", name: "Home", text: "A bit of everything: what's up next, today's progress, your schedule, tasks, goals, habits, recent notes, news, weather, sports and markets. Move and resize the cards, or lock them. Ctrl T opens the command palette from anywhere: add a task, note or event, jump to a note (Ctrl Enter for a new tab), or run a command." },
  { icon: "notes", name: "Notes", text: "Plain Markdown files, written in Visual or Markdown mode. Type / for blocks, right-click a to-do to send it to Tasks, and open “How to use Notes” for a tour." },
  { icon: "schedule", name: "Schedule", text: "Your week or month. Type “Haircut sat 3pm” to add an event (“Mom’s birthday oct 3” comes back every year), drag to move or resize one, and join calls from the card on the left." },
  { icon: "tasks", name: "Tasks", text: "Quick add reads dates, priorities (!high) and lists (#errands). Later moves a task on; double-click one for everything about it." },
  { icon: "habits", name: "Habits", text: "Check off, count or time what you do regularly. Streaks forgive a missed day a week, and your day ends at 3 AM." },
  { icon: "goals", name: "Goals", text: "Something to get done by a date. Log progress, tick milestones, or link habits so every check-in counts toward it." },
];

const groups: { group: ShortcutGroup; title: string }[] = [
  { group: "Everywhere", title: "EVERYWHERE" },
  { group: "Notes", title: "NOTES" },
  { group: "Tabs", title: "TABS" },
  { group: "Formatting", title: "IN A NOTE" },
];

// The Guide (F1): what each screen is for, and every keyboard shortcut as
// it's set now (Settings → Keyboard shortcuts changes them).
export default function GuidePopup({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings();
  return (
    <Popup onClose={onClose} width={960} height={820} label="Guide">
      <PopupHeader tag="GUIDE" onClose={onClose}>
        What's where, and the keys that get you there
      </PopupHeader>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[420px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line px-6 py-5">
          {places.map((p) => (
            <div key={p.name} className="flex gap-3.5 rounded-[16px] border border-line bg-panel p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
                <Icon name={p.icon} size={19} />
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-15 font-semibold">{p.name}</span>
                <span className="text-13 leading-[1.5] text-muted">{p.text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
          {groups.map(({ group, title }) => {
            const items = shortcutCommands.filter((c) => c.group === group && keysFor(c.id, settings.Shortcuts));
            if (!items.length) return null;
            return (
              <div key={group} className="flex flex-col gap-2">
                <SectionLabel>{title}</SectionLabel>
                <div className="flex flex-col rounded-[14px] border border-line bg-panel [&>*+*]:border-t [&>*+*]:border-line">
                  {items.map((c) => (
                    <div key={c.id} className="flex min-h-10 items-center justify-between gap-3 px-3.5 py-1.5 text-13">
                      <span>{c.name}</span>
                      <KeyCaps keys={keysFor(c.id, settings.Shortcuts).split("+")} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Popup>
  );
}
