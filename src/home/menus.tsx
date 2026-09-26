// Right-click menus Home's cards share: an event's, and copying a link.
import { CalendarDays, FileText, Link2, Video } from "lucide-react";
import type { MenuItem } from "../components/ContextMenu";
import { openUrl } from "../lib/api";
import { requestSchedule } from "../schedule/nav";
import { toast } from "../ui/Toast";
import { callNames, type HomeEvent } from "./sources";

export function copyLink(url: string) {
  navigator.clipboard.writeText(url).then(
    () => toast("Copied the link"),
    () => toast("Couldn't copy the link"),
  );
}

// An event on Home: open it in Schedule, join its call, open its note. Sample
// events aren't real, so they don't open in Schedule.
export function eventMenu(e: HomeEvent, sample: boolean, openNote: (name: string) => void): MenuItem[] {
  // The id is an occurrence key: "eventId@YYYY-MM-DD".
  const [id, day] = e.id.split("@");
  const items: MenuItem[] = [{ label: "Open in Schedule", icon: <CalendarDays size={13} />, disabled: sample, onSelect: () => requestSchedule({ kind: "open", id, day }) }];
  if (e.joinUrl) items.push({ label: e.call ? `Join ${callNames[e.call]} call` : "Join call", icon: <Video size={13} />, onSelect: () => void openUrl(e.joinUrl!) });
  if (e.noteName) items.push({ label: "Open note", icon: <FileText size={13} />, onSelect: () => openNote(e.noteName!) });
  if (e.joinUrl) items.push({ label: "Copy meeting link", icon: <Link2 size={13} />, onSelect: () => copyLink(e.joinUrl!) });
  return items;
}
