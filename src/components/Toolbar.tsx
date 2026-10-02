import { isMac } from "../lib/platform";
import { useRef } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Eye,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Minus,
  Quote,
  Redo2,
  Smile,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import clsx from "clsx";
import type { MenuItem } from "./ContextMenu";
import { notedCallouts } from "../editor/callout";
import { alignCells, cellVAlign, valignCells } from "../editor/tables";
import { calloutIcon, commandIcon } from "../lib/menuIcons";
import { calloutColor } from "../editor/callout";
import { AlignCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Columns2, PanelTop, Rows2, Trash2 as TrashIcon, X as XIcon } from "lucide-react";
import { codeLanguage } from "../editor/code";

interface Props {
  editor: Editor | null;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  keyFor: (id: string) => string;
  onEmoji: (x: number, y: number) => void;
  onLink: () => void;
  onImage: () => void;
}

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

// The table menu, shared by the toolbar button and the right-click menu.
export function tableMenuItems(editor: Editor): MenuItem[] {
  const c = () => editor.chain().focus();
  if (!editor.isActive("table")) {
    return [2, 3, 4].map((n) => ({
      label: `Insert ${n}×${n} table`,
      icon: <TableIcon size={15} />,
      onSelect: () => c().insertTable({ rows: n, cols: n, withHeaderRow: true }).run(),
    }));
  }
  const align = (editor.getAttributes("tableCell").align ?? editor.getAttributes("tableHeader").align ?? null) as string | null;
  const valign = cellVAlign(editor);
  return [
    { label: "Add row above", icon: <BetweenHorizontalStart size={15} />, onSelect: () => c().addRowBefore().run() },
    { label: "Add row below", icon: <BetweenHorizontalEnd size={15} />, onSelect: () => c().addRowAfter().run() },
    { label: "Add column left", icon: <BetweenVerticalStart size={15} />, onSelect: () => c().addColumnBefore().run() },
    { label: "Add column right", icon: <BetweenVerticalEnd size={15} />, onSelect: () => c().addColumnAfter().run() },
    { type: "separator" },
    {
      label: "Align",
      icon: <AlignLeft size={15} />,
      children: [
        { label: "Left", icon: <AlignLeft size={15} />, checked: !align || align === "left", onSelect: () => alignCells(editor, "left") },
        { label: "Center", icon: <AlignCenter size={15} />, checked: align === "center", onSelect: () => alignCells(editor, "center") },
        { label: "Right", icon: <AlignRight size={15} />, checked: align === "right", onSelect: () => alignCells(editor, "right") },
      ],
    },
    {
      label: "Vertical align",
      icon: <AlignVerticalJustifyCenter size={15} />,
      children: (["top", "middle", "bottom"] as const).map((v) => ({
        label: v[0].toUpperCase() + v.slice(1),
        icon: { top: <AlignVerticalJustifyStart size={15} />, middle: <AlignVerticalJustifyCenter size={15} />, bottom: <AlignVerticalJustifyEnd size={15} /> }[v],
        checked: valign === v,
        onSelect: () => valignCells(editor, v),
      })),
    },
    { label: "Toggle header row", icon: <PanelTop size={15} />, onSelect: () => c().toggleHeaderRow().run() },
    { type: "separator" },
    { label: "Delete row", icon: <Rows2 size={15} />, onSelect: () => c().deleteRow().run() },
    { label: "Delete column", icon: <Columns2 size={15} />, onSelect: () => c().deleteColumn().run() },
    { label: "Delete table", icon: <TrashIcon size={15} />, danger: true, onSelect: () => c().deleteTable().run() },
  ];
}

// Notes' format bar, under the note's bar in Visual mode: undo and redo, the
// text style, inline formatting, blocks, and tables, pictures and emoji. The
// buttons follow the writer's own shortcuts in their tooltips. Arrow keys
// move along it (one Tab stop for the whole bar), and its menus open under
// their button, so it works from the keyboard as well as the mouse.
export default function Toolbar({ editor, openMenu, keyFor, onEmoji, onLink, onImage }: Props) {
  const bar = useRef<HTMLDivElement>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      undo: e?.can().undo() ?? false,
      redo: e?.can().redo() ?? false,
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      code: e?.isActive("code") ?? false,
      spoiler: e?.isActive("spoiler") ?? false,
      link: e?.isActive("link") ?? false,
      heading: (e?.getAttributes("heading").level as number | undefined) ?? 0,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      task: e?.isActive("taskList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      callout: (e?.getAttributes("callout").kind as string | undefined) ?? "",
      codeBlock: e?.isActive("codeBlock") ?? false,
      table: e?.isActive("table") ?? false,
    }),
  });

  if (!editor || !state) return null;
  const c = () => editor.chain().focus();
  // "Bold (Ctrl+B)", following the writer's own shortcuts.
  const tip = (name: string, id: string) => (keyFor(id) ? `${name} (${keyFor(id)})` : name);
  // Menus open under their button.
  const under = (e: React.MouseEvent<HTMLElement>, items: MenuItem[]) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(r.left, r.bottom + 4, items);
  };

  const styleMenu: MenuItem[] = [
    { label: "Text", icon: commandIcon("markdown.Paragraph"), hint: keyFor("markdown.Paragraph"), checked: state.heading === 0, onSelect: () => c().setParagraph().run() },
    ...([1, 2, 3, 4, 5, 6] as const).map<MenuItem>((level) => ({
      label: `Heading ${level}`,
      icon: commandIcon(`markdown.Heading ${level}`),
      hint: keyFor(`markdown.Heading ${level}`),
      checked: state.heading === level,
      onSelect: () => c().toggleHeading({ level }).run(),
    })),
  ];

  const calloutMenu: MenuItem[] = [
    ...notedCallouts.map<MenuItem>((kind) => ({
      label: capitalize(kind),
      icon: calloutIcon(kind, calloutColor(kind)),
      checked: state.callout === kind,
      onSelect: () => c().setCallout(kind).run(),
    })),
    { type: "separator" },
    { label: "Remove callout", icon: <XIcon size={15} />, disabled: !state.callout, onSelect: () => c().unsetCallout().run() },
  ];

  // Left and Right (Home, End) move along the bar.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = Array.from(bar.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const to = e.key === "ArrowRight" ? at + 1 : e.key === "ArrowLeft" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
    if (to === null || !buttons.length) return;
    e.preventDefault();
    buttons[(to + buttons.length) % buttons.length].focus();
  };

  return (
    <div className="shrink-0 border-b border-line bg-bg">
      <div
        ref={bar}
        role="toolbar"
        aria-label="Formatting"
        onKeyDown={onKeyDown}
        // A narrow window wraps it onto a second line rather than hiding buttons.
        className="mx-auto flex min-h-12 w-full max-w-[calc(var(--note-width)+80px)] flex-wrap items-center gap-x-0.5 gap-y-1 px-10 py-2 text-muted"
      >
        <Btn label="Undo" icon={<Undo2 size={16} />} title={isMac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"} disabled={!state.undo} onClick={() => c().undo().run()} />
        <Btn label="Redo" icon={<Redo2 size={16} />} title={isMac ? "Redo (⇧⌘Z)" : "Redo (Ctrl+Y)"} disabled={!state.redo} onClick={() => c().redo().run()} />
        <Sep />
        <button
          type="button"
          // The bar's one Tab stop (Undo can be disabled).
          tabIndex={0}
          aria-haspopup="menu"
          title="Text style"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => under(e, styleMenu)}
          className="flex h-8 w-[112px] shrink-0 items-center justify-between gap-1 rounded-[9px] px-2.5 text-13 font-medium text-text hover:bg-panel"
        >
          <span className="truncate">{state.heading ? `Heading ${state.heading}` : "Text"}</span>
          <ChevronDown size={14} className="shrink-0 text-muted" />
        </button>
        <Sep />
        <Btn label="Bold" icon={<Bold size={16} />} title={tip("Bold", "markdown.Bold")} pressed={state.bold} onClick={() => c().toggleBold().run()} />
        <Btn label="Italic" icon={<Italic size={16} />} title={tip("Italic", "markdown.Italic")} pressed={state.italic} onClick={() => c().toggleItalic().run()} />
        <Btn label="Underline" icon={<UnderlineIcon size={16} />} title={tip("Underline", "markdown.Underline")} pressed={state.underline} onClick={() => c().toggleUnderline().run()} />
        <Btn label="Strikethrough" icon={<Strikethrough size={16} />} title={tip("Strikethrough", "markdown.Strikethrough")} pressed={state.strike} onClick={() => c().toggleStrike().run()} />
        <Btn label="Inline code" icon={<Code size={16} />} title={tip("Inline code", "markdown.Inline code")} pressed={state.code} onClick={() => c().toggleCode().run()} />
        <Btn label="Spoiler" icon={<Eye size={16} />} title={tip("Spoiler", "markdown.Spoiler")} pressed={state.spoiler} onClick={() => c().toggleSpoiler().run()} />
        <Btn label="Link" icon={<LinkIcon size={16} />} title={tip("Link", "markdown.Link")} pressed={state.link} onClick={onLink} />
        <Sep />
        <Btn label="Bullet list" icon={<List size={16} />} title={tip("Bullet list", "markdown.Bullet list")} pressed={state.bullet} onClick={() => c().toggleBulletList().run()} />
        <Btn label="Numbered list" icon={<ListOrdered size={16} />} title={tip("Numbered list", "markdown.Numbered list")} pressed={state.ordered} onClick={() => c().toggleOrderedList().run()} />
        <Btn label="To-do list" icon={<ListChecks size={16} />} title={tip("To-do list", "markdown.Task list")} pressed={state.task} onClick={() => c().toggleTaskList().run()} />
        <Btn label="Quote" icon={<Quote size={16} />} title={tip("Quote", "markdown.Blockquote")} pressed={state.quote} onClick={() => c().toggleBlockquote().run()} />
        <Btn label="Callout" icon={<MessageSquareWarning size={16} />} title="Callout" menu pressed={Boolean(state.callout)} onClick={(e) => under(e, calloutMenu)} />
        <Btn label="Code block" icon={<SquareCode size={16} />} title={tip("Code block", "markdown.Code block")} pressed={state.codeBlock} onClick={() => c().toggleCodeBlock({ language: codeLanguage() }).run()} />
        <Btn label="Divider" icon={<Minus size={16} />} title={tip("Divider", "markdown.Divider")} onClick={() => c().setHorizontalRule().run()} />
        <Sep />
        <Btn label="Table" icon={<TableIcon size={16} />} title="Table" menu pressed={state.table} onClick={(e) => under(e, tableMenuItems(editor))} />
        <Btn label="Picture" icon={<ImageIcon size={16} />} title="Picture" onClick={onImage} />
        <Btn
          label="Emoji"
          icon={<Smile size={16} />}
          title={tip("Emoji", "app.emoji")}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onEmoji(r.left, r.bottom + 4);
          }}
        />
        <span className="ml-auto shrink-0 pl-4 font-mono text-11 whitespace-nowrap text-muted">Type / for blocks</span>
      </div>
    </div>
  );
}

function Btn({
  label,
  icon,
  title,
  pressed,
  menu,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  title: string;
  // A format that's on where the cursor is.
  pressed?: boolean;
  // Opens a menu rather than acting.
  menu?: boolean;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={menu ? undefined : pressed}
      aria-haspopup={menu ? "menu" : undefined}
      title={title}
      disabled={disabled}
      tabIndex={-1}
      // Clicking keeps the cursor (and selection) in the note.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={clsx(
        "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-[9px] px-1.5 transition-colors disabled:opacity-40",
        pressed ? "bg-accent-soft text-accent" : "hover:bg-panel hover:text-text",
      )}
    >
      {icon}
    </button>
  );
}

function Sep() {
  return <span aria-hidden="true" className="mx-1.5 h-5 w-px shrink-0 bg-line" />;
}
