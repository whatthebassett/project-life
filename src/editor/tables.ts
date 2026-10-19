import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { CellSelection, TableMap, cellAround, findTable, moveTableColumn, selectedRect } from "@tiptap/pm/tables";
import { Table } from "@tiptap/extension-table";
import { motionReduced } from "../lib/motion";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";

// Alignment for each table cell: left, center or right, and top (the
// default), middle or bottom.
//
// Markdown tables only align whole columns (the colons in the --- row), and
// can't align vertically at all. So what a table needs beyond that is saved in
// HTML comments on the lines above it, which other Markdown apps hide. Each
// row of the table is a group of words, separated by slashes; "-" in the
// align grid means no alignment of its own:
//   <!-- align: - center / right - -->
//   <!-- valign: top middle / bottom top -->
//   | a | b |
//   | - | - |
//   | c | d |
// The align comment is written only when cells in a column differ, so other
// apps still see the column alignment. A grid with no slashes gives each
// column's value for every row.
//
// Merged cells are a comment too, naming each merge's corners the way a
// spreadsheet does: columns A, B, C…, rows 1, 2, 3… (row 1 is the header):
//   <!-- merge: B1:C1 A2:A3 -->
// The table itself is written out in full, the merged cell's text in its
// top-left corner and the rest empty, so other apps show it unmerged. The
// align and valign grids are the full grid too.

export type HAlign = "left" | "center" | "right";
export type VAlign = "top" | "middle" | "bottom";
const haligns: readonly string[] = ["left", "center", "right"];
const valigns: readonly string[] = ["top", "middle", "bottom"];

const valignAttribute = {
  valign: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const v = el.style.verticalAlign || el.getAttribute("valign");
      return v && valigns.includes(v) && v !== "top" ? v : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs.valign ? { style: `vertical-align: ${attrs.valign}` } : {}),
  },
};

export const NotedTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...valignAttribute };
  },
});

export const NotedTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...valignAttribute };
  },
});

const COMMENT = /^<!--\s*(v?align|merge):\s*([a-z0-9 :/-]+?)\s*-->[ \t]*\n/i;

type Grid = { columns?: (string | null)[]; rows?: (string | null)[][] };

function readGrid(text: string, allowed: readonly string[], none: string): Grid {
  const word = (v: string) => (allowed.includes(v) && v !== none ? v : null);
  const rows = text.toLowerCase().split("/").map((row) => row.trim().split(/\s+/).map(word));
  return rows.length === 1 ? { columns: rows[0] } : { rows };
}

const gridValue = (grid: Grid, r: number, c: number) => (grid.rows ? grid.rows[r]?.[c] : grid.columns?.[c]) ?? null;

type Tokenizer = {
  start: (src: string) => number;
  tokenize: (src: string, tokens: MarkdownToken[], lexer: { blockTokens: (src: string) => MarkdownToken[] }) => MarkdownToken | undefined;
};
const base = Table.config as unknown as {
  markdownTokenizer: Tokenizer;
  parseMarkdown: (token: MarkdownToken, h: unknown) => JSONContent;
  renderMarkdown: (node: JSONContent, h: unknown) => string;
};

// A merged cell: its top-left corner and how many rows and columns it covers.
interface Merge {
  row: number;
  col: number;
  rows: number;
  cols: number;
}

// "C2" → row 1, column 2 (counting from 0); "AA" comes after "Z".
function refOf(name: string): { row: number; col: number } | null {
  const m = /^([A-Z]+)(\d+)$/.exec(name.toUpperCase());
  if (!m || Number(m[2]) < 1) return null;
  let col = 0;
  for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
  return { row: Number(m[2]) - 1, col: col - 1 };
}

function nameOf(row: number, col: number): string {
  let letters = "";
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) letters = String.fromCharCode(65 + ((c - 1) % 26)) + letters;
  return letters + (row + 1);
}

function readMerges(text: string): Merge[] {
  return text
    .trim()
    .split(/\s+/)
    .flatMap((range) => {
      const [a, b] = range.split(":");
      const from = refOf(a);
      const to = b ? refOf(b) : null;
      if (!from || !to) return [];
      const row = Math.min(from.row, to.row);
      const col = Math.min(from.col, to.col);
      const merge = { row, col, rows: Math.max(from.row, to.row) - row + 1, cols: Math.max(from.col, to.col) - col + 1 };
      return merge.rows * merge.cols > 1 ? [merge] : [];
    });
}

// The table as a full grid, a cell for every row and column: a merged cell
// in its top-left corner and an empty one (with its alignment) everywhere
// else it covers. And the merges, to write in the comment.
function expand(node: JSONContent): { rows: JSONContent[][]; merges: Merge[] } {
  const source = node.content ?? [];
  const rows: JSONContent[][] = source.map(() => []);
  const merges: Merge[] = [];
  source.forEach((row, r) => {
    let c = 0;
    for (const cell of row.content ?? []) {
      while (rows[r][c]) c++;
      const cols = Math.max(1, Number(cell.attrs?.colspan) || 1);
      const down = Math.min(Math.max(1, Number(cell.attrs?.rowspan) || 1), source.length - r);
      if (cols > 1 || down > 1) merges.push({ row: r, col: c, rows: down, cols });
      for (let i = 0; i < down; i++)
        for (let j = 0; j < cols; j++)
          rows[r + i][c + j] =
            i || j ? { type: cell.type, attrs: { align: cell.attrs?.align ?? null, valign: cell.attrs?.valign ?? null }, content: [{ type: "paragraph" }] } : cell;
      c += cols;
    }
  });
  const width = Math.max(0, ...rows.map((r) => r.length));
  for (const r of rows) for (let c = 0; c < width; c++) r[c] ??= { type: "tableCell", content: [{ type: "paragraph" }] };
  return { rows, merges };
}

const hasText = (cell: JSONContent) => (cell.content ?? []).some((block) => (block.content ?? []).length > 0);

// Merges a full grid back: each merge's corner cell takes its rows and
// columns (and any text another app put in the cells it covers), and the
// covered cells go. A merge that runs off the table or overlaps an earlier
// one is left out.
function applyMerges(node: JSONContent, merges: Merge[]) {
  const rows = (node.content ?? []).map((row) => row.content ?? []);
  const taken = rows.map((row) => row.map(() => false));
  const covered = rows.map((row) => row.map(() => false));
  for (const m of merges) {
    const inside = m.row + m.rows <= rows.length && rows.slice(m.row, m.row + m.rows).every((row) => m.col + m.cols <= row.length);
    if (!inside) continue;
    let free = true;
    for (let r = m.row; r < m.row + m.rows; r++) for (let c = m.col; c < m.col + m.cols; c++) if (taken[r][c]) free = false;
    if (!free) continue;
    const corner = rows[m.row][m.col];
    const extra: JSONContent[] = [];
    for (let r = m.row; r < m.row + m.rows; r++)
      for (let c = m.col; c < m.col + m.cols; c++) {
        taken[r][c] = true;
        if (r === m.row && c === m.col) continue;
        covered[r][c] = true;
        if (hasText(rows[r][c])) extra.push(...(rows[r][c].content ?? []));
      }
    corner.attrs = { ...(corner.attrs ?? {}), colspan: m.cols, rowspan: m.rows };
    if (extra.length) corner.content = [...(hasText(corner) ? (corner.content ?? []) : []), ...extra];
  }
  (node.content ?? []).forEach((row, r) => {
    row.content = (row.content ?? []).filter((_, c) => !covered[r][c]);
  });
}

type CellGrids = { align?: Grid; valign?: Grid; merge?: Merge[] };

export const NotedTable = Table.extend({
  addProseMirrorPlugins() {
    return [...(this.parent?.() ?? []), columnLook];
  },

  markdownTokenizer: {
    name: "table",
    level: "block",
    start: (src: string) => {
      const table = base.markdownTokenizer.start(src);
      const comment = src.search(/^<!--\s*(v?align|merge):/im);
      return table < 0 ? comment : comment < 0 ? table : Math.min(table, comment);
    },
    tokenize(src, tokens, lexer) {
      // The comments (either or both, in any order), then the table they
      // describe, up to the next blank line.
      const grids: CellGrids = {};
      let head = "";
      for (let m = COMMENT.exec(src); m; m = COMMENT.exec(src.slice(head.length))) {
        const kind = m[1].toLowerCase();
        if (kind === "align") grids.align = readGrid(m[2], haligns, "");
        else if (kind === "valign") grids.valign = readGrid(m[2], valigns, "top");
        else grids.merge = readMerges(m[2]);
        head += m[0];
      }
      if (!head) return base.markdownTokenizer.tokenize(src, tokens as MarkdownToken[], lexer as never);
      const rest = src.slice(head.length);
      const end = rest.indexOf("\n\n");
      const table = lexer.blockTokens(end < 0 ? rest : rest.slice(0, end))[0];
      if (table?.type !== "table" || !table.raw) return undefined;
      return { ...table, raw: head + table.raw, cells: grids };
    },
  },

  parseMarkdown: (token, h) => {
    const node = base.parseMarkdown(token, h);
    const { align, valign, merge } = (token as MarkdownToken & { cells?: CellGrids }).cells ?? {};
    if (align || valign)
      (node.content ?? []).forEach((row, r) =>
        (row.content ?? []).forEach((cell, c) => {
          const attrs = { ...(cell.attrs ?? {}) };
          // The align grid is the whole story when it's there: "-" undoes the column's alignment.
          if (align) attrs.align = gridValue(align, r, c);
          if (valign && gridValue(valign, r, c)) attrs.valign = gridValue(valign, r, c);
          cell.attrs = attrs;
        }),
      );
    if (merge?.length) applyMerges(node, merge);
    return node;
  },

  renderMarkdown: (node, h) => {
    const { rows, merges } = expand(node);
    const table = base.renderMarkdown({ ...node, content: rows.map((cells) => ({ type: "tableRow", content: cells })) }, h);
    const comments: string[] = [];

    // Markdown's --- row takes each column's first alignment; a cell that
    // differs from that needs the align grid to come back the same.
    const column: (string | null)[] = [];
    for (const row of rows) row.forEach((cell, c) => (column[c] ??= (cell.attrs?.align as string | null) ?? null));
    const aligns = rows.map((row) => row.map((cell) => (cell.attrs?.align as string | null) ?? null));
    if (aligns.some((row) => row.some((a, c) => a !== (column[c] ?? null))))
      comments.push(`<!-- align: ${aligns.map((row) => row.map((a) => a ?? "-").join(" ")).join(" / ")} -->`);

    const valignRows = rows.map((row) => row.map((cell) => (cell.attrs?.valign as string | null) ?? "top"));
    if (valignRows.some((row) => row.some((v) => v !== "top")))
      comments.push(`<!-- valign: ${valignRows.map((row) => row.join(" ")).join(" / ")} -->`);

    if (merges.length) comments.push(`<!-- merge: ${merges.map((m) => `${nameOf(m.row, m.col)}:${nameOf(m.row + m.rows - 1, m.col + m.cols - 1)}`).join(" ")} -->`);

    if (!comments.length) return table;
    // The comments sit directly above the table's first row, after any blank
    // lines the table writes before itself, so they read back as one.
    const lead = /^\s*/.exec(table)![0];
    return `${lead}${comments.join("\n")}\n${table.slice(lead.length)}`;
  },
});

// Both alignments are kept per cell: the selected cells, or the one with the cursor.
export function alignCells(editor: Editor, align: HAlign) {
  editor.chain().focus().setCellAttribute("align", align).run();
}

export function valignCells(editor: Editor, valign: VAlign) {
  editor.chain().focus().setCellAttribute("valign", valign === "top" ? null : valign).run();
}

// Selects everything in the cell the cursor is in (Ctrl+Shift+A), rather than
// the whole note. With several cells selected, the one the selection ends in.
export function selectCellContents(editor: Editor): boolean {
  const { state } = editor;
  const $cell = cellAround(state.selection.$head);
  const cell = $cell?.nodeAfter;
  if (!$cell || !cell) return false;
  const selection = TextSelection.between(state.doc.resolve($cell.pos + 1), state.doc.resolve($cell.pos + cell.nodeSize - 1));
  editor.view.dispatch(state.tr.setSelection(selection));
  editor.view.focus();
  return true;
}

export function cellVAlign(editor: Editor): VAlign {
  const v = (editor.getAttributes("tableCell").valign ?? editor.getAttributes("tableHeader").valign) as string | null;
  return v === "middle" || v === "bottom" ? v : "top";
}

// ----- moving columns -----
//
// Columns move with everything in their cells (alignment and width too): by
// dragging the grip above one (components/ColumnHandle.tsx), or Move column
// left and right in the table menu. The moved column ends up selected, and
// every column that changed places slides into its new one.
//
// While a column is dragged, nothing in the note changes yet: its cells are
// lifted and follow the pointer (by --column-drag-x, set on a box around the
// note), and the columns it passes slide aside to open its new place. Letting
// go makes the move, and everything settles from where it is on screen.

// What a drag shows, by cell position: the lifted cells, and how far each
// other cell is shifted (0 for the ones that aren't, so they can slide back).
export interface ColumnLook {
  lifted: Set<number>;
  shifts: Map<number, number>;
}

const lookKey = new PluginKey<DecorationSet>("columnLook");

const columnLook = new Plugin<DecorationSet>({
  key: lookKey,
  state: {
    init: () => DecorationSet.empty,
    apply(tr, set) {
      const look = tr.getMeta(lookKey) as ColumnLook | null | undefined;
      if (look === undefined) return tr.docChanged ? DecorationSet.empty : set;
      if (look === null) return DecorationSet.empty;
      const decos: Decoration[] = [];
      const cell = (pos: number, attrs: Record<string, string>) => {
        const node = tr.doc.nodeAt(pos);
        if (node) decos.push(Decoration.node(pos, pos + node.nodeSize, attrs));
      };
      look.lifted.forEach((pos) => cell(pos, { class: "column-lifted" }));
      look.shifts.forEach((x, pos) => cell(pos, { class: "column-shift", style: `transform: translateX(${x}px)` }));
      return DecorationSet.create(tr.doc, decos);
    },
  },
  props: { decorations: (state) => lookKey.getState(state) },
});

export function setColumnLook(view: EditorView, look: ColumnLook | null) {
  view.dispatch(view.state.tr.setMeta(lookKey, look).setMeta("addToHistory", false));
}

// Puts a drag back: every cell glides home from wherever it is on screen,
// the lifted ones (by position) over the rest.
export function dropColumnLook(view: EditorView, tablePos: number, lifted: Iterable<number>) {
  const before = cellBoxes(view, tablePos);
  const nodes = new Set([...lifted].map((pos) => view.state.doc.nodeAt(pos)));
  setColumnLook(view, null);
  slide(view, tablePos, before, nodes);
}

// The column the cursor (or the first selected cell) is in, of how many.
export function columnAt(editor: Editor): { index: number; count: number } | null {
  if (!editor.isActive("table")) return null;
  try {
    const rect = selectedRect(editor.state);
    return { index: rect.left, count: rect.map.width };
  } catch {
    return null;
  }
}

// Moves column `from` of the table at `tablePos` so it becomes column `to`.
// Each cell slides from wherever it is on screen: its old place, or for a
// drag, where the drag has it.
export function moveColumn(view: EditorView, tablePos: number, from: number, to: number): boolean {
  const table = view.state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table" || from === to) return false;
  const map = TableMap.get(table);
  if (from < 0 || to < 0 || from >= map.width || to >= map.width) return false;
  const start = tablePos + 1;
  const before = cellBoxes(view, tablePos);
  const lifted = new Set(map.cellsInRect({ left: from, right: from + 1, top: 0, bottom: map.height }).map((pos) => table.nodeAt(pos)));
  // The move finds its table from the selection, so the selection goes into
  // this table first (a selection change alone isn't an undo step).
  view.dispatch(view.state.tr.setSelection(CellSelection.colSelection(view.state.doc.resolve(start + map.map[from]))));
  const moved = moveTableColumn({ from, to, pos: start })(view.state, view.dispatch);
  if (moved) slide(view, tablePos, before, lifted);
  view.focus();
  return moved;
}

interface CellBox {
  node: PMNode;
  el: HTMLElement;
  left: number;
}

// A table's cells row by row, with where each one is on screen.
function cellBoxes(view: EditorView, tablePos: number): CellBox[][] {
  const table = view.state.doc.nodeAt(tablePos);
  const rows: CellBox[][] = [];
  table?.forEach((row, rowOffset) => {
    const cells: CellBox[] = [];
    row.forEach((node, cellOffset) => {
      const el = view.nodeDOM(tablePos + 2 + rowOffset + cellOffset) as HTMLElement | null;
      if (el) cells.push({ node, el, left: el.getBoundingClientRect().left });
    });
    rows.push(cells);
  });
  return rows;
}

// The colour behind a cell, for a moving cell to cover the ones it passes.
export function backdrop(el: HTMLElement): string {
  for (let e: HTMLElement | null = el; e; e = e.parentElement) {
    const bg = getComputedStyle(e).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return "transparent";
}

// Each cell starts where it was before the move and glides to where it is
// now. The table rebuilds its cells when a column moves, so each new cell is
// matched to the old one in its row with the same contents; the moved
// column's cells ride above the others.
function slide(view: EditorView, tablePos: number, before: CellBox[][], lifted: Set<PMNode | null>) {
  if (motionReduced()) return;
  const after = cellBoxes(view, tablePos);
  after.forEach((cells, r) => {
    const old = before[r] ?? [];
    const used = new Set<number>();
    for (const cell of cells) {
      const i = old.findIndex((o, k) => !used.has(k) && o.node.eq(cell.node));
      if (i < 0) continue;
      used.add(i);
      const moving = lifted.has(old[i].node);
      const dx = old[i].left - cell.left;
      if (Math.abs(dx) < 1) continue;
      const look = moving ? { zIndex: "2", backgroundColor: backdrop(cell.el) } : { zIndex: "1" };
      cell.el.animate([{ ...look, transform: `translateX(${dx}px)` }, { ...look, transform: "translateX(0)" }], {
        duration: 300,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  });
}

// One column left (-1) or right (1), from where the cursor is.
export function moveColumnBy(editor: Editor, by: -1 | 1): boolean {
  const at = columnAt(editor);
  const table = findTable(editor.state.selection.$from);
  if (!at || !table) return false;
  return moveColumn(editor.view, table.pos, at.index, at.index + by);
}
