// The notes a new notes folder starts with (Rust writes them only into a
// folder that has never had a note or notebook file, so they don't come back
// once deleted). "How to use Notes" shows every block the editor makes, in
// the Markdown it's saved as.
import { wording } from "../lib/platform";
import { ymd } from "../tasks/dates";

export const WELCOME = "Welcome to Notes";
export const GUIDE = "How to use Notes";

export function welcomeNotes(now = new Date()): [string, string][] {
  const today = ymd(now);
  const welcome = `Notes is where your writing lives in Project Life. Every note is a plain Markdown file on this PC, so it opens in any other app too, and nothing here needs an account or the internet.

> [!info] **Start here**
> Open **How to use Notes** in the notebook on the left for a tour of every block you can make and every way to format text. It's a normal note, so try things out right in it.

## A few things to try

- [ ] Press **Ctrl N** for a new note, then type its title at the top
- [ ] Type **/** at the start of a line to add a heading, a list, a table, a callout and more
- [ ] Press **Ctrl /** to see this note as plain Markdown, then again to come back
- [ ] Right-click a note in the notebook to pin it, tag it, or tuck it inside another note
- [ ] Press **Ctrl P** to jump to any note by name

## Where things are

| Where | What it's for |
| --- | --- |
| The notebook, on the left | Your notes, pinned notes, notebooks inside notebooks, and tags |
| The tabs, along the top | The notes you have open. They're still open next time. |
| On this page, on the right | Every heading in the note. Click one to jump to it. |
| Details, on the right | Words, to-dos done, when it was made and edited, and where the file is |

Everything saves as you type. The dot in the bar at the bottom tells you when it has.
`;

  const guide = `This note is a tour: everything below is a real block you can click into, change, copy or delete. Type **/** anywhere to add more.

<!-- toc -->
<!-- /toc -->

## Formatting text

Select some text and use a shortcut, or type the Markdown around it and it turns into formatting as you go:

- **Bold**: Ctrl B, or \`**bold**\`
- *Italic*: Ctrl I, or \`*italic*\`
- <u>Underline</u>: Ctrl U
- ~~Strikethrough~~: Ctrl Shift X, or \`~~struck~~\`
- \`Inline code\`: Ctrl E, or put it between backticks
- ||A spoiler||: Ctrl Shift P, or \`||hidden||\`. It stays blurred until you click it.
- [A link](https://tauri.app): Ctrl K, or \`[text](address)\`. Ctrl+click a link to open it.

It works whichever way you type: the marks first and then the words between them, or on keyboards where the backtick and tilde are dead keys.

## Headings

Type **#**, **##** or **###** and a space at the start of a line, or press Ctrl 1, Ctrl 2 or Ctrl 3. Ctrl 0 turns a heading back into plain text. Headings show up in **On this page** on the right, and in the contents at the top of this note.

## Lists

- A bullet list: start a line with **-** and a space
- Press Tab to indent
  - like this
- Shift Tab to come back out

1. A numbered list: start with **1.** and a space
2. It keeps count for you

- [ ] A to-do list: start with \`[]\` and a space, or press Ctrl Shift 9
- [x] Click the box to tick one off

## Quotes

> Start a line with \`>\` and a space for a quote. Ctrl Shift B works too.

## Callouts

Callouts make a line stand out. Type \`> [!info]\` and a space, or pick one from the / menu.

> [!info] **Info**
> For tips and things worth knowing.

> [!notification] **Notification**
> For news and reminders.

> [!alert] **Alert**
> For things to be careful about.

> [!success] **Success**
> For wins and things that are done.

> [!emergency] **Emergency**
> For the things that really can't wait.

## Code

Type three backticks and press Enter for a code block. Click the language in its corner to change how it's colored.

\`\`\`javascript
function greet(name) {
  return \`Hi, \${name}!\`;
}
\`\`\`

## Tables

Type a row like **| Day | Plan |** and press Enter, or pick Table from the / menu. Right-click a table to add or remove rows and columns, or to line up the text in the cells you've selected.

| Day | Plan | Done |
| --- | --- | --- |
| Monday | Write the outline | Yes |
| Tuesday | First draft | Not yet |

## Dates

Type **/date** to pick a day (and a time, if you like) from a calendar, **/today** for today, or **/now** for right now. Click a date to change it: <time datetime="${today}">today</time>

## Pictures, links and emoji

- **Pictures**: paste one, drop a file onto the page, or pick **Image** from the / menu. They're saved in the notes folder, beside your notes.
- **Link previews**: point at a link for a moment to see the page's picture, title and description, with buttons to copy the link or open it in the browser.
- **Smart links**: paste or type a web address and it turns into a chip with the site's icon and the page's title. Ctrl Z puts the address back. Right-click one and pick **Display as** to show it as the address, a chip, a card, or (for YouTube) a video that plays right in the note.
- **Emoji**: type **:** and a word, like :tada, and pick from the list, or press **Ctrl ;** for all of them ✨
- **Note icons**: point at the top of a note and choose **Add icon** to give it an emoji. It shows beside the note's name in the notebook and tabs.

https://tauri.app

## Dividers

Type **---** on a line of its own for a divider, or press Ctrl Shift Enter.

---

## Moving blocks around

Hover over any block to see its handle at the left. Drag the handle to move the block, or click it to turn the block into something else, duplicate it or delete it. **Alt Up** and **Alt Down** move the block you're in.

## Organizing your notes

- **Pin** a note to keep it at the top of the notebook: the pin button on the note, or Ctrl Alt P.
- **Notebooks**: drag a note onto another to tuck it inside, or press Alt Shift Right. A note with notes inside it folds open and closed.
- **Tags**: right-click a note, choose Tags, and pick or make one. Click a tag at the bottom of the notebook to see only those notes.
- **Priority**: right-click a note and choose Priority. High-priority notes show a dot and have their own filter.
- **Several at once**: Ctrl+click notes to pick them, Shift+click to pick a run, or Ctrl A with the pointer over the notebook. Then right-click to pin, tag or set priority on all of them, or press Delete to recycle them.
- **Recycle Bin**: recycled notes wait there until you restore them or empty it.

## Keyboard shortcuts

| Shortcut | What it does |
| --- | --- |
| Ctrl N | New note |
| Ctrl Alt N | New note inside this one |
| Ctrl P | Jump to a note |
| Ctrl T | Open a note in a new tab |
| Ctrl W | Close the tab |
| Ctrl Tab | Next tab |
| Ctrl / | Switch between Visual and Markdown |
| Ctrl S | Save now (it saves as you type anyway) |
| F2 | Rename the note |
| Ctrl Alt P | Pin or unpin the note |
| Alt Shift ↑ ↓ | Move the note up or down in the notebook |
| Ctrl O | Import Markdown files |
| Ctrl Shift E | Export this note |
`;

  return [
    [WELCOME, wording(welcome)],
    [GUIDE, wording(guide)],
  ];
}
