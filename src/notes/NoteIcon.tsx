import clsx from "clsx";

// Emoji are drawn with Windows' color emoji font, like the picker's.
export const emojiFont = '"Segoe UI Emoji", "Apple Color Emoji", "Segoe UI Symbol", sans-serif';

// A note's icon beside its name in a list, at the list's text size. The name
// says what the note is, so screen readers skip it.
export default function NoteIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx("shrink-0 leading-none", className)} style={{ fontFamily: emojiFont }}>
      {icon}
    </span>
  );
}
