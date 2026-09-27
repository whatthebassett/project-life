// YAML front matter: the "---" block at the very top of a note. Noted keeps it
// exactly as written (other apps put their own keys there) and only edits the
// lines it owns, "cover:" and "icon:". The Visual editor never sees the block;
// it gets the note's body, and the block is put back in front when the note
// saves.

const BLOCK = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export interface Split {
  // The whole block, fences and newline included; "" when the note has none.
  head: string;
  yaml: string | null;
  body: string;
}

// Only YAML-looking lines count, so a note that merely starts with a "---"
// divider isn't mistaken for front matter.
const yamlLine = /^(?:\s|#|-\s|[\w.-]+\s*:)/;

export function splitFront(md: string): Split {
  const m = BLOCK.exec(md);
  if (!m) return { head: "", yaml: null, body: md };
  const yaml = m[1] ?? "";
  if (!yaml.split(/\r?\n/).every((l) => !l.trim() || yamlLine.test(l))) return { head: "", yaml: null, body: md };
  return { head: m[0], yaml, body: md.slice(m[0].length) };
}

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  return v.replace(/\s+#.*$/, "");
}

const keyLine = (key: string) => new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:(.*)$`);

export function readKey(yaml: string | null, key: string): string | null {
  if (!yaml) return null;
  for (const line of yaml.split(/\r?\n/)) {
    const m = keyLine(key).exec(line);
    if (m) return unquote(m[1]) || null;
  }
  return null;
}

// The note's cover image: "cover", or "banner" as the Obsidian Banners plugin writes it.
export function coverOf(md: string): string | null {
  const { yaml } = splitFront(md);
  return readKey(yaml, "cover") ?? readKey(yaml, "banner");
}

// Where the cover picture sits in its frame, as a CSS object-position
// ("50% 30%"), from dragging it in the note header. Project Life's own key;
// other apps (Checkpoint included) keep it without using it.
export function coverPositionOf(md: string): string | null {
  const pos = readKey(splitFront(md).yaml, "cover-position");
  return pos && /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test(pos) ? pos : null;
}

// The note with its cover set (or removed with null). A new picture starts
// centered again. Every other line of the front matter stays as it was.
export function withCover(md: string, cover: string | null): string {
  const isCover = (l: string) => keyLine("cover").test(l) || keyLine("banner").test(l) || keyLine("cover-position").test(l);
  return withFront(md, isCover, cover ? [`cover: ${JSON.stringify(cover)}`] : []);
}

// The note with its cover moved (null, or the middle: the line goes). It
// goes just below the cover's own line.
export function withCoverPosition(md: string, pos: string | null): string {
  const add = pos && pos !== "50% 50%" ? [`cover-position: ${JSON.stringify(pos)}`] : [];
  const afterCover = (lines: string[]) => lines.findIndex((l) => keyLine("cover").test(l) || keyLine("banner").test(l)) + 1;
  return withFront(md, (l) => keyLine("cover-position").test(l), add, afterCover);
}

// The note's icon: one emoji shown above its title and beside its name in
// lists ("icon:"). Anything longer than an emoji or two is ignored.
export function iconOf(md: string): string | null {
  const icon = readKey(splitFront(md).yaml, "icon");
  return icon && icon.length <= 16 && !/\s/.test(icon) ? icon : null;
}

// The note with its icon set (or removed with null); it goes at the top.
export function withIcon(md: string, icon: string | null): string {
  return withFront(md, (l) => keyLine("icon").test(l), icon ? [`icon: ${JSON.stringify(icon)}`] : []);
}

// Drops the front matter lines `drop` matches and puts `add` in, at the top
// or where `at` says (given the lines that are left); a block left empty is
// dropped.
function withFront(md: string, drop: (line: string) => boolean, add: string[], at: (lines: string[]) => number = () => 0): string {
  const { yaml, body } = splitFront(md);
  const lines = (yaml ? yaml.split(/\r?\n/) : []).filter((l) => !drop(l));
  lines.splice(at(lines), 0, ...add);
  if (lines.every((l) => !l.trim())) return yaml === null ? body : body.replace(/^\r?\n/, "");
  // A new block gets a blank line after it; an existing one keeps its spacing.
  const gap = yaml === null && body && !body.startsWith("\n") ? "\n" : "";
  return `---\n${lines.join("\n")}\n---\n${gap}${body}`;
}
