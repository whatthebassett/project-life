// A stand-in for the notes commands (src-tauri/src/notes.rs) when the page
// runs in a plain browser, for trying the Notes screen without the app. Notes
// live in localStorage; file names follow the same rules as the real ones.
// Never used inside the app.
import { iconOf } from "./frontmatter";

interface Stored {
  files: Record<string, { text: string; modified: number; created: number }>;
  trash: Record<string, { text: string; modified: number; created: number }>;
  meta: Record<string, string>;
}

const KEY = "project-life:notes";

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // Unreadable or blocked storage: start empty.
  }
  return { files: {}, trash: {}, meta: {} };
}

function save(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not kept; fine for a preview.
  }
}

const bad: Record<string, string> = { "/": "∕", "\\": "⧵", ":": "꞉", "*": "∗", "?": "？", '"': "＂", "<": "＜", ">": "＞", "|": "∣" };
const stem = (title: string) => title.replace(/[/\\:*?"<>|]/g, (c) => bad[c]).replace(/\s+/g, " ").replace(/\.+$/, "").trim() || "Untitled";

function unique(files: Record<string, unknown>, title: string, keep?: string): string {
  const s = stem(title);
  for (let n = 1; ; n++) {
    const name = n === 1 ? `${s}.md` : `${s} ${n}.md`;
    const taken = Object.keys(files).some((f) => f.toLowerCase() === name.toLowerCase());
    if (!taken || keep?.toLowerCase() === name.toLowerCase()) return name;
  }
}

const info = (name: string, f: { text: string; modified: number; created: number }) => ({
  name,
  modified: f.modified,
  created: f.created,
  size: f.text.length,
  icon: iconOf(f.text.slice(0, 4096)),
});

export function browserNotes(command: string, a: Record<string, unknown>): unknown {
  const s = load();
  const now = Date.now();
  const name = a.name as string;
  switch (command) {
    case "list_notes":
      return Object.entries(s.files).map(([n, f]) => info(n, f));
    case "read_note":
      if (!s.files[name]) throw `No note called ${name}`;
      return s.files[name].text;
    case "write_note":
      s.files[name] = { text: a.contents as string, modified: now, created: s.files[name]?.created ?? now };
      save(s);
      return null;
    case "create_note": {
      const n = unique(s.files, a.title as string);
      s.files[n] = { text: "", modified: now, created: now };
      save(s);
      return n;
    }
    case "seed_notes": {
      if (Object.keys(s.files).length || Object.keys(s.meta).length) return [];
      const written = (a.notes as [string, string][]).map(([title, text]) => {
        const n = unique(s.files, title);
        s.files[n] = { text, modified: now, created: now };
        return n;
      });
      save(s);
      return written;
    }
    case "rename_note": {
      const n = unique(s.files, a.title as string, name);
      if (n !== name) {
        s.files[n] = s.files[name];
        delete s.files[name];
        save(s);
      }
      return n;
    }
    case "recycle_note": {
      const d = new Date();
      const pad = (x: number) => String(x).padStart(2, "0");
      const t = `${name.replace(/\.md$/, "")}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${now.toString(16)}.md`;
      s.trash[t] = s.files[name];
      delete s.files[name];
      save(s);
      return t;
    }
    case "delete_note":
      delete s.files[name];
      save(s);
      return null;
    case "list_trash":
      return Object.entries(s.trash).map(([n, f]) => info(n, f));
    case "restore_note": {
      const title = name.replace(/\.md$/, "").replace(/-\d{8}-\d{6}-[0-9a-f]+$/, "");
      const n = unique(s.files, title);
      s.files[n] = s.trash[name];
      delete s.trash[name];
      save(s);
      return n;
    }
    case "delete_trash":
      delete s.trash[name];
      save(s);
      return null;
    case "read_meta":
      return s.meta[a.file as string] ?? null;
    case "write_meta":
      s.meta[a.file as string] = a.contents as string;
      save(s);
      return null;
    case "notes_folder_info":
      return { path: "(browser preview)", defaultPath: "(browser preview)", chosen: null, unavailable: false };
    case "fetch_link_preview":
      return null;
    default:
      throw `${command} only works in the app.`;
  }
}
