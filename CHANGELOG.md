# Changelog

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
