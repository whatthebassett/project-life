import type { IconName } from "../ui/icons";

export type Screen = "home" | "notes" | "schedule" | "tasks" | "habits" | "goals" | "gallery";

// The main places, in rail order.
export const navItems: { id: Exclude<Screen, "gallery">; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "notes", label: "Notes", icon: "notes" },
  { id: "schedule", label: "Schedule", icon: "schedule" },
  { id: "tasks", label: "Tasks", icon: "tasks" },
  { id: "habits", label: "Habits", icon: "habits" },
  { id: "goals", label: "Goals", icon: "goals" },
];

export function screenName(screen: Screen): string {
  return screen === "gallery" ? "Components" : navItems.find((n) => n.id === screen)!.label;
}

export function initialOf(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
