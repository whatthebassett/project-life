// Which system Project Life is running on, and the words that change with it.
// The Windows build is the original; the Mac one swaps Ctrl for ⌘, the tray
// for the menu bar, and so on.
export const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

// "Windows" or "macOS", for labels such as "Match macOS light and dark".
export const osName = isMac ? "macOS" : "Windows";
// "this PC" or "this Mac".
export const thisComputer = isMac ? "this Mac" : "this PC";
// Where sign-ins and passwords are kept.
export const secretStore = isMac ? "your Mac’s Keychain" : "Windows Credential Manager";
// The system's file browser.
export const fileBrowser = isMac ? "Finder" : "File Explorer";
// The folder separator, for paths shown in Settings ("Data\Logs").
export const pathSep = isMac ? "/" : "\\";

// Help text written for Windows ("Ctrl Shift X", "Ctrl+click", "this PC"), as
// a Mac says it ("⇧⌘X", "⌘-click", "this Mac"). Ctrl Tab stays on the Mac's
// Control key: ⌘Tab belongs to macOS.
export function wording(text: string): string {
  if (!isMac) return text;
  return text
    .replace(/Ctrl Tab/g, "Control Tab")
    .replace(/Ctrl\+click/g, "⌘-click")
    .replace(/Ctrl Shift (Enter|\S)/g, "⇧⌘$1")
    .replace(/Ctrl Alt (\S)/g, "⌥⌘$1")
    .replace(/Ctrl (\S)/g, "⌘$1")
    .replace(/this PC/g, "this Mac")
    .replace(/your PC/g, "your Mac");
}
