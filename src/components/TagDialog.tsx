import { useState } from "react";
import clsx from "clsx";
import Dialog, { Button, Field, inputClass } from "./Dialog";
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
      width={360}
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
      {duplicate && <div className="-mt-2 mb-2 text-[12px] text-[#e5484d]">A tag with that name already exists.</div>}
      <Field label="Color">
        <div className="flex flex-wrap gap-1.5">
          {tagPresets.map((c) => (
            <button
              key={c}
              className={clsx("h-6 w-6 rounded-full border-2", color.toUpperCase() === c ? "border-fg" : "border-transparent")}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-line" title="Custom color">
            <span
              className="absolute inset-0"
              style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)" }}
            />
            <input
              type="color"
              className="absolute inset-0 cursor-pointer opacity-0"
              value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#000000"}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
            />
          </label>
        </div>
      </Field>
      <div className="flex items-center gap-2">
        <span className="h-4 w-4 rounded-full" style={{ background: color }} />
        <input className={clsx(inputClass, "w-28 font-mono")} value={color} onChange={(e) => setColor(e.target.value)} />
      </div>
    </Dialog>
  );
}
