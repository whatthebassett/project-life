# Project Life

**This app was written by Claude, Anthropic's AI (Claude Opus 5.5, working in Claude Code). It's an experiment in what AI can really build.** A person directed it phase by phase and made the decisions along the way: the plan, the designs, and the answers to every question about how something should work. The code itself, from the Rust back end to the React screens, was written by Claude. Treat it as an experiment, not a polished product.

Project Life is a desktop app for Windows and macOS for notes, schedule, tasks, habits and goals in one place. It grew out of Checkpoint, a notes app, and builds on its editor.

## What's in it

- **Home:** what's up next, today's progress, schedule, tasks, goals, habits, recent notes, news and weather at a glance.
- **Notes:** Checkpoint's Visual and Markdown editor, notebooks, tags, pins and tabs. Notes are plain `.md` files.
- **Tasks:** lists, subtasks, repeats, reminders, a Recycle Bin, to-dos sent from notes, and a pop-out window.
- **Schedule:** week and month views, repeating events, time zones, reminders as system notifications, and Join buttons for Teams, Meet and Zoom.
- **Habits and goals:** streaks with a streak saver, count and timed habits, goals with milestones and weekly check-ins.
- **Connected accounts:** Outlook and Google calendars synced both ways, with Teams and Meet links made for new events. This needs its own app registrations; see [docs/ACCOUNTS.md](docs/ACCOUNTS.md).
- **Settings:** four themes, text sizes S to XL, changeable keyboard shortcuts, accessibility options, backups, and updates from this repo's Releases.

## Download

Get the portable zip from [Releases](../../releases). Unzip it and run `Project Life.exe`. Nothing is installed: everything it keeps goes in a `Data` folder next to the exe. It needs Microsoft Edge WebView2, which Windows 11 has and Windows 10 gets through Windows Update.

### On a Mac

Get the `-mac-arm64.zip` from Releases when one is published, or build it yourself (below). It needs a Mac with Apple silicon; Intel Macs aren't supported. Unzip it and move `Project Life.app` to Applications. The app isn't notarized by Apple, so the first time, right-click it and choose Open.

What's different from Windows:

- Everything it keeps goes in `~/Library/Application Support/Project Life`, not beside the app.
- The window has the Mac's own close, minimize and zoom buttons, and the app has a menu bar. Closing the window leaves Project Life in the menu bar (the Dock icon brings it back); ⌘Q quits.
- Shortcuts use ⌘ where Windows uses Ctrl. Next and previous tab are ⌃Tab and ⌃⇧Tab, and moving a note in the notebook is ⌃⌥ with the arrows.
- Sign-ins and the OBS password are kept in the Keychain.
- Window background has Solid and Translucent instead of Mica and Acrylic.

## Building it

You need Node.js, Rust and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for Windows or macOS.

```bash
npm install
npm run tauri dev
```

On Windows, `npm run portable` builds the portable `Project Life.exe` and its zip into `portable/`. On a Mac with Apple silicon, `npm run mac` builds `Project Life.app` and its zip into `portable/`.

## How it was made

The build followed [PLAN.md](PLAN.md) in nine phases. [DESIGN.md](DESIGN.md) and the mockups in `design/` were the spec. Each phase started with a plan that was agreed before any code was written. The commits say which phase they finished, and each one is marked as co-authored by Claude.
