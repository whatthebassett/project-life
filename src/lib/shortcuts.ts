// Every command that can have a keyboard shortcut. The ids match earlier
// versions of Noted, so shortcuts saved in appearance.json carry over.
// Settings.Shortcuts holds only the ones the writer changed; "" means none.

// Everywhere: App's own (they work on any screen). Notes and Tabs: the Notes
// screen's. Formatting: inside a note, so Ctrl+K and Ctrl+E can mean one
// thing in a note and another everywhere else.
export type ShortcutGroup = "Everywhere" | "Notes" | "Tabs" | "Formatting";

export interface ShortcutCommand {
  id: string;
  name: string;
  group: ShortcutGroup;
  keys: string;
}

export const shortcutCommands: ShortcutCommand[] = [
  // Adding a task, note or event, opening a note (here or in a new tab), and
  // every command: one palette.
  { id: "app.capture", name: "Command palette", group: "Everywhere", keys: "Ctrl+T" },
  { id: "app.home", name: "Go to Home", group: "Everywhere", keys: "Alt+Home" },
  { id: "app.settings", name: "Settings", group: "Everywhere", keys: "Ctrl+," },
  { id: "app.guide", name: "Guide", group: "Everywhere", keys: "F1" },
  { id: "app.newEvent", name: "New event", group: "Everywhere", keys: "Ctrl+E" },
  { id: "app.larger", name: "Larger text", group: "Everywhere", keys: "Ctrl+=" },
  { id: "app.smaller", name: "Smaller text", group: "Everywhere", keys: "Ctrl+-" },
  { id: "app.new", name: "New note", group: "Notes", keys: "Ctrl+N" },
  { id: "app.newPage", name: "New page inside", group: "Notes", keys: "Ctrl+Alt+N" },
  { id: "app.movePage", name: "Move note to…", group: "Notes", keys: "" },
  { id: "app.noteUp", name: "Move note up", group: "Notes", keys: "Alt+Shift+Up" },
  { id: "app.noteDown", name: "Move note down", group: "Notes", keys: "Alt+Shift+Down" },
  { id: "app.noteIn", name: "Put note inside the one above", group: "Notes", keys: "Alt+Shift+Right" },
  { id: "app.noteOut", name: "Take note out of its notebook", group: "Notes", keys: "Alt+Shift+Left" },
  { id: "app.rename", name: "Rename note", group: "Notes", keys: "F2" },
  { id: "app.pin", name: "Pin or unpin note", group: "Notes", keys: "Ctrl+Alt+P" },
  { id: "app.save", name: "Save now", group: "Notes", keys: "Ctrl+S" },
  { id: "app.reload", name: "Reload from disk", group: "Notes", keys: "" },
  { id: "app.import", name: "Import Markdown", group: "Notes", keys: "Ctrl+O" },
  { id: "app.export", name: "Export note", group: "Notes", keys: "Ctrl+Shift+E" },
  { id: "app.exportAll", name: "Export all notes", group: "Notes", keys: "" },
  { id: "app.notesFolder", name: "Open notes folder", group: "Notes", keys: "" },
  { id: "app.recycle", name: "Recycle note", group: "Notes", keys: "" },
  { id: "app.delete", name: "Delete permanently", group: "Notes", keys: "" },
  { id: "app.bin", name: "Recycle Bin", group: "Notes", keys: "" },
  { id: "app.tag", name: "New tag", group: "Notes", keys: "" },
  { id: "app.tags", name: "Manage tags", group: "Notes", keys: "" },
  { id: "app.mode", name: "Switch Visual / Markdown", group: "Notes", keys: "Ctrl+/" },
  { id: "app.sidebar", name: "Show or hide the notebook", group: "Notes", keys: "Ctrl+\\" },
  { id: "app.details", name: "Show or hide About this note", group: "Notes", keys: "Ctrl+Shift+\\" },
  { id: "app.wrap", name: "Word wrap (Markdown mode)", group: "Notes", keys: "" },
  { id: "app.lines", name: "Line numbers (Markdown mode)", group: "Notes", keys: "" },

  { id: "app.closeTab", name: "Close tab", group: "Tabs", keys: "Ctrl+W" },
  { id: "app.closeOtherTabs", name: "Close other tabs", group: "Tabs", keys: "" },
  { id: "app.nextTab", name: "Next tab", group: "Tabs", keys: "Ctrl+Tab" },
  { id: "app.previousTab", name: "Previous tab", group: "Tabs", keys: "Ctrl+Shift+Tab" },
  { id: "app.moveTabLeft", name: "Move tab left", group: "Tabs", keys: "Ctrl+Shift+PageUp" },
  { id: "app.moveTabRight", name: "Move tab right", group: "Tabs", keys: "Ctrl+Shift+PageDown" },

  { id: "markdown.Bold", name: "Bold", group: "Formatting", keys: "Ctrl+B" },
  { id: "markdown.Italic", name: "Italic", group: "Formatting", keys: "Ctrl+I" },
  { id: "markdown.Underline", name: "Underline", group: "Formatting", keys: "Ctrl+U" },
  { id: "markdown.Strikethrough", name: "Strikethrough", group: "Formatting", keys: "Ctrl+Shift+X" },
  { id: "markdown.Inline code", name: "Inline code", group: "Formatting", keys: "Ctrl+E" },
  { id: "markdown.Spoiler", name: "Spoiler", group: "Formatting", keys: "Ctrl+Shift+P" },
  { id: "markdown.Link", name: "Link", group: "Formatting", keys: "Ctrl+K" },
  { id: "app.emoji", name: "Emoji…", group: "Formatting", keys: "Ctrl+;" },
  { id: "markdown.Paragraph", name: "Paragraph", group: "Formatting", keys: "Ctrl+0" },
  { id: "markdown.Heading 1", name: "Heading 1", group: "Formatting", keys: "Ctrl+1" },
  { id: "markdown.Heading 2", name: "Heading 2", group: "Formatting", keys: "Ctrl+2" },
  { id: "markdown.Heading 3", name: "Heading 3", group: "Formatting", keys: "Ctrl+3" },
  { id: "markdown.Heading 4", name: "Heading 4", group: "Formatting", keys: "Ctrl+4" },
  { id: "markdown.Heading 5", name: "Heading 5", group: "Formatting", keys: "Ctrl+5" },
  { id: "markdown.Heading 6", name: "Heading 6", group: "Formatting", keys: "Ctrl+6" },
  { id: "markdown.Bullet list", name: "Bullet list", group: "Formatting", keys: "Ctrl+Shift+8" },
  { id: "markdown.Numbered list", name: "Numbered list", group: "Formatting", keys: "Ctrl+Shift+7" },
  { id: "markdown.Task list", name: "Task list", group: "Formatting", keys: "Ctrl+Shift+9" },
  { id: "markdown.Blockquote", name: "Blockquote", group: "Formatting", keys: "Ctrl+Shift+B" },
  { id: "markdown.Code block", name: "Code block", group: "Formatting", keys: "Ctrl+Shift+C" },
  { id: "markdown.Table", name: "Table", group: "Formatting", keys: "" },
  { id: "markdown.Divider", name: "Divider", group: "Formatting", keys: "Ctrl+Shift+Enter" },
  { id: "block.up", name: "Move block up", group: "Formatting", keys: "Alt+Up" },
  { id: "block.down", name: "Move block down", group: "Formatting", keys: "Alt+Down" },
  { id: "markdown.Info", name: "Info callout", group: "Formatting", keys: "" },
  { id: "markdown.Notification", name: "Notification callout", group: "Formatting", keys: "" },
  { id: "markdown.Alert", name: "Alert callout", group: "Formatting", keys: "" },
  { id: "markdown.Success", name: "Success callout", group: "Formatting", keys: "" },
  { id: "markdown.Emergency", name: "Emergency callout", group: "Formatting", keys: "" },
];

const byId = new Map(shortcutCommands.map((c) => [c.id, c]));

const codeNames: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Tab: "Tab",
  Space: "Space",
  Backspace: "Back",
  Delete: "Delete",
  Escape: "Esc",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Home: "Home",
  End: "End",
  Insert: "Insert",
  NumpadAdd: "Add",
  NumpadSubtract: "Subtract",
};

// The shortcut a key press makes, in Noted's "Ctrl+Shift+Alt+Key" form, or
// null for a lone modifier. Physical keys, so Shift+7 stays "7".
export function keyOf(e: KeyboardEvent): string | null {
  const c = e.code;
  let key: string | undefined;
  if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
  else if (/^Digit\d$/.test(c)) key = c.slice(5);
  else if (/^Numpad\d$/.test(c)) key = c.slice(6);
  else if (/^F\d{1,2}$/.test(c)) key = c;
  else key = codeNames[c];
  if (!key) return null;
  return (e.ctrlKey ? "Ctrl+" : "") + (e.shiftKey ? "Shift+" : "") + (e.altKey ? "Alt+" : "") + key;
}

const aliases: Record<string, string> = { escape: "Esc", backspace: "Back", return: "Enter", pgup: "PageUp", pgdn: "PageDown", plus: "=" };

// Any saved spelling ("ctrl+alt+n", "Alt+Ctrl+N") to the canonical form.
export function normalizeKeys(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  // The last "+" separates the key, which may itself be "+"-free punctuation.
  const parts = t.split("+").map((p) => p.trim());
  let key = parts.pop();
  if (key === "" && parts.length && parts[parts.length - 1] === "") {
    parts.pop();
    key = "=";
  }
  if (!key) return null;
  const mods = new Set<string>();
  for (const part of parts) {
    const m = part.toLowerCase();
    if (m === "ctrl" || m === "control") mods.add("Ctrl");
    else if (m === "shift") mods.add("Shift");
    else if (m === "alt") mods.add("Alt");
    else return null;
  }
  key = aliases[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  return (mods.has("Ctrl") ? "Ctrl+" : "") + (mods.has("Shift") ? "Shift+" : "") + (mods.has("Alt") ? "Alt+" : "") + key;
}

export function defaultKeys(id: string): string {
  return normalizeKeys(byId.get(id)?.keys ?? "") ?? "";
}

export function keysFor(id: string, overrides?: Record<string, string>): string {
  const saved = overrides?.[id];
  if (saved !== undefined) {
    if (saved === "") return "";
    const n = normalizeKeys(saved);
    if (n) return n;
  }
  return defaultKeys(id);
}

// Shortcut → command id, for everything that has one (or just some groups).
export function keyMap(overrides?: Record<string, string>, groups?: ShortcutGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of shortcutCommands) {
    if (groups && !groups.includes(c.group)) continue;
    const k = keysFor(c.id, overrides);
    if (k && !map.has(k)) map.set(k, c.id);
  }
  return map;
}

// Formatting defaults, so the editor's built-in bindings for a command the
// writer moved elsewhere stop working too.
export const formattingDefaults = new Set(
  shortcutCommands.filter((c) => c.group === "Formatting").map((c) => defaultKeys(c.id)).filter(Boolean),
);

// Two commands can share keys only when one works inside a note and the
// other everywhere else.
export function clashes(a: ShortcutGroup, b: ShortcutGroup): boolean {
  const pair = new Set([a, b]);
  return !(pair.has("Everywhere") && pair.has("Formatting") && a !== b);
}

// A recorded shortcut must be distinctive enough not to swallow typing.
export function isAssignable(keys: string): boolean {
  return /(^|\+)(Ctrl|Alt)\+/.test(keys) || /(^|\+)F\d{1,2}$/.test(keys);
}
