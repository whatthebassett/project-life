import type { Editor } from "@tiptap/core";
import { codeLanguage } from "./code";
import { moveBlockBy } from "./blocks";

export interface FormattingContext {
  onLink: () => void;
}

// What each Formatting shortcut does in the Visual editor.
export const formatting: Record<string, (editor: Editor, ctx: FormattingContext) => void> = {
  "markdown.Bold": (e) => e.chain().focus().toggleBold().run(),
  "markdown.Italic": (e) => e.chain().focus().toggleItalic().run(),
  "markdown.Underline": (e) => e.chain().focus().toggleUnderline().run(),
  "markdown.Strikethrough": (e) => e.chain().focus().toggleStrike().run(),
  "markdown.Inline code": (e) => e.chain().focus().toggleCode().run(),
  "markdown.Spoiler": (e) => e.chain().focus().toggleSpoiler().run(),
  "markdown.Link": (_e, ctx) => ctx.onLink(),
  "markdown.Paragraph": (e) => e.chain().focus().setParagraph().run(),
  "markdown.Heading 1": (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  "markdown.Heading 2": (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  "markdown.Heading 3": (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  "markdown.Heading 4": (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
  "markdown.Heading 5": (e) => e.chain().focus().toggleHeading({ level: 5 }).run(),
  "markdown.Heading 6": (e) => e.chain().focus().toggleHeading({ level: 6 }).run(),
  "markdown.Bullet list": (e) => e.chain().focus().toggleBulletList().run(),
  "markdown.Numbered list": (e) => e.chain().focus().toggleOrderedList().run(),
  "markdown.Task list": (e) => e.chain().focus().toggleTaskList().run(),
  "markdown.Blockquote": (e) => e.chain().focus().toggleBlockquote().run(),
  "markdown.Code block": (e) => e.chain().focus().toggleCodeBlock({ language: codeLanguage() }).run(),
  "markdown.Table": (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  "markdown.Divider": (e) => e.chain().focus().setHorizontalRule().run(),
  "markdown.Info": (e) => e.chain().focus().setCallout("info").run(),
  "markdown.Notification": (e) => e.chain().focus().setCallout("notification").run(),
  "markdown.Alert": (e) => e.chain().focus().setCallout("alert").run(),
  "markdown.Success": (e) => e.chain().focus().setCallout("success").run(),
  "markdown.Emergency": (e) => e.chain().focus().setCallout("emergency").run(),
  "block.up": (e) => moveBlockBy(e, -1),
  "block.down": (e) => moveBlockBy(e, 1),
};
