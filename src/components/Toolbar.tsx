import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Code,
  Eye,
  Heading,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  MessageSquareWarning,
  Minus,
  Quote,
  Smile,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
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

export default function Toolbar({ editor, openMenu, keyFor, onEmoji, onLink, onImage }: Props) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
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

  const headingMenu = (x: number, y: number) =>
    openMenu(x, y, [
      { label: "Paragraph", icon: commandIcon("markdown.Paragraph"), hint: keyFor("markdown.Paragraph"), checked: state.heading === 0, onSelect: () => c().setParagraph().run() },
      ...([1, 2, 3, 4, 5, 6] as const).map<MenuItem>((level) => ({
        label: `Heading ${level}`,
        icon: commandIcon(`markdown.Heading ${level}`),
        hint: keyFor(`markdown.Heading ${level}`),
        checked: state.heading === level,
        onSelect: () => c().toggleHeading({ level }).run(),
      })),
    ]);

  const calloutMenu = (x: number, y: number) =>
    openMenu(x, y, [
      ...notedCallouts.map<MenuItem>((kind) => ({
        label: capitalize(kind),
        icon: calloutIcon(kind, calloutColor(kind)),
        checked: state.callout === kind,
        onSelect: () => c().setCallout(kind).run(),
      })),
      { type: "separator" },
      { label: "Remove callout", icon: <XIcon size={15} />, disabled: !state.callout, onSelect: () => c().unsetCallout().run() },
    ]);

  const tableMenu = (x: number, y: number) => openMenu(x, y, tableMenuItems(editor));

  return (
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-line px-2 text-muted">
      <Btn icon={<Bold size={14} />} title={tip("Bold", "markdown.Bold")} active={state.bold} onClick={() => c().toggleBold().run()} />
      <Btn icon={<Italic size={14} />} title={tip("Italic", "markdown.Italic")} active={state.italic} onClick={() => c().toggleItalic().run()} />
      <Btn icon={<UnderlineIcon size={14} />} title={tip("Underline", "markdown.Underline")} active={state.underline} onClick={() => c().toggleUnderline().run()} />
      <Btn icon={<Strikethrough size={14} />} title={tip("Strikethrough", "markdown.Strikethrough")} active={state.strike} onClick={() => c().toggleStrike().run()} />
      <Btn icon={<Code size={14} />} title={tip("Inline code", "markdown.Inline code")} active={state.code} onClick={() => c().toggleCode().run()} />
      <Btn icon={<Eye size={14} />} title={tip("Spoiler", "markdown.Spoiler")} active={state.spoiler} onClick={() => c().toggleSpoiler().run()} />
      <Btn icon={<LinkIcon size={14} />} title={tip("Link", "markdown.Link")} active={state.link} onClick={onLink} />
      <Sep />
      <Btn
        icon={
          <span className="flex items-center gap-0.5">
            <Heading size={14} />
            {state.heading > 0 && <span className="text-[10px] font-semibold">{state.heading}</span>}
          </span>
        }
        title="Heading"
        active={state.heading > 0}
        onClick={(e) => headingMenu(e.clientX, e.clientY)}
      />
      <Btn icon={<List size={14} />} title={tip("Bullet list", "markdown.Bullet list")} active={state.bullet} onClick={() => c().toggleBulletList().run()} />
      <Btn icon={<ListOrdered size={14} />} title={tip("Numbered list", "markdown.Numbered list")} active={state.ordered} onClick={() => c().toggleOrderedList().run()} />
      <Btn icon={<ListChecks size={14} />} title={tip("Task list", "markdown.Task list")} active={state.task} onClick={() => c().toggleTaskList().run()} />
      <Btn icon={<Quote size={14} />} title={tip("Blockquote", "markdown.Blockquote")} active={state.quote} onClick={() => c().toggleBlockquote().run()} />
      <Btn icon={<MessageSquareWarning size={14} />} title="Callout" active={Boolean(state.callout)} onClick={(e) => calloutMenu(e.clientX, e.clientY)} />
      <Btn icon={<SquareCode size={14} />} title={tip("Code block", "markdown.Code block")} active={state.codeBlock} onClick={() => c().toggleCodeBlock({ language: codeLanguage() }).run()} />
      <Btn icon={<Minus size={14} />} title={tip("Divider", "markdown.Divider")} onClick={() => c().setHorizontalRule().run()} />
      <Sep />
      <Btn icon={<TableIcon size={14} />} title="Table" active={state.table} onClick={(e) => tableMenu(e.clientX, e.clientY)} />
      <Btn icon={<ImageIcon size={14} />} title="Image" onClick={onImage} />
      <Btn
        icon={<Smile size={14} />}
        title={tip("Emoji", "app.emoji")}
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onEmoji(r.left, r.bottom + 4);
        }}
      />
    </div>
  );
}

function Btn({ icon, title, active, onClick }: { icon: React.ReactNode; title: string; active?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      className={clsx("flex h-6 min-w-6 items-center justify-center rounded px-1 hover:bg-hover hover:text-fg", active && "bg-active text-fg")}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

function Sep() {
  return <span className="mx-1 h-4 w-px bg-line" />;
}
