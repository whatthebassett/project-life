import type { Editor, JSONContent, MarkdownToken } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";
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

const COMMENT = /^<!--\s*(v?align):\s*([a-z /-]+?)\s*-->[ \t]*\n/i;

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

type CellGrids = { align?: Grid; valign?: Grid };

export const NotedTable = Table.extend({
  markdownTokenizer: {
    name: "table",
    level: "block",
    start: (src: string) => {
      const table = base.markdownTokenizer.start(src);
      const comment = src.search(/^<!--\s*v?align:/im);
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
        else grids.valign = readGrid(m[2], valigns, "top");
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
    const { align, valign } = (token as MarkdownToken & { cells?: CellGrids }).cells ?? {};
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
    return node;
  },

  renderMarkdown: (node, h) => {
    const table = base.renderMarkdown(node, h);
    const rows = (node.content ?? []).map((row) => row.content ?? []);
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

export function cellVAlign(editor: Editor): VAlign {
  const v = (editor.getAttributes("tableCell").valign ?? editor.getAttributes("tableHeader").valign) as string | null;
  return v === "middle" || v === "bottom" ? v : "top";
}
