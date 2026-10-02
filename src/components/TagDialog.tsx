import { useState } from "react";
import Dialog, { Button, Field, inputClass } from "./Dialog";
import { TagColors } from "./TagManager";
import { tagPresets, type Tag } from "../lib/notebook";

interface Props {
  tag?: Tag;
  existing: Tag[];
  onSave: (name: string, color: string) => void;
  onClose: () => void;
}

export default function TagDialog({ tag, existing, onSave, onClose }: Props) {
  const [name, setName] = useState(tag?.Name ?? "");
  const [color, setColor] = useState(tag?.Color ?? tagPresets[0]);
  const cleaned = name.trim().replace(/\s+/g, " ");
  const duplicate = existing.some((t) => t.Id !== tag?.Id && t.Name.toLowerCase() === cleaned.toLowerCase());
  const valid = cleaned.length > 0 && cleaned.length <= 40 && /^#[0-9a-f]{6}$/i.test(color) && !duplicate;

  const save = () => valid && onSave(cleaned, color.toUpperCase());

  return (
    <Dialog
      title={tag ? "Edit tag" : "New tag"}
      width={420}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!valid} onClick={save}>
            {tag ? "Save" : "Create"}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <input
          autoFocus
          className={inputClass}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Field>
      {duplicate && <div className="-mt-2 mb-2 text-12 text-danger">A tag with that name already exists.</div>}
      <div className="mb-1.5 text-12 text-muted">Color</div>
      <TagColors value={color} onChange={setColor} onHex={setColor} />
    </Dialog>
  );
}
