import clsx from "clsx";
import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { zoomOut } from "../lib/motion";
import { Button, IconButton } from "./Button";

// Pop-ups open over the screen, below the title bar: the screen dims under
// the scrim and blurs, and only the pop-up can be used until it closes (Esc,
// the close button, Cancel, or a click on the dimmed area). Ctrl+Enter runs
// its main action.
//
// Several can be open at once (a confirm over a pop-up); only the top one
// answers Esc and keeps focus.
const stack: string[] = [];

function syncBackground() {
  const content = document.getElementById("app-content");
  if (content) content.inert = stack.length > 0;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface PopupProps {
  onClose: () => void;
  // Ctrl+Enter.
  onSubmit?: () => void;
  // The designed size; smaller windows shrink it to fit. Without a height it
  // fits its content (small dialogs).
  width: number;
  height?: number;
  // The id of the element that names the pop-up (its title); or a plain label.
  labelledBy?: string;
  label?: string;
  // Laid out as a column: header, body, footer.
  children: ReactNode;
  className?: string;
  // Liquid glass (the command palette): the screen barely dims, and the
  // pop-up is a pane of frosted glass it shows through (index.css).
  glass?: boolean;
}

export function Popup({ onClose, onSubmit, width, height, labelledBy, label, children, className, glass }: PopupProps) {
  const id = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onClose, onSubmit });
  handlers.current = { onClose, onSubmit };
  // What had focus before, noted on the first render: by the time effects
  // run, a field inside (a title with autoFocus) has already taken it.
  const opener = useRef<HTMLElement | null | undefined>(undefined);
  if (opener.current === undefined) opener.current = document.activeElement as HTMLElement | null;

  // Join the stack, take focus, and give it back where it was on the way out.
  useLayoutEffect(() => {
    const before = opener.current;
    stack.push(id);
    syncBackground();
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
    const el = overlay.current;
    const box = panel.current;
    return () => {
      stack.splice(stack.indexOf(id), 1);
      syncBackground();
      zoomOut(el);
      // Once it's really gone: in development React runs this and then the
      // effect again, and focus should stay where the pop-up put it.
      setTimeout(() => {
        if (!box?.isConnected && before?.isConnected) before.focus();
      });
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.current.onClose();
      } else if (e.key === "Enter" && e.ctrlKey && handlers.current.onSubmit) {
        e.preventDefault();
        handlers.current.onSubmit();
      } else if (e.key === "Tab" && panel.current) {
        // Keep Tab inside the pop-up.
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [id]);

  const layer = document.getElementById("popup-layer") ?? document.body;

  return createPortal(
    <div ref={overlay} className="pointer-events-auto absolute inset-0 flex items-center justify-center p-4">
      <div
        data-popup-scrim
        aria-hidden="true"
        className={clsx("popup-scrim absolute inset-0", glass ? "glass-scrim" : "bg-scrim backdrop-blur-[6px]")}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />
      <div
        ref={panel}
        data-popup-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={clsx(
          "popup-panel relative flex flex-col overflow-hidden rounded-[28px] text-text outline-none",
          glass ? "glass-panel" : "border border-line bg-bg shadow-[0_40px_120px_rgba(0,0,0,0.55)]",
          className,
        )}
        style={{ width: `min(${width}px, 100%)`, ...(height ? { height: `min(${height}px, 100%)` } : { maxHeight: "100%" }) }}
      >
        {children}
      </div>
    </div>,
    layer,
  );
}

interface HeaderProps {
  // The tag at the left: NEW GOAL, EDIT HABIT, TASK.
  tag: string;
  // A plain line beside the tag, or anything else (the event type tabs).
  children?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
}

// 60px: tag and subtitle on the left, close on the right.
export function PopupHeader({ tag, children, onClose, closeLabel = "Close" }: HeaderProps) {
  return (
    <div className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-line bg-side pr-4 pl-6">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-[30px] shrink-0 items-center rounded-[9px] border border-line bg-panel px-[10px] font-mono text-11 tracking-[0.08em] text-muted">
          {tag}
        </span>
        {typeof children === "string" ? <span className="truncate text-13 text-muted">{children}</span> : children}
      </div>
      <IconButton icon="close" label={closeLabel} title={`${closeLabel} (Esc)`} iconStroke={2.2} onClick={onClose} />
    </div>
  );
}

// Fills the space between header and footer. Columns go inside; a column
// that can run long scrolls on its own.
export function PopupBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("flex min-h-0 flex-1", className)}>{children}</div>;
}

interface FooterProps {
  // What will happen, in plain English: "Walk 100 miles · Health · due Dec 31".
  summary?: ReactNode;
  cancelLabel?: string;
  onCancel: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
}

// 68px: summary on the left, Cancel and the main action on the right.
export function PopupFooter({ summary, cancelLabel = "Cancel", onCancel, primaryLabel, onPrimary, primaryDisabled }: FooterProps) {
  return (
    <footer className="flex h-[68px] shrink-0 items-center justify-between gap-6 border-t border-line bg-side px-6">
      <span className="min-w-0 truncate text-13 text-muted">{summary}</span>
      <div className="flex shrink-0 items-center gap-[10px]">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="primary" hint="Ctrl Enter" disabled={primaryDisabled} onClick={onPrimary}>
          {primaryLabel}
        </Button>
      </div>
    </footer>
  );
}
