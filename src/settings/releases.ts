// What each release brought, newest first, for Settings → About → What's new.
// CHANGELOG.md says the same for the portable zip and GitHub.
export interface Release {
  // The release's name, shown big; the version number sits beside it.
  name: string;
  version: string;
  // yyyy-mm-dd.
  date: string;
  summary: string;
  // Grouped by where in the app they are.
  features: { area: string; items: string[] }[];
  fixes: { area: string; text: string }[];
  known: { area: string; text: string }[];
}

export const releases: Release[] = [
  {
    name: "Lake Hylia",
    version: "0.4.0 beta",
    date: "2026-10-02",
    summary: "One command palette on Ctrl+T, in liquid glass; tags you can add from the note itself; US holidays built in; habits you can fill in after the fact.",
    features: [
      {
        area: "Command palette",
        items: [
          "Ctrl+T opens it from anywhere. It now does the jobs of Switch note (Ctrl+P), Open a note in a new tab and New task (Ctrl+Shift+T), which are retired; Ctrl+K is back to adding a link inside a note",
          "Recent notes come first; typing searches note titles, with each note's notebook and when it was edited. Enter opens a note here, Ctrl+Enter (or Ctrl+click) in a new tab",
          "A note titled exactly what you typed goes to the top; the + beside the note tabs opens the palette set to open notes in a new tab",
          "A liquid glass look: the screen shows through a frosted pane with a lit rim, and the Task, Note and Event switch slides. It turns solid with high contrast or reduced transparency",
        ],
      },
      {
        area: "Notes",
        items: [
          "Add tags from the note: click Add tag (or any tag, or the +) under the title to find tags, tick them on or off, or make a new one by typing its name",
          "Manage tags is rebuilt: bigger, with your tags on the left and the one picked on the right to rename, recolor or delete, a live preview, and the notes that use it. Changes save as you make them",
          "Tags show in their own color on the note",
          "A note's icon sits beside its title instead of above it",
          "The Edited line shows the full date and time; point at it for how long ago",
          "The format bar's “Type / for blocks” is now an info button that shows how the / menu works",
        ],
      },
      {
        area: "Schedule",
        items: [
          "A built-in US Holidays calendar: the federal holidays (and the weekday they're observed on), plus days like Valentine's Day, Easter, Halloween and the clock changes. Worked out on your PC, so it needs no link or internet",
          "Right-click it to hide, recolor or remove it; + Add calendar brings it back",
        ],
      },
      {
        area: "Habits",
        items: [
          "Fill in a day you forgot to tick: click any past day in a habit's week, in its history, or on Home's Habits card. Undo is in the message that follows",
          "Right-click a habit for Mark yesterday done",
        ],
      },
      {
        area: "Home",
        items: [
          "Click an event on the Schedule card to open it",
        ],
      },
      {
        area: "Everywhere",
        items: [
          "Tooltips look like the rest of Project Life instead of Windows' plain ones, and show on keyboard focus too",
        ],
      },
    ],
    fixes: [
      { area: "Home", text: "Up Next's countdown no longer runs into a divider line when it reaches three digits; the line is gone and the number has room." },
      { area: "Notes", text: "A long title no longer loses its second line when the note gets narrower." },
    ],
    known: [
      { area: "Schedule", text: "US Holidays doesn't include holidays that follow other calendars, such as Hanukkah, Passover, Ramadan and Diwali." },
    ],
  },
  {
    name: "Zora's Domain",
    version: "0.3.1 beta",
    date: "2026-09-27",
    summary: "A fix for opening notes from File Explorer.",
    features: [],
    fixes: [
      {
        area: "Notes",
        text: "Opening a note from File Explorer (double-click, or Open with) now opens it in Notes, whether Project Life was running or not. A Markdown file outside your notes folder is imported as a copy and opened.",
      },
    ],
    known: [],
  },
  {
    name: "Zora's Domain",
    version: "0.3.0 beta",
    date: "2026-09-27",
    summary: "A Home you can arrange, with sports and markets; a command palette; smart links and a format bar in Notes; calendars from anywhere.",
    features: [
      {
        area: "Home",
        items: [
          "Move and resize the cards: drag a card by any empty spot, or drag its sides and corners. They snap to a grid of thirds and halves, and fill any gap above them",
          "Right-click any card, or any row on it, for Size and Move; lock the whole layout with the padlock at the top right",
          "New Sports card: live scores for the NFL, NBA, MLB and NHL, today's games first. Follow teams to pin their games to the top",
          "New Markets card: the S&P 500, Dow and Nasdaq, and a watchlist with prices, the day's change and a trend line",
          "News shows a picture for each story, one headline per row, with more below",
        ],
      },
      {
        area: "Command palette",
        items: [
          "Ctrl+K opens it from anywhere: add a task, a note (note:) or an event (event:), jump to any screen, open a note, or run a command",
          "A note added from it opens in Notes, ready to write",
        ],
      },
      {
        area: "Notes",
        items: [
          "A format bar above the note: undo, text style, bold and the rest, lists, callouts, tables, pictures and emoji",
          "Links become smart links: a chip with the site's icon and the page's title. Right-click → Display as URL, Inline, Card or Embed",
          "Typed links turn into their page's title too, not just pasted ones",
          "Give a note an emoji; it shows by its title, in the notebook, the tabs and on Home",
          "Page width (Narrow, Wide, Full width), and hide the notebook or About this note for more room (Ctrl+\\, Ctrl+Shift+\\)",
          "Tables show a line between columns; middle-click closes a tab",
        ],
      },
      {
        area: "Schedule",
        items: [
          "Events can repeat every year; “Mom's birthday oct 3” in quick add does it for you",
          "Subscribe to a calendar by its link (Google, Outlook, iCloud, holidays, sports) or import an .ics file",
          "Make new calendars, with a switch for whether each is also a list in Tasks; two new colors, blue and pink",
        ],
      },
      {
        area: "Settings",
        items: [
          "Peach, Checkpoint's theme, joins the others. Match Windows light and dark keeps it when Windows is light",
        ],
      },
    ],
    fixes: [
      { area: "Home", text: "Cards could be dragged down into space they didn't stay in; they now land where they fit, and gaps close up." },
      { area: "Home", text: "News headlines are no longer cut to a couple of words on a small window." },
      { area: "Notes", text: "Adding a note from another screen straight after starting could do nothing; it now waits for Notes and opens the note." },
      { area: "Notes", text: "A link to a private page (Confluence, SharePoint) no longer gets renamed “Log in to continue”; it keeps its address." },
      { area: "Notes", text: "A link's hover card no longer closes when you press Ctrl or Alt, so Ctrl+click works." },
    ],
    known: [
      { area: "Connected accounts", text: "Connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added." },
      { area: "Home", text: "Scores and prices come from ESPN's and Yahoo Finance's public feeds, which aren't official and could change. The cards say so when they can't load." },
      { area: "Schedule", text: "Subscribed calendars don't send reminders." },
      { area: "Right-click menus", text: "Spelling suggestions only show with Shift+right-click, which opens the Windows menu." },
    ],
  },
  {
    name: "Kakariko",
    version: "0.2.0 beta",
    date: "2026-09-25",
    summary: "Links that explain themselves, videos right in your notes, and right-click menus everywhere.",
    features: [
      {
        area: "Notes",
        items: [
          "Paste a web address and it turns into the page's title, still linked. Ctrl Z puts the address back",
          "Point at a link to see the page's picture, title and description, with Copy link and Open in browser",
          "A YouTube link on a line of its own plays right in the note",
        ],
      },
      {
        area: "Right-click menus",
        items: [
          "Right-click works all over the app: events, habits, goals, Home's cards, task groups, subtasks, the sidebar and the title bar",
          "Text boxes and notes get Cut, Copy, Paste and Select all in Project Life's own menu",
          "Complete, move or recycle a whole group of tasks at once, with one Undo",
          "Hide any Home card from its menu",
        ],
      },
      {
        area: "Settings",
        items: [
          "Release notes have a new look, and every release has a name. 0.1.0 is Hyrule",
          "Themes are picked in Settings → Appearance; the picker left Home's sidebar",
          "New switches in Settings → Notes: Link titles and YouTube videos",
        ],
      },
    ],
    fixes: [{ area: "Notes", text: "Link previews work for very large pages, like YouTube videos. The page was cut off before its title." }],
    known: [
      { area: "Connected accounts", text: "Connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added." },
      { area: "Right-click menus", text: "Spelling suggestions only show with Shift+right-click, which opens the Windows menu." },
    ],
  },
  {
    name: "Hyrule",
    version: "0.1.0 beta",
    date: "2026-09-25",
    summary: "The first release: notes, schedule, tasks, habits and goals in one place, built on Checkpoint.",
    features: [
      { area: "Home", items: ["What's up next, today's progress, your schedule, tasks, goals, habits, recent notes, news and weather at a glance", "Quick capture adds a task, note or event from anywhere (Ctrl K)"] },
      { area: "Notes", items: ["Checkpoint's editor, notebooks, tags, pins and tabs, in Visual or Markdown", "Works with a Checkpoint notes folder, and can import one"] },
      { area: "Tasks", items: ["Lists, subtasks, repeats, reminders, priorities and a 30-day Recycle Bin", "Send a note's to-dos to Tasks, with ticks kept in step both ways", "Block time on your schedule for a task"] },
      { area: "Schedule", items: ["Week and month views, repeating events, time zones, and reminders as Windows notifications", "Join buttons for Teams, Meet and Zoom links, lit up 10 minutes before a call"] },
      { area: "Habits and goals", items: ["Check, count and timed habits, with streaks, a streak saver, and a day that ends at 3 AM", "Goals with milestones, linked habits and weekly check-ins, plus a little celebration at 100%"] },
      { area: "Connected accounts", items: ["Outlook and Google calendars sync into the Schedule and back", "New events get a Teams or Meet link when you save"] },
      { area: "Settings", items: ["Four themes, accent colors, Mica and Acrylic backgrounds, your own fonts, and text sizes S to XL", "Every shortcut can be changed, with reduced motion, higher contrast, bigger targets and screen reader announcements", "Quiet hours, daily backups, export everything, and updates from GitHub Releases"] },
      { area: "Portable", items: ["One Project Life.exe, no installer, with everything kept in a Data folder beside it"] },
    ],
    fixes: [
      { area: "Notes", text: "Restoring a note from the Recycle Bin gives back its own title, without the date it was deleted tacked on." },
      { area: "Notes", text: "A callout's icon stays put when the callout holds a heading." },
    ],
    known: [
      { area: "Connected accounts", text: "Connecting a Microsoft or Google account isn't switched on in this build yet. Connect says so until the app registrations are added." },
      { area: "Notes", text: "Link previews don't show for very large pages, like YouTube videos." },
    ],
  },
];
