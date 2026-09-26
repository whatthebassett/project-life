// Right-click menus for the rail and Home's sidebar: each place opens, or
// starts something new there; Settings also switches the sidebar style.
import { CalendarPlus, ExternalLink, FilePlus, Maximize2, PanelLeft, Plus, Settings } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { inTauri } from "../lib/api";
import { requestSchedule } from "../schedule/nav";
import { requestTasks } from "../tasks/nav";
import { openTasksWindow } from "../tasks/window";
import { navItems, type Screen } from "./nav";

export interface NavMenuHandlers {
  open: (screen: Screen) => void;
  newNote: () => void;
  keyFor: (id: string) => string;
}

export function navMenu(id: (typeof navItems)[number]["id"], h: NavMenuHandlers): MenuItem[] {
  const item = navItems.find((n) => n.id === id)!;
  const items: MenuItem[] = [{ label: `Open ${item.label}`, icon: <Maximize2 size={13} />, hint: id === "home" ? h.keyFor("app.home") : undefined, onSelect: () => h.open(id) }];
  if (id === "notes") items.push({ label: "New note", icon: <FilePlus size={13} />, onSelect: h.newNote });
  if (id === "schedule") items.push({ label: "New event", icon: <CalendarPlus size={13} />, hint: h.keyFor("app.newEvent"), onSelect: () => requestSchedule({ kind: "new" }) });
  if (id === "tasks") {
    items.push({ label: "New task", icon: <Plus size={13} />, hint: h.keyFor("app.newTask"), onSelect: () => requestTasks({ kind: "new" }) });
    if (inTauri) items.push({ type: "separator" }, { label: "Pop out Tasks", icon: <ExternalLink size={13} />, onSelect: () => void openTasksWindow() });
  }
  return items;
}

export function settingsMenu(h: { open: () => void; keyFor: (id: string) => string; sidebar: "full" | "icons"; setSidebar: (style: "full" | "icons") => void }): MenuItem[] {
  return [
    { label: "Open settings", icon: <Settings size={13} />, hint: h.keyFor("app.settings"), onSelect: h.open },
    {
      label: "Sidebar",
      icon: <PanelLeft size={13} />,
      children: [
        { label: "Full", checked: h.sidebar === "full", onSelect: () => h.setSidebar("full") },
        { label: "Icons only", checked: h.sidebar === "icons", onSelect: () => h.setSidebar("icons") },
      ],
    },
  ];
}
