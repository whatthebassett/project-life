import { useEffect, useMemo, useState } from "react";
import { api, titleOf } from "../lib/api";
import { splitFront } from "../lib/frontmatter";
import { lookup } from "../lib/notebook";
import { useNotes } from "../notes/NotesContext";
import type { HomeNote } from "./sources";

// The first line of real text in a note: no headings, block marks, tables or
// Markdown symbols.
export function snippetOf(markdown: string): string {
  const body = splitFront(markdown).body;
  let fence = false;
  for (const raw of body.split("\n")) {
    if (/^(```|~~~)/.test(raw)) fence = !fence;
    if (fence) continue;
    const line = raw
      .replace(/^\s*(#{1,6}\s|>\s?(\[![\w-]+\][+-]?)?|[-*+]\s(\[[ xX]\]\s)?|\d+[.)]\s|\|)/, "")
      .replace(/<[^>]+>/g, "")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_~`|]+/g, "")
      .trim();
    if (line && !/^-{3,}$/.test(line)) return line;
  }
  return "";
}

const snippets = new Map<string, string>();

// The three most recently edited notes, for Home (Checkpoint's "recent":
// a note's last edit is its file's time or its own record, whichever is later).
export function useRecentNotes(): HomeNote[] {
  const { notes, stats } = useNotes();
  const recent = useMemo(
    () =>
      notes
        .map((n) => ({ name: n.name, edited: Math.max(n.modified, lookup(stats, n.name)?.LastEdited ?? 0) }))
        .sort((a, b) => b.edited - a.edited)
        .slice(0, 3),
    [notes, stats],
  );
  const [, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    for (const r of recent) {
      const key = `${r.name}:${r.edited}`;
      if (snippets.has(key)) continue;
      void api
        .readNote(r.name)
        .then((text) => {
          snippets.set(key, snippetOf(text));
          if (alive) setVersion((v) => v + 1);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [recent]);

  return recent.map((r) => ({ id: r.name, title: titleOf(r.name), edited: r.edited, snippet: snippets.get(`${r.name}:${r.edited}`) ?? "" }));
}
