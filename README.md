# Project Life

**This app was written by Claude, Anthropic's AI (Claude Opus 5.5, working in Claude Code). It's an experiment in what AI can really build.** A person directed it phase by phase and made the decisions along the way: the plan, the designs, and the answers to every question about how something should work. The code itself, from the Rust back end to the React screens, was written by Claude. Treat it as an experiment, not a polished product.

Project Life is a Windows desktop app for notes, schedule, tasks, habits and goals in one place. It grew out of Checkpoint, a notes app, and builds on its editor.

## What's in it

- **Home:** what's up next, today's progress, schedule, tasks, goals, habits, recent notes, news and weather at a glance.
- **Notes:** Checkpoint's Visual and Markdown editor, notebooks, tags, pins and tabs. Notes are plain `.md` files.
- **Tasks:** lists, subtasks, repeats, reminders, a Recycle Bin, to-dos sent from notes, and a pop-out window.
- **Schedule:** week and month views, repeating events, time zones, reminders as Windows notifications, and Join buttons for Teams, Meet and Zoom.
- **Habits and goals:** streaks with a streak saver, count and timed habits, goals with milestones and weekly check-ins.
- **Connected accounts:** Outlook and Google calendars synced both ways, with Teams and Meet links made for new events. This needs its own app registrations; see [docs/ACCOUNTS.md](docs/ACCOUNTS.md).
- **Settings:** four themes, text sizes S to XL, changeable keyboard shortcuts, accessibility options, backups, and updates from this repo's Releases.

## Download

Get the portable zip from [Releases](../../releases). Unzip it and run `Project Life.exe`. Nothing is installed: everything it keeps goes in a `Data` folder next to the exe. It needs Microsoft Edge WebView2, which Windows 11 has and Windows 10 gets through Windows Update.

## Building it

You need Node.js, Rust and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```bash
npm install
npm run tauri dev
```

`npm run portable` builds the portable `Project Life.exe` and its zip into `portable/`.

## How it was made

The build followed [PLAN.md](PLAN.md) in nine phases. [DESIGN.md](DESIGN.md) and the mockups in `design/` were the spec. Each phase started with a plan that was agreed before any code was written. The commits say which phase they finished, and each one is marked as co-authored by Claude.
