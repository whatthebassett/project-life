import type { ReactNode } from "react";
import type { HabitIconId } from "./model";

// The ten habit icons, path for path from HabitEdit.dc.html.
const paths: Record<HabitIconId, ReactNode> = {
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 21V5M19 19v2H6" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" />
    </>
  ),
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  pen: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  dumbbell: <path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" />,
  music: (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 20c0-9 6-15 15-15 0 9-6 15-15 15z" />
      <path d="M5 20 13 12" />
    </>
  ),
  code: <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />,
};

export const iconNames: Record<HabitIconId, string> = {
  drop: "Water drop",
  book: "Book",
  route: "Path",
  heart: "Heart",
  pen: "Pen",
  moon: "Moon",
  dumbbell: "Weights",
  music: "Music",
  leaf: "Leaf",
  code: "Code",
};

export function HabitIcon({ id, size = 20 }: { id: HabitIconId; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[id]}
    </svg>
  );
}
