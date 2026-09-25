import { useMemo, useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronDown } from "lucide-react";
import { codeLanguages, languageName } from "../editor/code";
import { PickerPopover } from "./Picker";

// A code block with its language label in the corner; click it to change
// the language, which is what follows the opening ``` in the Markdown.
export default function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const label = (node.attrs.language as string | null) ?? "";
  const options = useMemo(
    () => codeLanguages().map((l) => ({ value: l.id, label: l.name, hint: l.id, keywords: l.aliases.join(" ") })),
    [],
  );

  return (
    <NodeViewWrapper as="pre" className="code-block">
      <button
        contentEditable={false}
        className="code-lang"
        title="Change the language"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => editor.isEditable && setAnchor(e.currentTarget.getBoundingClientRect())}
      >
        {languageName(label)}
        <ChevronDown size={11} />
      </button>
      <NodeViewContent<"code"> as="code" />
      {anchor && (
        <PickerPopover
          anchor={anchor}
          options={options}
          value={label || "text"}
          placeholder="Language"
          allowCustom
          width={240}
          onPick={(language) => {
            setAnchor(null);
            updateAttributes({ language });
            editor.commands.focus();
          }}
          onClose={() => setAnchor(null)}
        />
      )}
    </NodeViewWrapper>
  );
}
