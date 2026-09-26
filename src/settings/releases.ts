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
