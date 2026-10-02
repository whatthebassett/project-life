# Changelog

## Lake Hylia (0.4.0 beta)

*October 2, 2026.* One command palette on Ctrl+T, in liquid glass; tags you can add from the note itself; US holidays built in; habits you can fill in after the fact.

### Features

#### Command palette

- Ctrl+T opens it from anywhere. It now does the jobs of Switch note (Ctrl+P), Open a note in a new tab and New task (Ctrl+Shift+T), which are retired; Ctrl+K is back to adding a link inside a note.
- Recent notes come first; typing searches note titles, with each note's notebook and when it was edited. Enter opens a note here, Ctrl+Enter (or Ctrl+click) in a new tab.
- A note titled exactly what you typed goes to the top; the + beside the note tabs opens the palette set to open notes in a new tab.
- A liquid glass look: the screen shows through a frosted pane with a lit rim, and the Task, Note and Event switch slides. It turns solid with high contrast or reduced transparency.

#### Notes

- Add tags from the note: click Add tag (or any tag, or the +) under the title to find tags, tick them on or off, or make a new one by typing its name.
- Manage tags is rebuilt: bigger, with your tags on the left and the one picked on the right to rename, recolor or delete, a live preview, and the notes that use it. Changes save as you make them.
- Tags show in their own color on the note.
- A note's icon sits beside its title instead of above it.
- The Edited line shows the full date and time; point at it for how long ago.
- The format bar's “Type / for blocks” is now an info button that shows how the / menu works.

#### Schedule

- A built-in US Holidays calendar: the federal holidays (and the weekday they're observed on), plus days like Valentine's Day, Easter, Halloween and the clock changes. Worked out on your PC, so it needs no link or internet.
- Right-click it to hide, recolor or remove it; + Add calendar brings it back.

#### Habits

- Fill in a day you forgot to tick: click any past day in a habit's week, in its history, or on Home's Habits card. Undo is in the message that follows.
- Right-click a habit for Mark yesterday done.

#### Home

- Click an event on the Schedule card to open it.

#### Everywhere

- Tooltips look like the rest of Project Life instead of Windows' plain ones, and show on keyboard focus too.

### Defect fixes

- **Home**: Up Next's countdown no longer runs into a divider line when it reaches three digits; the line is gone and the number has room.
- **Notes**: a long title no longer loses its second line when the note gets narrower.

### Known issues

- **Schedule**: US Holidays doesn't include holidays that follow other calendars, such as Hanukkah, Passover, Ramadan and Diwali.

## Zora's Domain (0.3.1 beta)

*September 27, 2026.* A fix for opening notes from File Explorer.

### Defect fixes

- **Notes**: opening a note from File Explorer (double-click, or Open with) now opens it in Notes, whether Project Life was running or not. A Markdown file outside your notes folder is imported as a copy and opened.

## Zora's Domain (0.3.0 beta)

*September 27, 2026.* A Home you can arrange, with sports and markets; a command palette; smart links and a format bar in Notes; calendars from anywhere.

### Features

#### Home

- Move and resize the cards: drag a card by any empty spot, or drag its sides and corners. They snap to a grid of thirds and halves, and fill any gap above them.
- Right-click any card, or any row on it, for Size and Move; lock the whole layout with the padlock at the top right.
- New Sports card: live scores for the NFL, NBA, MLB and NHL, today's games first. Follow teams to pin their games to the top.
- New Markets card: the S&P 500, Dow and Nasdaq, and a watchlist with prices, the day's change and a trend line.
- News shows a picture for each story, one headline per row, with more below.

#### Command palette

- Ctrl+K opens it from anywhere: add a task, a note (note:) or an event (event:), jump to any screen, open a note, or run a command.
- A note added from it opens in Notes, ready to write.

#### Notes

- A format bar above the note: undo, text style, bold and the rest, lists, callouts, tables, pictures and emoji.
- Links become smart links: a chip with the site's icon and the page's title. Right-click → Display as URL, Inline, Card or Embed.
- Typed links turn into their page's title too, not just pasted ones.
- Give a note an emoji; it shows by its title, in the notebook, the tabs and on Home.
- Page width (Narrow, Wide, Full width), and hide the notebook or About this note for more room (`Ctrl+\`, `Ctrl+Shift+\`).
- Tables show a line between columns; middle-click closes a tab.

#### Schedule

- Events can repeat every year; “Mom's birthday oct 3” in quick add does it for you.
- Subscribe to a calendar by its link (Google, Outlook, iCloud, holidays, sports) or import an .ics file.
- Make new calendars, with a switch for whether each is also a list in Tasks; two new colors, blue and pink.

#### Settings

- Peach, Checkpoint's theme, joins the others. Match Windows light and dark keeps it when Windows is light.

### Defect fixes

- **Home**: cards could be dragged down into space they didn't stay in; they now land where they fit, and gaps close up.
- **Home**: news headlines are no longer cut to a couple of words on a small window.
- **Notes**: adding a note from another screen straight after starting could do nothing; it now waits for Notes and opens the note.
- **Notes**: a link to a private page (Confluence, SharePoint) no longer gets renamed “Log in to continue”; it keeps its address.
- **Notes**: a link's hover card no longer closes when you press Ctrl or Alt, so Ctrl+click works.

### Known issues

- **Connected accounts**: connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added.
- **Home**: scores and prices come from ESPN's and Yahoo Finance's public feeds, which aren't official and could change. The cards say so when they can't load.
- **Schedule**: subscribed calendars don't send reminders.
- **Right-click menus**: spelling suggestions only show with Shift+right-click, which opens the Windows menu.

## Kakariko (0.2.0 beta)

*September 25, 2026.* Links that explain themselves, videos right in your notes, and right-click menus everywhere.

### Features

#### Notes

- Paste a web address and it turns into the page's title, still linked. Ctrl Z puts the address back.
- Point at a link to see the page's picture, title and description, with Copy link and Open in browser.
- A YouTube link on a line of its own plays right in the note.

#### Right-click menus

- Right-click works all over the app: events, habits, goals, Home's cards, task groups, subtasks, the sidebar and the title bar.
- Text boxes and notes get Cut, Copy, Paste and Select all in Project Life's own menu.
- Complete, move or recycle a whole group of tasks at once, with one Undo.
- Hide any Home card from its menu.

#### Settings

- Release notes have a new look, and every release has a name. 0.1.0 is Hyrule.
- Themes are picked in Settings → Appearance; the picker left Home's sidebar.
- New switches in Settings → Notes: Link titles and YouTube videos.

### Defect fixes

- **Notes**: link previews work for very large pages, like YouTube videos. The page was cut off before its title.

### Known issues

- **Connected accounts**: connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added.
- **Right-click menus**: spelling suggestions only show with Shift+right-click, which opens the Windows menu.

## Hyrule (0.1.0 beta)

*September 25, 2026.* The first release of Project Life: notes, schedule, tasks, habits and goals in one place, built on Checkpoint.

### Features

#### Home

- A bit of everything at a glance: what's up next, today's progress, your schedule, tasks, goals, habits, recent notes, news and weather.
- Quick capture adds a task, note or event from anywhere (Ctrl K).

#### Notes

- Checkpoint's editor, notebooks, tags, pins and tabs, in Visual or Markdown.
- Works with a Checkpoint notes folder, and Settings → Storage and backup can import one.

#### Tasks

- Lists, subtasks, repeats, reminders, priorities and a 30-day Recycle Bin.
- Send a note's to-dos to Tasks, with ticks kept in step both ways.
- Block time on your schedule for a task, and pop Tasks out into its own window.

#### Schedule

- Week and month views, repeating events, time zones, and reminders as Windows notifications, even with the window closed to the tray.
- Join buttons for Teams, Meet and Zoom links. They light up 10 minutes before a call.

#### Habits and goals

- Check, count and timed habits, with streaks, a streak saver, and a day that ends at 3 AM for night owls.
- Goals with milestones, linked habits and weekly check-ins, plus a little celebration at 100%.

#### Connected accounts

- Connect Microsoft and Google. Outlook and Google calendars sync into the Schedule and back.
- New events get a Teams or Meet link when you save.
- Sign-ins stay in Windows Credential Manager. See `docs/ACCOUNTS.md` for setting up the app registrations.

#### Settings

- Four themes, matching Windows light and dark, accent colors, Mica and Acrylic backgrounds, your own fonts, and text sizes S to XL.
- Every keyboard shortcut can be changed, and accessibility options cover reduced motion, higher contrast, bigger click targets and screen reader announcements.
- Quiet hours, and staying quiet while you're live on OBS or Meld Studio.
- Daily backups, export everything, and updates from GitHub Releases.

#### Portable

- One `Project Life.exe`, no installer. Everything is kept in a Data folder beside it.

### Defect fixes

- **Notes**: restoring a note from the Recycle Bin gives back its own title, without the date it was deleted tacked on.
- **Notes**: a callout's icon stays put when the callout holds a heading.

### Known issues

- **Connected accounts**: connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added.
- **Notes**: link previews don't show for very large pages, like YouTube videos.
