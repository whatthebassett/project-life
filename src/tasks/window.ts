// Tasks in their own window (the Pop out button, as in Checkpoint): a small
// top-level window, label "tasks", running this page under "#tasks". Both
// windows save to tasks.json and tell each other to reload (lib/api.ts
// announceData). The window-state plugin remembers where it was put.
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isMac } from "../lib/platform";
import { loadSettings, textScale } from "../lib/settings";

export const TASKS_WINDOW = "tasks";

let opening: Promise<void> | null = null;

export function openTasksWindow(): Promise<void> {
  opening ??= open().finally(() => (opening = null));
  return opening;
}

async function open(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(TASKS_WINDOW);
  if (existing) {
    if (await existing.isMinimized().catch(() => false)) await existing.unminimize().catch(() => {});
    await existing.setFocus().catch(() => {});
    return;
  }
  const settings = await loadSettings();
  const zoom = textScale[settings.TextSize] ?? 1;
  const created = new WebviewWindow(TASKS_WINDOW, {
    url: "index.html#tasks",
    title: "Tasks · Project Life",
    width: Math.round(420 * zoom),
    height: Math.round(680 * zoom),
    minWidth: 340,
    minHeight: 420,
    center: true,
    // Windows: the page draws the whole frame. A Mac keeps its own window
    // buttons, laid over the page's title bar.
    ...(isMac ? { decorations: true, titleBarStyle: "overlay" as const, hiddenTitle: true, trafficLightPosition: new LogicalPosition(14, 16) } : { decorations: false }),
    visible: false,
    resizable: true,
    focus: true,
    backgroundColor: "#0A0C11",
  });
  await new Promise<void>((resolve) => {
    void created.once("tauri://created", () => resolve());
    void created.once("tauri://error", (e) => {
      console.error("Couldn't open the tasks window", e.payload);
      resolve();
    });
    setTimeout(resolve, 3000);
  });
}

export const isTasksWindow = () => window.location.hash === "#tasks";
