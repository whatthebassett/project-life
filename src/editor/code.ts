import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { all, createLowlight } from "lowlight";
import hljs from "highlight.js/lib/core";
import CodeBlockView from "../components/CodeBlockView";

// Syntax highlighting for code blocks, with every highlight.js language.
export const lowlight = createLowlight(all);

// The label new code blocks get; Settings → Code languages sets it.
let defaultLanguage = "text";
export const setDefaultCodeLanguage = (label: string | undefined) => void (defaultLanguage = label?.trim() || "text");
export const codeLanguage = () => defaultLanguage;

export interface LanguageInfo {
  id: string;
  name: string;
  aliases: string[];
}

let infos: LanguageInfo[] | null = null;

// Every label code blocks understand, with display names and aliases.
export function codeLanguages(): LanguageInfo[] {
  if (infos) return infos;
  const hl = hljs.newInstance();
  for (const [id, grammar] of Object.entries(all)) hl.registerLanguage(id, grammar);
  const known = lowlight
    .listLanguages()
    .filter((id) => id !== "plaintext")
    .map((id) => {
      const def = hl.getLanguage(id);
      return { id, name: def?.name ?? id, aliases: def?.aliases ?? [] };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  infos = [{ id: "text", name: "Plain text", aliases: ["txt", "plaintext"] }, ...known];
  return infos;
}

export function languageName(label: string | null | undefined): string {
  if (!label) return "Plain text";
  const l = label.toLowerCase();
  const hit = codeLanguages().find((i) => i.id === l || i.aliases.includes(l));
  return hit?.name ?? label;
}

export const NotedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: "text" });
