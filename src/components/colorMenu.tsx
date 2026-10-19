import type { Editor } from "@tiptap/core";
import { Baseline, Highlighter, Pipette, RemoveFormatting } from "lucide-react";
import type { MenuItem } from "./ContextMenu";
import { highlightOf, palette, textColorOf } from "../editor/colors";

// The Text color and Highlight menus: the format bar's two buttons, and the
// right-click menu on selected text (and in a table). Palette colors show in
// the theme's own shades; Custom… opens Windows' color picker for any other.

const label = (c: string) => c[0].toUpperCase() + c.slice(1);

// An "A" in the color, as the text will look.
function Letter({ color }: { color: string | null }) {
  return (
    <span className="flex h-[15px] w-[15px] items-center justify-center text-[13px] font-semibold leading-none" data-text-color={color ?? undefined} style={color && !palette.includes(color as never) ? { color } : undefined}>
      A
    </span>
  );
}

// A swatch of the highlight.
function Swatch({ color }: { color: string | null }) {
  return (
    <span
      className="block h-[14px] w-[14px] rounded-[4px] border border-line"
      data-highlight={color ? (palette.includes(color as never) ? color : "custom") : undefined}
      style={color && !palette.includes(color as never) ? { background: color } : undefined}
    />
  );
}

// Windows' color picker (the browser's), starting at `start`; `apply` gets
// the color picked once it closes.
function pickColor(start: string, apply: (color: string) => void) {
  const input = document.createElement("input");
  input.type = "color";
  input.value = /^#[0-9a-f]{6}$/i.test(start) ? start : "#d44c47";
  Object.assign(input.style, { position: "fixed", left: "-100px", top: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(input);
  input.addEventListener("change", () => apply(input.value), { once: true });
  input.addEventListener("blur", () => input.remove(), { once: true });
  input.click();
}

export function textColorItems(editor: Editor): MenuItem[] {
  const current = textColorOf(editor);
  const custom = current && !palette.includes(current as never) ? current : null;
  return [
    { label: "Default", icon: <Letter color={null} />, checked: !current, onSelect: () => editor.chain().focus().unsetTextColor().run() },
    ...palette.map((c) => ({ label: label(c), icon: <Letter color={c} />, checked: current === c, onSelect: () => editor.chain().focus().setTextColor(c).run() })),
    { type: "separator" },
    {
      label: custom ? `Custom (${custom})` : "Custom…",
      icon: custom ? <Letter color={custom} /> : <Pipette size={15} />,
      checked: Boolean(custom),
      onSelect: () => pickColor(custom ?? "", (c) => editor.chain().focus().setTextColor(c).run()),
    },
  ];
}

export function highlightItems(editor: Editor): MenuItem[] {
  const current = highlightOf(editor);
  const custom = current && !palette.includes(current as never) ? current : null;
  return [
    { label: "None", icon: <Swatch color={null} />, checked: !current, onSelect: () => editor.chain().focus().unsetHighlight().run() },
    ...palette.map((c) => ({ label: label(c), icon: <Swatch color={c} />, checked: current === c, onSelect: () => editor.chain().focus().setHighlight(c).run() })),
    { type: "separator" },
    {
      label: custom ? `Custom (${custom})` : "Custom…",
      icon: custom ? <Swatch color={custom} /> : <Pipette size={15} />,
      checked: Boolean(custom),
      onSelect: () => pickColor(custom ?? "", (c) => editor.chain().focus().setHighlight(c).run()),
    },
  ];
}

// For a right-click on selected text: both, as submenus, and a way to take
// them off again.
export function colorMenuItems(editor: Editor, keyFor?: (id: string) => string): MenuItem[] {
  const colored = Boolean(textColorOf(editor) || highlightOf(editor));
  return [
    { label: "Text color", icon: <Baseline size={15} />, children: textColorItems(editor) },
    { label: "Highlight", icon: <Highlighter size={15} />, hint: keyFor?.("format.highlight"), children: highlightItems(editor) },
    { label: "Remove colors", icon: <RemoveFormatting size={15} />, disabled: !colored, onSelect: () => editor.chain().focus().unsetTextColor().unsetHighlight().run() },
  ];
}
