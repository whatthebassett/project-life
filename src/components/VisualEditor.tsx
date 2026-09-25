import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableRow } from "@tiptap/extension-table-row";
import { CellSelection } from "@tiptap/pm/tables";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorSpot } from "../lib/positions";
import { NotedTable, NotedTableCell, NotedTableHeader } from "../editor/tables";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { open as openFile } from "@tauri-apps/plugin-dialog";
import clsx from "clsx";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CircleCheck,
  Clock,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Info,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Siren,
  Smile,
  SquareCode,
  Table2,
  TableOfContents as TableOfContentsIcon,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { api, openUrl } from "../lib/api";
import { Callout } from "../editor/callout";
import { Spoiler } from "../editor/spoiler";
import { SlashCommands, type SlashState } from "../editor/slash";
import { LinkCards, refreshLinkCards } from "../editor/linkCards";
import { NotedImage, insertDataImages, insertImageFiles } from "../editor/images";
import { NotedCodeBlock } from "../editor/code";
import { NotedUnderline } from "../editor/underline";
import { Caret, type CaretConfig } from "../editor/caret";
import { TaskLinks, taskLinksKey, todoText, type TodoLink } from "../editor/taskLinks";
import { formatting } from "../editor/formatting";
import { formattingDefaults, keyOf } from "../lib/shortcuts";
import { EmojiSuggest, type EmojiSuggestState } from "../editor/emoji";
import { EmojiGlyphs } from "../editor/emojiGlyphs";
import { BlockLook } from "../editor/blocks";
import { DateTime, nowAttrs, type DateTimeAttrs } from "../editor/dateTime";
import { TableOfContents } from "../editor/toc";
import { LinePlaceholder } from "../editor/placeholder";
import { MarkdownShortcuts } from "../editor/markdownShortcuts";
import Calendar from "../tasks/Calendar";
import BlockHandle from "./BlockHandle";
import { nativeOf } from "../lib/emoji";
import { tableMenuItems } from "./Toolbar";
import Dialog, { Button, Field, inputClass } from "./Dialog";
import type { MenuItem } from "./ContextMenu";

interface Props {
  initial: string;
  readable: boolean;
  caret: CaretConfig;
  // Shortcut → command id, from Settings.
  keys: Map<string, string>;
  keyFor: (id: string) => string;
  onChange: (markdown: string) => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  // Open the emoji picker at the cursor (the / menu's Emoji).
  onEmoji: () => void;
  onEditor?: (editor: Editor | null) => void;
  // The note's cover and title, scrolling with the text above it.
  header?: React.ReactNode;
  // Settings → Editing → Link previews.
  linkPreviews: boolean;
  // Where the cursor and scroll were last time (read once, on mount), and
  // where they are now as they change.
  spot?: EditorSpot;
  onSpot?: (spot: EditorSpot) => void;
  // For a toolbar outside the editor (the task pop-up's): the link dialog and
  // the picture picker.
  commands?: React.RefObject<EditorCommands | null>;
  // To-dos sent to Tasks: their chips, what a chip opens, and what
  // right-clicking a to-do offers (Send to Tasks).
  todoLinks?: Map<string, TodoLink>;
  onOpenTodo?: (taskId: string) => void;
  todoMenu?: (todo: { text: string; checked: boolean }) => MenuItem[];
}

export interface EditorCommands {
  link: () => void;
  image: () => void;
}

// The formatted editor. Mount it with a key per note: it takes the note's
// Markdown once and reports Markdown back on every change.
export default function VisualEditor({ initial, readable, caret, keys, keyFor, onChange, openMenu, onEmoji, onEditor, header, linkPreviews, spot, onSpot, commands, todoLinks, onOpenTodo, todoMenu }: Props) {
  const todoLinksRef = useRef(todoLinks);
  todoLinksRef.current = todoLinks;
  const onOpenTodoRef = useRef(onOpenTodo);
  onOpenTodoRef.current = onOpenTodo;
  const todoMenuRef = useRef(todoMenu);
  todoMenuRef.current = todoMenu;
  const [slash, setSlash] = useState<SlashState | null>(null);
  const [emoji, setEmoji] = useState<EmojiSuggestState | null>(null);
  const [linkDialog, setLinkDialog] = useState<{ href: string } | null>(null);
  // The calendar for a date chip: a new one at the cursor (pos null), or the
  // chip at pos being changed.
  const [datePick, setDatePick] = useState<{ pos: number | null; attrs: DateTimeAttrs | null; anchor: DOMRect } | null>(null);
  const slashRef = useRef<SlashState | null>(null);
  slashRef.current = slash;
  // Settings can change while a note is open; the editor reads these live.
  const caretRef = useRef(caret);
  caretRef.current = caret;
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const linkPreviewsRef = useRef(linkPreviews);
  linkPreviewsRef.current = linkPreviews;
  const onEmojiRef = useRef(onEmoji);
  onEmojiRef.current = onEmoji;
  const startSpot = useRef(spot);
  const onSpotRef = useRef(onSpot);
  onSpotRef.current = onSpot;
  // The note's scroller, and the box its blocks sit in, for the block handles.
  const scroller = useRef<HTMLDivElement>(null);
  const blocksBox = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
        codeBlock: false,
        underline: false,
      }),
      NotedCodeBlock,
      NotedUnderline,
      Caret.configure({ config: () => caretRef.current }),
      Markdown,
      NotedTable.configure({ resizable: true, cellMinWidth: 120 }),
      TableRow,
      NotedTableHeader,
      NotedTableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      NotedImage.configure({ inline: false, allowBase64: false }),
      Callout,
      Spoiler,
      DateTime,
      TableOfContents,
      MarkdownShortcuts,
      // Grey hints where the cursor is (never saved): what an empty note can
      // do, then what fits the line at hand.
      LinePlaceholder.configure({
        placeholder: ({ editor, node, pos }) => {
          if (editor.isEmpty) return "Start writing, or type / to add headings, lists, tables, callouts and more. Type : for emoji.";
          if (node.type.name === "heading") return `Heading ${node.attrs.level}`;
          if (node.type.name !== "paragraph") return "";
          switch (editor.state.doc.resolve(pos).parent.type.name) {
            case "taskItem":
              return "To-do";
            case "listItem":
              return "List item";
            case "blockquote":
              return "Quote";
            case "callout":
              return "Callout";
            case "tableCell":
            case "tableHeader":
              return "";
            default:
              return "Type / for commands";
          }
        },
      }),
      EmojiSuggest.configure({ onState: setEmoji }),
      EmojiGlyphs,
      BlockLook,
      SlashCommands.configure({
        onState: setSlash,
        onLink: () => openLinkDialog(),
        onImage: () => void pickImage(),
        onDate: () => openDatePicker(),
        onEmoji: () => onEmojiRef.current(),
      }),
      TaskLinks.configure({ links: () => todoLinksRef.current ?? new Map(), open: (id) => onOpenTodoRef.current?.(id) }),
      LinkCards.configure({ fetch: api.fetchLinkPreview, open: (url) => void openUrl(url), enabled: () => linkPreviewsRef.current }),
    ],
    content: initial,
    contentType: "markdown",
    autofocus: false,
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    editorProps: {
      // Formatting shortcuts come from Settings. These props run before the
      // extensions' own keymaps, so a default the writer moved elsewhere is
      // swallowed here rather than still toggling its old format.
      handleKeyDown: (_view, event) => {
        const k = keyOf(event);
        if (!k || !editorRef.current) return false;
        const id = keysRef.current.get(k);
        const run = id ? formatting[id] : undefined;
        if (run) {
          run(editorRef.current, { onLink: () => openLinkDialog() });
          return true;
        }
        return !id && formattingDefaults.has(k);
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.some((f) => f.type.startsWith("image/"))) {
          void insertImageFiles(editorRef.current!, files);
          return true;
        }
        // Images copied from a web page can arrive as inline data URLs.
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (/<img[^>]+src=["']data:image\//i.test(html)) {
          void insertDataImages(editorRef.current!, html);
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (moved || !files.some((f) => f.type.startsWith("image/"))) return false;
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void insertImageFiles(editorRef.current!, files, pos);
        return true;
      },
      handleDOMEvents: {
        // Right-clicking inside a group of selected table cells keeps them
        // selected, so the table menu (alignment and the rest) changes them
        // all. Otherwise the browser drops the cursor where you clicked first.
        mousedown: (view, event) => {
          if (event.button !== 2 || !(view.state.selection instanceof CellSelection)) return false;
          if (!(event.target as HTMLElement | null)?.closest?.(".selectedCell")) return false;
          event.preventDefault();
          return true;
        },
      },
      // Clicking a date chip opens its calendar.
      handleClickOn: (view, _pos, node, nodePos, _event, direct) => {
        if (!direct || node.type.name !== "dateTime") return false;
        const el = view.nodeDOM(nodePos) as HTMLElement | null;
        if (!el) return false;
        const r = el.getBoundingClientRect();
        setDatePick({ pos: nodePos, attrs: node.attrs as DateTimeAttrs, anchor: new DOMRect(r.left, r.top, CALENDAR_WIDTH, r.height) });
        return true;
      },
      // Ctrl+click opens a link in the browser.
      handleClick: (view, pos, event) => {
        if (!event.ctrlKey) return false;
        const link = view.state.doc.resolve(pos).marks().find((m) => m.type.name === "link");
        if (!link) return false;
        void openUrl(link.attrs.href);
        return true;
      },
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => {
    if (editor && !editor.isDestroyed) refreshLinkCards(editor.view);
  }, [editor, linkPreviews]);

  // Back to where you were: the cursor, then the scroll once the page has
  // laid out (again a moment later, as pictures and link cards arrive, unless
  // you've started scrolling). Then keep track as you go.
  useEffect(() => {
    if (!editor) return;
    const box = scroller.current;
    const saved = startSpot.current;
    let moved = false;
    const timers: number[] = [];
    if (saved) {
      const { doc } = editor.state;
      const at = (n: number) => doc.resolve(Math.max(0, Math.min(n, doc.content.size)));
      try {
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.between(at(saved.anchor), at(saved.head))));
      } catch {
        // The note changed shape since; it opens at the top.
      }
      const scroll = () => {
        if (box && !moved) box.scrollTop = saved.scroll;
      };
      timers.push(window.requestAnimationFrame(() => {
        scroll();
        editor.commands.focus(undefined, { scrollIntoView: false });
      }));
      timers.push(window.setTimeout(scroll, 350));
    }
    const report = () => {
      if (editor.isDestroyed) return;
      const { anchor, head } = editor.state.selection;
      onSpotRef.current?.({ anchor, head, scroll: box?.scrollTop ?? 0 });
    };
    const userScrolled = () => (moved = true);
    editor.on("selectionUpdate", report);
    box?.addEventListener("scroll", report, { passive: true });
    box?.addEventListener("wheel", userScrolled, { passive: true });
    box?.addEventListener("keydown", userScrolled);
    return () => {
      timers.forEach((t) => (window.cancelAnimationFrame(t), window.clearTimeout(t)));
      editor.off("selectionUpdate", report);
      box?.removeEventListener("scroll", report);
      box?.removeEventListener("wheel", userScrolled);
      box?.removeEventListener("keydown", userScrolled);
    };
  }, [editor]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  const openLinkDialog = useCallback(() => {
    const e = editorRef.current;
    if (!e) return;
    setLinkDialog({ href: (e.getAttributes("link").href as string | undefined) ?? "" });
  }, []);

  const applyLink = (href: string) => {
    const e = editorRef.current;
    setLinkDialog(null);
    if (!e) return;
    const url = href.trim();
    if (!url) {
      e.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const full = /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("#") ? url : `https://${url}`;
    if (e.state.selection.empty && !e.isActive("link")) {
      e.chain().focus().insertContent({ type: "text", text: full, marks: [{ type: "link", attrs: { href: full } }] }).run();
    } else {
      e.chain().focus().extendMarkRange("link").setLink({ href: full }).run();
    }
  };

  // A new date goes where the cursor is; the calendar opens just below it.
  const openDatePicker = useCallback(() => {
    const e = editorRef.current;
    if (!e) return;
    const at = e.view.coordsAtPos(e.state.selection.from);
    setDatePick({ pos: null, attrs: null, anchor: new DOMRect(at.left, at.top, CALENDAR_WIDTH, at.bottom - at.top) });
  }, []);

  const applyDate = (attrs: DateTimeAttrs | null) => {
    const e = editorRef.current;
    const target = datePick;
    setDatePick(null);
    if (!e || !target) return;
    if (target.pos === null) {
      if (attrs) e.chain().focus().insertDateTime(attrs).run();
      else e.commands.focus();
      return;
    }
    const pos = target.pos;
    if (e.state.doc.nodeAt(pos)?.type.name !== "dateTime") return;
    e.chain()
      .focus()
      .command(({ tr }) => {
        if (attrs) tr.setNodeMarkup(pos, undefined, attrs);
        else tr.delete(pos, pos + 1);
        return true;
      })
      .run();
  };

  const pickImage = async () => {
    const path = await openFile({
      multiple: false,
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"] }],
    });
    if (typeof path !== "string" || !editorRef.current) return;
    const src = await api.importAsset(path);
    editorRef.current.chain().focus().setImage({ src, alt: "" }).run();
  };

  useEffect(() => {
    if (!commands) return;
    commands.current = { link: openLinkDialog, image: () => void pickImage() };
    return () => {
      commands.current = null;
    };
  });

  // Tasks changed: redraw the to-do chips.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(taskLinksKey, true));
  }, [editor, todoLinks]);

  // Right-click inside a table gets the table menu; on a to-do, the to-do's.
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    const onContext = (e: MouseEvent) => {
      const at = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const menu = todoMenuRef.current;
      if (at && menu) {
        const $pos = editor.state.doc.resolve(at.pos);
        for (let d = $pos.depth; d > 0; d--) {
          const node = $pos.node(d);
          if (node.type.name !== "taskItem") continue;
          const text = todoText(node);
          if (!text) break;
          e.preventDefault();
          openMenu(e.clientX, e.clientY, menu({ text, checked: Boolean(node.attrs.checked) }));
          return;
        }
      }
      if (!editor.isActive("table")) return;
      e.preventDefault();
      openMenu(e.clientX, e.clientY, tableMenuItems(editor));
    };
    el.addEventListener("contextmenu", onContext);
    return () => el.removeEventListener("contextmenu", onContext);
  }, [editor, openMenu]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className={clsx("noted-editor min-h-0 flex-1 overflow-y-auto", readable && "readable")}>
        {header}
        <div ref={blocksBox} className="relative px-10 pb-6">
          <EditorContent editor={editor} className="relative" />
          <BlockHandle editor={editor} wrapper={blocksBox} scroller={scroller} openMenu={openMenu} keyFor={keyFor} />
        </div>
      </div>

      {slash && slash.rect && <SlashMenu state={slash} />}
      {emoji && emoji.rect && <EmojiMenu state={emoji} />}

      {linkDialog && <LinkDialog href={linkDialog.href} onApply={applyLink} onClose={() => setLinkDialog(null)} />}
      {datePick && (
        <Calendar
          anchor={datePick.anchor}
          value={datePick.attrs?.date ?? null}
          time={datePick.attrs?.time ?? null}
          onPick={(date, time) => applyDate({ date, time })}
          onNow={() => applyDate(nowAttrs(true))}
          onClear={datePick.pos === null ? undefined : () => applyDate(null)}
          clearLabel="Remove"
          onClose={() => {
            setDatePick(null);
            editorRef.current?.commands.focus();
          }}
        />
      )}
    </div>
  );
}

// Calendar.tsx's width, so it lines up with the chip or cursor's left edge.
const CALENDAR_WIDTH = 236;

// The "/" menu (Notes.dc.html): blocks to add, grouped, each with its icon
// and the Markdown (or slash word) that makes it. Keystrokes stay in the note,
// so typing after the slash searches and the arrows move; pointing at a row
// highlights it too.
const slashIcons: Record<string, LucideIcon> = {
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  table: Table2,
  code: SquareCode,
  quote: Quote,
  divider: Minus,
  toc: TableOfContentsIcon,
  bullet: List,
  numbered: ListOrdered,
  task: ListChecks,
  info: Info,
  notification: Bell,
  alert: TriangleAlert,
  success: CircleCheck,
  emergency: Siren,
  link: Link2,
  image: ImageIcon,
  emoji: Smile,
  date: CalendarDays,
  now: Clock,
  today: CalendarCheck,
};

// What you'd type instead, shown at the right of each row.
const slashHints: Record<string, string> = {
  h1: "#",
  h2: "##",
  h3: "###",
  table: "| |",
  code: "```",
  quote: ">",
  divider: "---",
  toc: "/toc",
  bullet: "-",
  numbered: "1.",
  task: "[]",
  info: "> [!info]",
  notification: "> [!note]",
  alert: "> [!alert]",
  success: "> [!success]",
  emergency: "> [!danger]",
  link: "Ctrl K",
  image: "/img",
  emoji: ":",
  date: "/date",
  now: "/now",
  today: "/today",
};

const SLASH_WIDTH = 340;
const SLASH_HEIGHT = 420;

function SlashMenu({ state }: { state: SlashState }) {
  const list = useRef<HTMLDivElement>(null);
  const rect = state.rect!;
  const grouped = !state.query;

  useEffect(() => {
    list.current?.querySelector(`[data-index="${state.index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [state.index, state.items]);

  // Below the cursor, or above it when there isn't room, anchored so the menu
  // stays attached to the line as the list gets shorter.
  const below = rect.bottom + 8;
  const above = window.innerHeight - below < Math.min(SLASH_HEIGHT, 260) && rect.top > window.innerHeight - below;
  const place: React.CSSProperties = above
    ? { bottom: window.innerHeight - rect.top + 8, maxHeight: Math.min(SLASH_HEIGHT, rect.top - 14) }
    : { top: below, maxHeight: Math.min(SLASH_HEIGHT, window.innerHeight - below - 8) };

  return (
    <div
      role="menu"
      aria-label="Insert block"
      className="slash-menu menu-drop fixed z-50 flex flex-col overflow-hidden rounded-[16px] border border-line bg-panel shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      style={{ left: Math.max(8, Math.min(rect.left - 10, window.innerWidth - SLASH_WIDTH - 8)), width: SLASH_WIDTH, ...place }}
    >
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-2">
        {state.query && state.items.length > 0 && (
          <div className="px-[10px] pt-1.5 pb-2 font-mono text-11 tracking-[0.12em] text-muted">
            {state.items.length} {state.items.length === 1 ? "MATCH" : "MATCHES"} FOR “{state.query.toUpperCase()}”
          </div>
        )}
        {state.items.map((item, i) => {
          const Icon = slashIcons[item.id] ?? Pilcrow;
          const active = i === state.index;
          const heading = grouped && item.group !== state.items[i - 1]?.group;
          return (
            <Fragment key={item.id}>
              {heading && <div className="px-[10px] pt-3 pb-2 font-mono text-11 tracking-[0.12em] text-muted uppercase first:pt-1.5">{item.group}</div>}
              <div
                role="menuitem"
                data-index={i}
                title={item.description}
                style={{ "--row": i, "--tint": item.tint } as React.CSSProperties}
                className={clsx("slash-row menu-drop-row flex h-11 cursor-default items-center gap-3 rounded-[10px] px-[10px]", active && "is-active")}
                onMouseMove={() => state.setIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  state.select(item);
                }}
              >
                <span className="slash-icon flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px]">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="slash-label min-w-0 flex-1 truncate text-14 font-medium">{item.label}</span>
                {slashHints[item.id] && <span className="shrink-0 font-mono text-11 text-muted">{slashHints[item.id]}</span>}
              </div>
            </Fragment>
          );
        })}
        {state.items.length === 0 && (
          <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-13 text-muted">
            <span>Nothing matches “{state.query}”</span>
            <span className="text-12">Press Esc to keep it as text.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Matches for ":query", best first. Keys stay in the note; Enter or Tab picks.
function EmojiMenu({ state }: { state: EmojiSuggestState }) {
  const list = useRef<HTMLDivElement>(null);
  const rect = state.rect!;
  const height = 280;

  useEffect(() => {
    list.current?.children[state.index]?.scrollIntoView({ block: "nearest" });
  }, [state.index, state.items]);

  return (
    <div
      className="menu-drop fixed z-50 flex w-72 flex-col rounded-lg border border-line text-[12.5px] shadow-xl"
      style={{ left: Math.min(rect.left, window.innerWidth - 296), top: Math.min(rect.bottom + 4, window.innerHeight - height - 8), maxHeight: height, background: "var(--menu)" }}
    >
      <div className="flex h-7 shrink-0 items-center gap-1.5 px-3 text-[11.5px] text-muted">
        Emoji matching <span className="font-mono text-fg">:{state.query}</span>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-1 pt-0">
        {state.items.map((e, i) => (
          <div
            key={e.id}
            style={{ "--row": i } as React.CSSProperties}
            className={clsx("menu-drop-row flex min-h-[30px] cursor-default items-center gap-2.5 rounded-md px-2 py-0.5", i === state.index && "bg-active")}
            onMouseDown={(ev) => {
              ev.preventDefault();
              state.select(e);
            }}
          >
            <span className="text-center leading-none" style={{ fontFamily: '"Segoe UI Emoji", sans-serif', fontSize: "var(--emoji-menu, 23px)", minWidth: "1.3em" }}>
              {nativeOf(e)}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[12px]">:{e.id}:</span>
            <span className="max-w-[45%] shrink truncate text-[11px] text-muted">{e.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkDialog({ href, onApply, onClose }: { href: string; onApply: (href: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(href);
  return (
    <Dialog
      title={href ? "Edit link" : "Add link"}
      width={380}
      onClose={onClose}
      footer={
        <>
          {href && (
            <Button danger onClick={() => onApply("")}>
              Remove
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button primary onClick={() => onApply(value)}>
            {href ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <Field label="Address">
        <input
          autoFocus
          className={inputClass}
          placeholder="https://"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onApply(value)}
        />
      </Field>
    </Dialog>
  );
}
