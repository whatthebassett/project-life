import { useLayoutEffect, useRef, useState, type Ref } from "react";
import clsx from "clsx";
import { ImagePlus, ImageUp, Move, Trash2 } from "lucide-react";
import { titleOf } from "../lib/api";
import { priorityColor, priorityLabel, type PriorityValue, type Tag } from "../lib/notebook";
import { resolveAsset } from "../editor/images";
import { ago } from "../home/time";

interface Props {
  title: string;
  titleRef: Ref<HTMLTextAreaElement>;
  onTitleChange: (title: string) => void;
  onTitleCommit: () => void;
  onTitleCancel: () => void;
  // Enter in the title moves on into the note.
  onEnterBody: () => void;
  cover: string | null;
  onChooseCover: () => void;
  onDropCover: (file: File) => void;
  onRemoveCover: () => void;
  // Where the picture sits in its frame ("50% 30%"); null is the middle.
  coverPosition: string | null;
  onCoverPosition: (pos: string | null) => void;
  // The notebooks it sits in, outermost first.
  path: string[];
  onOpenParent: (name: string) => void;
  tags: Tag[];
  priority: PriorityValue;
  onPriority: (x: number, y: number) => void;
  modified?: number;
}

// The top of a note, inside the editor (Notes.dc.html): the cover, then the
// title, then chips for its notebook, priority and tags, and when it was
// edited. Ported from Checkpoint's; laid out in the note's 660px column.
export default function NoteHeader(props: Props) {
  const { title, titleRef, cover } = props;
  const [dropping, setDropping] = useState(false);
  const [broken, setBroken] = useState(false);
  const [box, setBox] = useState<HTMLTextAreaElement | null>(null);

  // Repositioning: the spot the picture is being dragged to, until it's saved.
  const [moving, setMoving] = useState<[number, number] | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; from: [number, number] } | null>(null);

  useLayoutEffect(() => {
    setBroken(false);
    setMoving(null);
  }, [cover]);

  const saved = parsePosition(props.coverPosition);
  const shown = moving ?? saved;

  const startMoving = () => {
    setMoving(saved);
    requestAnimationFrame(() => frame.current?.focus());
  };
  const save = () => {
    if (moving) props.onCoverPosition(formatPosition(moving));
    setMoving(null);
  };

  // How far the picture reaches past the frame on each axis; dragging it
  // that far takes it from one end to the other.
  const overflow = (): [number, number] => {
    const f = frame.current;
    const i = img.current;
    if (!f || !i || !i.naturalWidth || !i.naturalHeight) return [0, 0];
    const scale = Math.max(f.clientWidth / i.naturalWidth, f.clientHeight / i.naturalHeight);
    return [i.naturalWidth * scale - f.clientWidth, i.naturalHeight * scale - f.clientHeight];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!moving || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, from: moving };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [ox, oy] = overflow();
    // Dragging the picture down shows more of its top, so the spot goes up.
    setMoving([
      ox > 0 ? clamp(d.from[0] - ((e.clientX - d.x) / ox) * 100) : d.from[0],
      oy > 0 ? clamp(d.from[1] - ((e.clientY - d.y) / oy) * 100) : d.from[1],
    ]);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  // Arrow keys move the picture the way it's dragged (Shift for bigger steps).
  const onFrameKey = (e: React.KeyboardEvent) => {
    if (!moving) return;
    const step = e.shiftKey ? 10 : 2;
    const nudge: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (e.key in nudge) {
      const [dx, dy] = nudge[e.key];
      const [ox, oy] = overflow();
      setMoving((m) => m && [ox > 0 ? clamp(m[0] + dx) : m[0], oy > 0 ? clamp(m[1] + dy) : m[1]]);
    } else if (e.key === "Enter") save();
    else if (e.key === "Escape") setMoving(null);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // The title grows onto more lines rather than scrolling sideways.
  useLayoutEffect(() => {
    if (!box) return;
    box.style.height = "0px";
    box.style.height = `${box.scrollHeight}px`;
  }, [box, title]);

  const setRefs = (el: HTMLTextAreaElement | null) => {
    setBox(el);
    if (typeof titleRef === "function") titleRef(el);
    else if (titleRef) (titleRef as { current: HTMLTextAreaElement | null }).current = el;
  };

  const drop = (e: React.DragEvent) => {
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    setDropping(false);
    if (!file) return;
    e.preventDefault();
    props.onDropCover(file);
  };

  return (
    <div
      className="note-header group/header mx-auto box-content flex max-w-(--note-width) flex-col gap-[18px] px-10 pt-7 pb-[18px]"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.items).some((i) => i.type.startsWith("image/"))) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={drop}
    >
      {cover || dropping ? (
        <div
          ref={frame}
          className={clsx(
            "group/cover relative h-[136px] touch-none overflow-hidden rounded-[20px] border border-line bg-panel outline-none select-none",
            moving && "cursor-grab ring-2 ring-accent active:cursor-grabbing",
          )}
          tabIndex={moving ? 0 : undefined}
          aria-label={moving ? "Cover picture: drag it, or use the arrow keys, to move it" : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onFrameKey}
        >
          {cover && !broken && (
            <img
              ref={img}
              src={resolveAsset(cover)}
              alt=""
              className="pointer-events-none h-full w-full object-cover"
              style={{ objectPosition: formatPosition(shown) }}
              draggable={false}
              onError={() => setBroken(true)}
            />
          )}
          {cover && broken && <div className="flex h-full items-center justify-center text-12 text-muted">Couldn't load {cover}</div>}
          {dropping && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center border-2 border-dashed border-accent bg-accent-soft text-13 text-accent">
              Drop to use as the cover
            </div>
          )}
          {cover && moving && (
            <>
              <div className="pointer-events-none absolute inset-x-0 bottom-[14px] flex justify-center">
                <span className="flex h-8 items-center gap-1.5 rounded-[10px] border border-line bg-bg px-3 text-12 font-medium text-text">
                  <Move size={13} /> Drag the picture to move it
                </span>
              </div>
              <div className="absolute top-[14px] right-[14px] flex gap-1.5">
                <CoverButton label="Reset" onClick={() => setMoving([50, 50])} />
                <CoverButton label="Cancel" onClick={() => setMoving(null)} />
                <CoverButton label="Save position" primary onClick={save} />
              </div>
            </>
          )}
          {cover && !moving && (
            <div className="absolute top-[14px] right-[14px] flex gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100">
              {!broken && <CoverButton icon={<Move size={13} />} label="Reposition" onClick={startMoving} />}
              <CoverButton icon={<ImageUp size={13} />} label="Change cover" onClick={props.onChooseCover} />
              <CoverButton icon={<Trash2 size={13} />} label="Remove" onClick={props.onRemoveCover} />
            </div>
          )}
        </div>
      ) : (
        <div className="-mb-3 flex h-7 items-end">
          <button
            className="flex h-7 items-center gap-1.5 rounded-[8px] px-2 text-12 text-muted opacity-0 transition-opacity hover:bg-panel hover:text-text focus:opacity-100 group-hover/header:opacity-100"
            onClick={props.onChooseCover}
          >
            <ImagePlus size={13} /> Add cover
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <textarea
          ref={setRefs}
          rows={1}
          spellCheck={false}
          aria-label="Note title"
          placeholder="Untitled"
          className="note-title m-0 block w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-head text-40 leading-[1.1] font-bold tracking-[-0.015em] text-text outline-none placeholder:text-faint"
          value={title}
          onChange={(e) => props.onTitleChange(e.target.value.replace(/[\r\n]+/g, " "))}
          onBlur={props.onTitleCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              // Leaving the title saves it (onBlur); then on into the note.
              e.preventDefault();
              e.currentTarget.blur();
              props.onEnterBody();
            } else if (e.key === "Escape") {
              e.preventDefault();
              props.onTitleCancel();
              e.currentTarget.blur();
            }
          }}
        />

        <div className="flex flex-wrap items-center gap-2 text-12">
          {props.path.length > 0 && (
            <span className="flex h-7 items-center gap-1 rounded-[8px] border border-line bg-panel px-[10px] text-muted">
              {props.path.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden="true">/</span>}
                  <button className="hover:text-text hover:underline" onClick={() => props.onOpenParent(p)}>
                    {titleOf(p)}
                  </button>
                </span>
              ))}
            </span>
          )}
          {props.priority > 0 && (
            <button
              className="flex h-7 items-center gap-1.5 rounded-[8px] border border-line bg-panel px-[10px] font-medium transition-colors hover:border-faint"
              style={{ color: priorityColor[props.priority] }}
              onClick={(e) => props.onPriority(e.clientX, e.clientY)}
              title="Change priority"
            >
              <span className="h-[7px] w-[7px] rounded-full" style={{ background: priorityColor[props.priority] }} />
              {priorityLabel[props.priority]} priority
            </button>
          )}
          {props.tags.map((t) => (
            <span key={t.Id} className="flex h-7 items-center rounded-[8px] bg-accent-soft px-[10px] font-medium text-accent">
              #{t.Name}
            </span>
          ))}
          {props.modified !== undefined && props.modified > 0 && <span className="ml-1 text-muted">Edited {ago(props.modified, Date.now())}</span>}
        </div>
      </div>
    </div>
  );
}

function CoverButton({ icon, label, primary, onClick }: { icon?: React.ReactNode; label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      className={clsx(
        "flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-12 font-medium",
        primary ? "border-accent bg-accent text-accent-ink" : "border-line bg-bg text-text",
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function parsePosition(pos: string | null): [number, number] {
  const m = pos ? /^([\d.]+)% ([\d.]+)%$/.exec(pos) : null;
  return m ? [clamp(Number(m[1])), clamp(Number(m[2]))] : [50, 50];
}

function formatPosition([x, y]: [number, number]): string {
  return `${Math.round(x * 10) / 10}% ${Math.round(y * 10) / 10}%`;
}
