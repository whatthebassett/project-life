# Project Life: Build Plan

Read `DESIGN.md` and the files in `design/` first. Build **one phase at a time**, and show the plan for each phase before writing code.

## Kickoff prompt (paste into Claude Code)

> Read DESIGN.md, PLAN.md and every file in /design. This is Project Life, a desktop life-assistant app. Use the same stack as Checkpoint at C:\Coding Projects\Noted\noted-tauri and reuse its code where it fits. Start with Phase 1 only. Match the design files exactly: colors, fonts, spacing and corner rounding. Show me your plan before writing code.

## Stack (same as Checkpoint)

- **Tauri 2 (Rust):** the window, files, networking and tray.
- **React + TypeScript**, built with **Vite** and styled with **Tailwind CSS**. The theme tokens from DESIGN.md become CSS variables, and Tailwind colors point at those variables.
- **Editor:** **TipTap** (Visual) and **CodeMirror 6** (Markdown). Reuse Checkpoint's `src/editor/`.
- **Icons:** lucide.
- **Output:** a portable Windows build, like Checkpoint's `npm run portable`.

## Where data lives (local first, no account)

| What | Where |
| --- | --- |
| Notes | Plain `.md` files in the notes folder (same format as Checkpoint) |
| Tasks, events, habits, goals, settings | JSON files in `Data\` next to the app (PascalCase keys, and keep unknown keys, like Checkpoint) |
| Backups | Daily zip copy to a folder the user picks |

Only go online for what the user asks for: weather (Open-Meteo), news feeds, link previews, Google Fonts, and connected calendars.

## Code to borrow from Checkpoint

- `src/editor/*`: the whole Visual editor (slash menu, callouts, tables, to-dos, link cards, dates, emoji)
- `src/tasks/dates.ts` and `model.ts`: quick-add parsing ("Pay rent fri 5pm"), due dates, and the Later options
- `src/home/weather.ts`, `news.ts`, `feeds.ts`: weather and news for Home
- `src/lib/notebook.ts`, `frontmatter.ts`, `positions.ts`, `stats.ts`: notebooks, tags, priorities and recent notes
- `src/lib/fonts.ts`, `appearance.ts`, `themes.ts`, `shortcuts.ts`: fonts, themes and rebindable shortcuts
- `src-tauri/`: notes on disk, the notes folder, merge, downloads and fonts

---

## Phases

Each phase is done when everything in its "Done when" list works in the running app.

### Phase 1: App skeleton and themes

- Tauri + React + Vite + Tailwind project, with the fonts from DESIGN.md.
- The 4 themes as CSS variables. A theme switch changes everything instantly and is remembered.
- The icon rail and routing between Home, Notes, Schedule, Tasks, Habits, Goals and Settings (empty screens for now).
- Themed scrollbars, the focus ring and Reduce motion.
- A reusable pop-up shell: scrim, blur, header, footer, Esc and backdrop click to close.
- Starter components: segmented control, switch, chip, checkbox, progress ring, progress bar, stepper, section label, list row.

**Done when:** you can click through every screen, switch between all 4 themes, and the pop-up shell opens and closes.

### Phase 2: Home

- Every card from `Main.dc.html`, using local data.
- Quick capture adds a task.
- Weather and news, ported from Checkpoint.

**Done when:** Home matches the mockup in all 4 themes, and checking a task updates the Today ring.

### Phase 3: Notes

- Port Checkpoint's editor and notes storage.
- The new layout: icon rail, notebook tree with filters, tabs, outline, details panel and status bar.
- "Linked in Project Life" can wait until Phase 4.

**Done when:** you can create, edit, pin, tag and move notes, and the `.md` files look the same as Checkpoint's.

### Phase 4: Tasks

- Views, grouping by date or list, the Later menu, quick-add parsing, and the details panel with a description and subtasks.
- The task details pop-up.
- Note to-dos can be sent to Tasks and link back to the note.

**Done when:** everything in `Tasks.dc.html` and `TaskFull.dc.html` works with real saved data.

### Phase 5: Schedule (local events first)

- Week and month views, quick add, the mini month, and calendar toggles.
- The new event pop-up, with the clash warning and the day preview.
- Reminders fire as Windows notifications, even when the window is closed (tray).

**Done when:** events can be created, edited, repeated and reminded, all stored locally.

### Phase 6: Habits and Goals

- Habits: check-off and count habits, streaks with "day ends at 3 AM", the week strip, the 12-week grid, and the edit pop-up.
- Goals: number and milestone goals, the pace and status logic from DESIGN.md, the progress chart, and the new goal pop-up.
- Linked habits can count toward goals.

**Done when:** both screens and both pop-ups work with real saved data.

### Phase 7: Settings

- Every section in `Settings.dc.html`, wired to real behavior.
- Search filters the sections.
- **Import from Checkpoint:** copies notes, tags, notebooks and tasks without changing Checkpoint's files.

**Done when:** every setting changes something real and is remembered after restarting.

### Phase 8: Connected accounts and video calls

- **Microsoft:** sign in (OAuth), sync Outlook calendars through Microsoft Graph, and read `onlineMeeting.joinUrl` for Teams links. Can create Teams meetings for new events.
- **Google:** sign in (OAuth), sync Google Calendar, and read `hangoutLink` / `conferenceData` for Meet links. Can create Meet links for new events.
- **Pasted links:** detect `teams.microsoft.com/l/meetup-join`, `meet.google.com/` and `zoom.us/j/` in event locations and descriptions.
- **Join button:** opens the link with Tauri's opener plugin and turns solid 10 minutes before the start.
- **Token storage:** keep sign-in tokens in the Windows Credential Manager, never in plain JSON.

**Done when:** Join buttons open real Teams and Meet calls, and new events can get a meeting link automatically.

### Phase 9: Polish and release

- Check every screen in all 4 themes and at text sizes S to XL.
- Keyboard shortcuts everywhere, and a pass on screen reader labels.
- A portable build and release notes.
