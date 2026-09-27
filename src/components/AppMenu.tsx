import { useCallback, useEffect, useState } from "react";
import { EditorView } from "@codemirror/view";
import type { EditorView as NoteView } from "@tiptap/pm/view";
import { ExternalLink, Link2, PanelTop } from "lucide-react";
import ContextMenu, { type MenuItem, type MenuState } from "./ContextMenu";
import { linkSpanAt, setLinkView } from "../editor/linkTitles";
import type { LinkView } from "../editor/smartLinks";
import { youTubeEmbed } from "../editor/videoEmbeds";
import { openUrl, system } from "../lib/api";
import { clipboardIcons } from "../lib/menuIcons";
import { toast } from "../ui/Toast";

// Right-clicking anywhere a screen hasn't a menu of its own gets Project
// Life's menu instead of the browser's (Back, Refresh, Print and the rest):
// Cut, Copy, Paste and Select all in text boxes and notes, Open link and Copy
// link on a link, and Copy for selected text. Elsewhere, nothing opens.
// Shift+right-click still gives the browser's own menu, for its spelling
// suggestions (and Inspect while developing).
export default function AppMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      // A screen's own menu (a note, a task, a list) already opened.
      if (e.defaultPrevented) return;
      if (e.shiftKey) return;
      e.preventDefault();
      const items = itemsAt(e.target as Element | null);
      setMenu(items.length ? { x: e.clientX, y: e.clientY, items } : null);
    };
    // Bubbling, so screens' own handlers (React's, on the root) go first.
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, []);

  return <ContextMenu menu={menu} onClose={close} />;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

const textInputs = new Set(["", "text", "search", "url", "email", "tel", "password", "number"]);

function itemsAt(target: Element | null): MenuItem[] {
  if (!target) return [];
  const items: MenuItem[] = [];

  const link = target.closest("a[href]");
  const href = link?.getAttribute("href") ?? "";
  if (/^(https?:|mailto:)/i.test(href)) {
    items.push(
      { label: "Open link", icon: <ExternalLink size={15} />, onSelect: () => void openUrl(href) },
      { label: "Copy link", icon: <Link2 size={15} />, onSelect: () => void copyText(href, "Copied the link") },
      ...noteLinkItems(link!),
      { type: "separator" },
    );
  }

  const field = target.closest("input, textarea") as Field | null;
  if (field && (field instanceof HTMLTextAreaElement || textInputs.has(field.getAttribute("type") ?? ""))) {
    return [...items, ...fieldItems(field)];
  }
  const host = editingHost(target);
  if (host) return [...items, ...editableItems(host)];

  // Plain text on the page that's been selected.
  const selected = window.getSelection()?.toString() ?? "";
  if (selected.trim()) return [...items, { label: "Copy", icon: clipboardIcons.copy, hint: "Ctrl+C", onSelect: () => void copyText(selected) }];
  return items[items.length - 1]?.type === "separator" ? items.slice(0, -1) : items;
}

// A web link in a note: how it shows, as Confluence's smart links do.
const views: { id: LinkView; label: string }[] = [
  { id: "url", label: "URL" },
  { id: "inline", label: "Inline" },
  { id: "card", label: "Card" },
  { id: "embed", label: "Embed" },
];

function noteLinkItems(link: Element): MenuItem[] {
  const note = link.closest(".ProseMirror") as (HTMLElement & { editor?: { view: NoteView } }) | null;
  const view = note?.editor?.view;
  if (!view || !/^https?:/i.test(link.getAttribute("href") ?? "")) return [];
  const span = linkSpanAt(view, link);
  if (!span) return [];
  return [
    {
      label: "Display as",
      icon: <PanelTop size={15} />,
      children: views.map((v) => ({
        label: v.label,
        checked: span.view === v.id,
        // Only videos play in a note (YouTube, for now).
        disabled: v.id === "embed" && !youTubeEmbed(span.href),
        onSelect: () => setLinkView(view, span, v.id),
      })),
    },
  ];
}

// A text box: what was selected is kept, since picking from the menu moves
// focus away from it.
function fieldItems(field: Field): MenuItem[] {
  const start = field.selectionStart ?? 0;
  const end = field.selectionEnd ?? 0;
  const selected = field.value.slice(start, end);
  const locked = field.readOnly || field.disabled;
  const secret = field.getAttribute("type") === "password";
  const restore = () => {
    field.focus();
    field.setSelectionRange(start, end);
  };
  return [
    {
      label: "Cut",
      icon: clipboardIcons.cut,
      hint: "Ctrl+X",
      disabled: !selected || locked || secret,
      onSelect: () => {
        restore();
        if (!document.execCommand("cut")) void copyText(selected).then(() => document.execCommand("delete"));
      },
    },
    {
      label: "Copy",
      icon: clipboardIcons.copy,
      hint: "Ctrl+C",
      disabled: !selected || secret,
      onSelect: () => {
        restore();
        if (!document.execCommand("copy")) void copyText(selected);
      },
    },
    {
      label: "Paste",
      icon: clipboardIcons.paste,
      hint: "Ctrl+V",
      disabled: locked,
      onSelect: () =>
        void readClipboard().then((clip) => {
          if (!clip?.text) return;
          restore();
          // As if typed, so Undo takes it back and the screen hears about it.
          document.execCommand("insertText", false, field instanceof HTMLInputElement ? clip.text.replace(/\r?\n/g, " ") : clip.text);
        }),
    },
    { type: "separator" },
    {
      label: "Select all",
      icon: clipboardIcons.selectAll,
      hint: "Ctrl+A",
      disabled: !field.value,
      onSelect: () => {
        field.focus();
        field.select();
      },
    },
  ];
}

// A note (either editor) or another editable area. The editors copy, cut and
// paste themselves, so the menu hands them the same events the keys would.
function editableItems(host: HTMLElement): MenuItem[] {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount && host.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
  const selected = range?.toString() ?? "";
  const code = host.closest(".cm-editor") ? EditorView.findFromDOM(host) : null;
  const hasSelection = code ? !code.state.selection.main.empty : Boolean(selected);
  const restore = () => {
    host.focus();
    if (range && !code) {
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(range);
    }
  };
  return [
    {
      label: "Cut",
      icon: clipboardIcons.cut,
      hint: "Ctrl+X",
      disabled: !hasSelection,
      onSelect: () => {
        restore();
        document.execCommand("cut");
      },
    },
    {
      label: "Copy",
      icon: clipboardIcons.copy,
      hint: "Ctrl+C",
      disabled: !hasSelection,
      onSelect: () => {
        restore();
        if (!document.execCommand("copy") && selected) void copyText(selected);
      },
    },
    {
      label: "Paste",
      icon: clipboardIcons.paste,
      hint: "Ctrl+V",
      onSelect: () =>
        void readClipboard().then((clip) => {
          if (!clip || (!clip.text && !clip.html)) return;
          restore();
          const data = new DataTransfer();
          data.setData("text/plain", clip.text);
          if (clip.html) data.setData("text/html", clip.html);
          const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
          host.dispatchEvent(event);
          if (!event.defaultPrevented) document.execCommand("insertText", false, clip.text);
        }),
    },
    { type: "separator" },
    {
      label: "Select all",
      icon: clipboardIcons.selectAll,
      hint: "Ctrl+A",
      onSelect: () => {
        if (code) {
          code.focus();
          code.dispatch({ selection: { anchor: 0, head: code.state.doc.length } });
          return;
        }
        host.focus();
        document.execCommand("selectAll");
      },
    },
  ];
}

// The outermost editable element around the target, if any.
function editingHost(target: Element): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : target.parentElement;
  if (!el?.isContentEditable) return null;
  while (el.parentElement?.isContentEditable) el = el.parentElement;
  return el;
}

function copyText(text: string, done?: string) {
  return navigator.clipboard.writeText(text).then(
    () => done && toast(done),
    () => toast("Couldn't copy that"),
  );
}

function readClipboard() {
  return system.readClipboard().catch((e: unknown) => {
    toast(typeof e === "string" ? e : "Couldn't read the clipboard");
    return null;
  });
}
