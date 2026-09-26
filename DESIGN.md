# Project Life: Design Spec

Project Life is a desktop life-assistant app for Windows: notes, schedule, tasks, habits and goals in one place, with a Home screen that shows a bit of everything. It is an offshoot of **Checkpoint** (`C:\Coding Projects\Noted\noted-tauri`) and should reuse its stack and code where it fits.

This file is the source of truth for the look and feel. The `design/` folder holds a mockup of every screen.

---

## 1. How to read the design files

Each file in `design/` is one screen, written in a small HTML templating format from the design tool. They will not open correctly in a browser on their own (they need the design tool's runtime), so treat them as **reference source**, not as runnable pages.

- **Inline `style="..."` is the exact spec.** Copy sizes, padding, gaps, radii, font sizes and weights from it. Don't round values to a grid.
- **`{{t.something}}`** is a theme token (see section 2). For example `background: {{t.panel}}` means "use the panel color of the current theme".
- **`<sc-for list="{{items}}" as="item">`** is a loop, and **`<sc-if value="{{cond}}">`** is a conditional.
- **The `<script>` at the bottom** (`class Component`) holds the sample data and the behavior: what happens when you click, how things are computed (streaks, pace, conflicts, parsing). Use it as the behavior spec.
- **All names, dates, numbers, headlines and weather in the mockups are sample data.**
- The mockups are pinned to **Friday, September 25, 4:18 PM** so "now" lines and countdowns make sense.

| File | Screen |
| --- | --- |
| `Main.dc.html` | Home screen (Midnight base theme; `theme` prop switches themes) |
| `Notes.dc.html` | Notes: notebook tree, tabs, editor, outline and details |
| `Calendar.dc.html` | Schedule: week and month views, quick add, event details |
| `EventNew.dc.html` | New event pop-up (over Schedule) |
| `Tasks.dc.html` | Tasks: smart views, grouped list, Later menu, details panel |
| `TaskFull.dc.html` | Task details pop-up (over Tasks) |
| `Habits.dc.html` | Habits: today's habits, streaks, 12-week grid |
| `HabitEdit.dc.html` | Edit habit pop-up (over Habits) |
| `Goals.dc.html` | Goals: goal cards with pace, progress chart, milestones |
| `GoalNew.dc.html` | New goal pop-up (over Goals) |
| `Settings.dc.html` | Settings pop-up with sidebar sections (over Home) |

The reference window size is **1440 x 1000** (Home is 1440 x 1320 because it scrolls).

---

## 2. Themes

There are four themes. **Midnight is the base.** Every theme uses the same layout and only swaps these tokens. Build them as CSS variables (for example `--bg`, `--panel`) on the root and switch the whole set when the theme changes.

### Core tokens

| Token | Use | Midnight | Aurora | Ember | Daylight |
| --- | --- | --- | --- | --- | --- |
| `bg` | App background | `#0A0C11` | `#07110F` | `#110C0A` | `#F3F2EE` |
| `side` | Sidebars, rails, modal header/footer | `#0D1017` | `#0A1614` | `#16100D` | `#ECEAE4` |
| `panel` | Cards, inputs | `#12161F` | `#0F1D1A` | `#1D1512` | `#FFFFFF` |
| `panel2` | Raised bits inside cards, selected segments, empty tracks | `#1A1F2B` | `#162824` | `#281E19` | `#F3F2EE` |
| `line` | Borders and dividers | `rgba(255,255,255,0.07)` | `rgba(220,255,245,0.08)` | `rgba(255,235,220,0.08)` | `rgba(20,22,30,0.09)` |
| `text` | Main text | `#ECEEF5` | `#E8F4F0` | `#F6ECE6` | `#15171D` |
| `muted` | Secondary text, labels | `#969DAF` | `#93ABA4` | `#B5A197` | `#5A5F6B` |
| `faint` | Empty checkbox borders, future dots, scrollbar thumb (never body text) | `#5D6477` | `#526D65` | `#776156` | `#8D897F` |
| `accent` | Primary buttons, selection, active nav | `#A092FF` | `#4FE0B0` | `#FF9A5C` | `#5A48E0` |
| `accentInk` | Text/icons **on top of** accent fills | `#0A0C11` | `#06120F` | `#140C08` | `#FFFFFF` |
| `accentSoft` | Selected rows, active nav background, tags | `rgba(160,146,255,0.16)` | `rgba(79,224,176,0.16)` | `rgba(255,154,92,0.16)` | `rgba(90,72,224,0.12)` |
| `accent2` | "Live" and secondary accent: now line, habits, progress | `#5CE1C6` | `#7CB8FF` | `#F2CF6A` | `#0B8A6D` |
| `accent2Soft` | Soft fill for accent2 things | `rgba(92,225,198,0.14)` | `rgba(124,184,255,0.14)` | `rgba(242,207,106,0.14)` | `rgba(11,138,109,0.12)` |
| `warn` | Due today, medium priority, "Behind" | `#FFB36B` | `#FFC37A` | `#F58FA6` | `#B4501A` |
| `warnSoft` | Warning banners (event clash) | `rgba(255,179,107,0.14)` | `rgba(255,195,122,0.14)` | `rgba(245,143,166,0.14)` | `rgba(180,80,26,0.12)` |
| `danger` | Overdue, high priority, delete | `#FF7A85` | `#FF8590` | `#FF7A7A` | `#C62F3D` |
| `glow` | Soft radial glow in hero areas | `rgba(160,146,255,0.20)` | `rgba(79,224,176,0.18)` | `rgba(255,154,92,0.18)` | `rgba(90,72,224,0.10)` |
| `scrim` | Dimmed backdrop behind pop-ups | `rgba(4,5,9,0.62)` | `rgba(2,8,7,0.62)` | `rgba(8,5,4,0.62)` | `rgba(20,22,30,0.38)` |
| `todayTint` | Today's column in the calendar | `rgba(160,146,255,0.05)` | `rgba(79,224,176,0.05)` | `rgba(255,154,92,0.05)` | `rgba(90,72,224,0.04)` |

> Note: `faint` in Aurora, Ember and Daylight was nudged in Phase 9 (from `#4E6760`, `#6E5A50`, `#A9A69E`) so empty checkboxes and habit circles reach 3:1 against `bg` and `panel`, as WCAG asks of control outlines.
>
> Note: the mockups give Ember's `warn` as `#FF8A7A` or `#FFC37A`. It is rose `#F58FA6` (Phase 9): amber sat between Ember's orange accent and yellow accent2, so warnings didn't stand out.

### Color picks (habits and goals)

Six colors users can pick for habits and goal areas. Index order matters (the mockups refer to them by number).

| # | Name | Midnight | Aurora | Ember | Daylight |
| --- | --- | --- | --- | --- | --- |
| 0 | Violet | `#A092FF` | `#4FE0B0` | `#FF9A5C` | `#5A48E0` |
| 1 | Mint | `#5CE1C6` | `#7CB8FF` | `#F2CF6A` | `#0B8A6D` |
| 2 | Amber | `#FFB36B` | `#FFC37A` | `#8FD9A8` | `#B4501A` |
| 3 | Coral | `#FF7A85` | `#FF8590` | `#FF7A7A` | `#C62F3D` |
| 4 | Sky | `#6FA8FF` | `#B69CFF` | `#7FB6FF` | `#2F6FD6` |
| 5 | Pink | `#F28DC4` | `#F59BC9` | `#E79AD0` | `#B23A7C` |

Soft versions are the same color at 0.16 opacity (fills behind icons) or 0.08 to 0.12 (large tinted panels).

### Semantic colors

- **Priority:** High = `danger`, Medium = `warn`, Low = `accent2`, None = `muted`. Shown as a small filled flag, and as the border color of the task's empty checkbox.
- **Calendars and lists:** Personal = `accent`, Stream & YouTube = `accent2`, Checkpoint = `warn`, Errands and Tasks due = `muted`. Events use the soft fill of their calendar color. The selected event uses the solid color with `accentInk` text.
- **Goal status:** compare progress % with the even pace % (how much of the time window has passed):
  - done ≥ 100 → **Done** (solid accent2)
  - progress − pace ≥ +8 → **Ahead** (accent2 on accent2Soft)
  - within ±8 → **On track** (text on panel2)
  - lower than that → **Behind** (warn on warnSoft)

---

## 3. Typography

**No serif fonts anywhere.**

| Role | Font | Weight | Sizes used |
| --- | --- | --- | --- |
| Headlines, big numbers | **Atkinson Hyperlegible** | 700 (400 for the huge countdown) | Greeting 50px, page titles 40px, sidebar titles 24px, modal titles 28 to 34px, streak and percent numbers 26 to 96px |
| Everything else (UI, body) | **Geist** | 400, 500, 600 | 13 to 16px body, 12px meta, 17 to 20px card titles |
| Labels, numbers, times, shortcuts | **Geist Mono** | 400, 500 | 10 to 12px |

- **Section labels** are Geist Mono, 11px, UPPERCASE, `letter-spacing: 0.12em`, `muted` color (for example `SCHEDULE`, `WHY IT MATTERS`).
- **Letter spacing:** headlines use slight negative tracking (-0.01em to -0.03em).
- Google Fonts link (or bundle the files locally for offline use, like Checkpoint's font downloads):
  `https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap`
- Fallbacks: `ui-sans-serif, system-ui, sans-serif` and `ui-monospace, monospace`.
- Settings lets people change the headline font and text size (S, M, L, XL). Build type sizes on a scale variable so this is one switch.

---

## 4. Shape, spacing and depth

- **Corner radius:**
  - Pop-up windows: 28
  - Big cards (Home, goals): 22 to 24
  - Panels and list rows: 16 to 18
  - Inputs and segmented controls: 12 to 14
  - Buttons: 11 to 13
  - Chips and tags: 8 to 10
  - Pills and switches: 999
- **Spacing:** 4px base. Common gaps are 6, 8, 10, 12, 16, 20 and 24. Page padding is 26 to 32px; card padding is 18 to 26px.
- **Hit targets:** at least **44 x 44** for anything clickable. Small visual checkboxes sit inside a 44px button.
- **Borders over shadows.** Cards use a 1px `line` border. Shadows are only for floating things:
  - Pop-ups: `0 40px 120px rgba(0,0,0,0.55)`
  - Menus: `0 24px 60px rgba(0,0,0,0.45)`
- **Glow:** Home and some headers use a soft radial glow, for example `radial-gradient(900px 520px at 88% -12%, var(--glow), transparent 62%)`. Keep it subtle.
- **Icons:** thin line icons (stroke 1.8 to 2, round caps and joins, 24px grid), similar to lucide (Checkpoint already uses lucide). No emoji in the UI.

---

## 5. App layout

- **Icon rail (every screen except Home):** 72px wide, `side` background.
  - Top: logo mark.
  - Middle: Home, Notes, Schedule, Tasks, Habits, Goals.
  - Bottom: Settings and avatar.
  - Items are 48 x 48 with radius 14. The active one gets `accentSoft` background and `accent` icon.
- **Home** uses a full 240px sidebar instead: nav with a task count badge, Spaces and the profile. Themes are picked in Settings → Appearance only (the sidebar picker in Main.dc.html was dropped at the user's request).
- **List panel:** 256 to 300px, `side` background, holds the screen title, a **+** button, views and filters.
- **Main area:** fills the rest.
- **Details panel:** 340px on the right for the selected item (task, habit, goal, note info).
- **Pop-ups:**
  - Centered, about 1060 to 1140 wide and 880 to 920 tall.
  - The screen behind is dimmed with `scrim` plus `backdrop-filter: blur(6px)`. Clicking the backdrop closes it.
  - 60px header (tag like `NEW GOAL`, close X) and 68px footer (plain-English summary on the left, Cancel and primary action on the right).
  - Should fit without scrolling at 1000px tall. Only long lists inside (like subtasks over 5) get their own scroll area.

### Scrollbars (app wide)

```css
::-webkit-scrollbar { width: 12px; height: 12px; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-thumb {
  background-color: var(--faint); border-radius: 999px;
  border: 3px solid transparent; background-clip: padding-box; min-height: 40px;
}
::-webkit-scrollbar-thumb:hover { background-color: var(--muted); }
::-webkit-scrollbar-thumb:active { background-color: var(--accent); }
::-webkit-scrollbar-button { display: none; }
```

WebView2 (Tauri on Windows) is Chromium, so these apply. Don't also set `scrollbar-color`: in Chromium it overrides the rules above.

---

## 6. Reusable pieces

Build these once and use them everywhere:

- **Segmented control:** `panel` track with 1px `line` border, 3 to 4px padding. The selected segment is `panel2` with `text`; the others are `muted`.
- **Switch:** 38 to 40 x 22 to 24 pill. On = `accent` track with an `accentInk` knob; off = `panel2` track with a `muted` knob. Use `role="switch"`.
- **Chips and tags:** 26 to 34px tall. Tags use `accentSoft` with `accent` text.
- **Checkboxes:**
  - Tasks: round, 22px.
  - Subtasks and note to-dos: rounded square, 20px, radius 6.
  - Empty = 1.5px `faint` border (or the priority color). Done = filled with a check in `accentInk`, text gets a line through it and turns `muted`.
- **Progress ring:** track `panel2`, value `accent` or `accent2`, round caps, starts at 12 o'clock.
- **Progress bar with pace marker:** 10px bar with a 2px marker at the even-pace position (goals).
- **Stepper:** – value + on a `panel2` track, with the + button filled with the item's color.
- **Section label:** see Typography.
- **List row:** 58 to 60px tall with the label (plus an optional description line) on the left and the control on the right.
- **Status pill:** 24px, radius 8, 11px semibold.
- **Key caps:** Geist Mono 12px on `panel2`, with a 2px bottom border.

---

## 7. Screens and behavior

### Home (`Main.dc.html`)

- **Header:** greeting ("Good evening, Ultima.", name in `accent`), the date in mono, and a quick-capture box (Ctrl K) with an Add button.
- **Up next:** the next event with a pulsing `accent2` dot, time, title, a **Join Teams / Meet / Zoom** button, Open note, Snooze, and a large countdown.
- **Today:** a progress ring for tasks done, plus habits and events left.
- **Row of three:**
  - Schedule timeline with a "now" line.
  - Tasks with checkboxes.
  - Habits (week dots, today's dot clickable) and Recent notes.
- **Bottom row:** News (topic filters: All, Gaming, Tech, Local; 2 x 2 headline cards; Manage sources) and Weather (location, temperature, °F/°C toggle, wind, humidity, rain, 3-day forecast with range bars). Weather comes from Open-Meteo, like Checkpoint.
- Every card can be turned off in Settings > Home screen.

### Notes (`Notes.dc.html`)

- **Carried over from Checkpoint:**
  - Notebooks inside notebooks that fold open and closed, pinned notes, priority dots, tags and the Recycle Bin.
  - Tabs, the Ctrl P switcher and the Visual / Markdown toggle.
  - Cover image, callouts, link preview cards, tables, to-dos, the `/` block menu and block drag handles.
  - Notes stay plain `.md` files.
- **New:**
  - A slim icon rail.
  - Filter chips (All, Recent, High priority, Untagged).
  - Right panel: "On this page" outline, **Linked in Project Life** (events and to-dos sent to Tasks), and details (word count, to-do progress, file path).
  - A status bar showing it's saved.

### Schedule (`Calendar.dc.html`) and New event (`EventNew.dc.html`)

- **Quick add with plain language**, like Checkpoint's task parser: "Haircut sat 3pm" becomes Saturday at 3 PM, with a preview before Enter.
- **Left panel:** mini month, calendars with color checkboxes (unchecking hides them), and a details card for the selected event.
- **Week view:** 8 AM to 11 PM, 52px per hour. Today's column is tinted and a now line runs across it. Past events are dimmed and tasks due sit in an all-day row.
- **Month view:** up to 2 chips a day plus "+N more".
- **Video calls:**
  - Every event has a video setting: None, Teams, Meet or Zoom. The button reads "Join Teams" (and so on).
  - The Join button is an outline until **10 minutes before** the start, then turns solid. After the event it shows "This call has ended".
  - Links come from Microsoft Graph (`onlineMeeting.joinUrl`) and the Google Calendar API (`hangoutLink` / `conferenceData`). Pasted `teams.microsoft.com/l/meetup-join`, `meet.google.com` and `zoom.us/j` links in the location or description are picked up too.
  - Open links with Tauri's opener plugin.
- **New event pop-up:**
  - Type tabs: Event, Focus time, Reminder.
  - Day picker for the next 7 days, start and end times, quick length buttons, and All day.
  - **Clash warning** with a "Move to [next free time]" button.
  - Repeat, time zone, calendar, video call and place.
  - Multiple reminders, and a description with Link note and Link task.
  - A live **day preview** timeline on the right.
  - Footer summary in plain English.

### Tasks (`Tasks.dc.html`) and Task details (`TaskFull.dc.html`)

- **Carried over from Checkpoint:**
  - Groups: Overdue (danger), Today, Tomorrow, Upcoming, Someday, and Completed (folded).
  - Priorities 0 to 3, a description line and due times.
  - Quick add parsing: `Pay rent fri 5pm !high #personal`.
  - **Later** menu: Later today 7 PM, Tomorrow, This weekend, Next week, Someday.
  - Pop-out window.
- **New:**
  - Views: Today, Upcoming, All, Someday, Completed.
  - Lists, and a Today ring.
  - Group by Date or by List.
  - Details panel with an editable Markdown description, priority, subtasks with progress, and a link back to the source note.
- **Task details pop-up:**
  - Editable title, status (To do / In progress / Done) and a description editor with a formatting toolbar.
  - Subtasks: drag handles; add with Enter; scrolls inside its own box past about 5.
  - Attachments, and activity (latest shown, "Show all").
  - Due date and time, reminder, repeat and estimate, plus **Block time on my schedule**.
  - Priority, list and tags, and links to notes and events.

### Habits (`Habits.dc.html`) and Edit habit (`HabitEdit.dc.html`)

- **Grouping:** habits are grouped by Morning, Anytime and Evening.
- **Kinds:**
  - Check-off habits get a 52px check button.
  - Count habits get a stepper (5/8 glasses). They're done when count ≥ target, and partial progress shows as a half-filled day.
- **On each habit:** a streak with a flame icon (+1 when done today) and a 7-day strip (done, missed, today outlined, future dashed).
- **Left panel:** views, a "This week" percent with day bars, and Records (longest streak, most consistent, needs love).
- **Details panel:** a big streak number, best / 30-day rate / total, and a **12-week grid** with 4 levels (0, 35%, 65%, 100% of the habit color).
- **Edit pop-up:**
  - Name, 10 icons and 6 colors.
  - Goal type (check off / count / time) with target and unit.
  - Frequency (every day, specific days, X times a week) and time of day.
  - Reminder, Show on Home, and Add to Today in Tasks.
  - Live preview card with a plain-English summary.
  - Archive, and Delete (danger).
- **Setting:** "My day ends at 3 AM", so late check-ins count for the day before.

### Goals (`Goals.dc.html`) and New goal (`GoalNew.dc.html`)

- **Left panel:** views (Active, Needs attention, Completed), area filters (Projects, Health, Creative, Home), and a "2026 so far" card (year percent plus on track / ahead / behind counts).
- **Goal cards:** area, due date, status pill, big percent, a bar with a pace marker, and what feeds it. Sort by due date or by most behind.
- **Details panel:**
  - "Why it matters".
  - Progress chart: your line and filled area against a dashed even-pace line, plus a today marker.
  - Number goals get a Log button, a – button and a pace hint ("About 23 subscribers a week gets you there by Dec 31").
  - Milestone goals get a checklist.
  - Linked habits, tasks, notes and events.
- **New goal pop-up:**
  - Name with idea chips.
  - **Area as one row of 4 buttons**, then a large **Why it matters** box.
  - Measure: Reach a number (start → target, unit), Hit milestones (list), or Done or not.
  - By when: quick date buttons.
  - Links to habits, tasks and events. For linked habits there's "count check-ins toward this goal" with an amount per check-in.
  - Weekly check-in reminder.
  - **The Plan** panel works out the needed pace per week and per day.

### Settings (`Settings.dc.html`)

- **Sidebar:** 280px with a search box that filters sections by name or setting, in four groups:
  - **You:** Profile
  - **App:** General, Appearance, Home screen, Notifications, Keyboard shortcuts, Accessibility
  - **Features:** Notes, Schedule, Tasks, Habits and goals
  - **Data:** Connected accounts, Storage and backup, Privacy, About
- **Appearance:** 4 theme preview cards (clicking one reskins the app live), match Windows light/dark, accent override, Mica or Acrylic, headline font, text size, density, and sidebar style.
- **Every row is one of:** switch, segmented control, dropdown, button, path with Change, key caps, color swatches, or account (Connect / Disconnect).
- Changes save immediately (no Save button).

---

## 8. Accessibility rules

- Use real `<button>`, `<a>`, `<input>` and `<label>` elements. Icon-only buttons need `aria-label`.
- Text contrast is at least 4.5:1 (3:1 for 24px and up). `faint` is never used for text.
- Colors that must be told apart also differ in lightness.
- Focus ring: 2px `currentColor` outline with 2px offset on `:focus-visible` (Settings can make it always visible).
- Respect Reduce motion: no pulse, no transitions.
- Screen reader announcements for changes like a task moving or a streak going up.
