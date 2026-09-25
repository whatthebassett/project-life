import clsx from "clsx";
import type { ReactNode } from "react";
import { Button as UiButton, IconButton } from "../ui/Button";
import { Popup } from "../ui/Popup";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

// Checkpoint's small dialogs (links, tags, confirmations, the Recycle Bin),
// drawn with Project Life's pop-up shell: the scrim, Esc and click-away to
// close, focus kept inside. Same props as Checkpoint's, so its dialogs carry
// over unchanged.
export default function Dialog({ title, onClose, children, footer, width = 420, className }: Props) {
  return (
    <Popup onClose={onClose} width={width} label={title} className={className}>
      <header className="flex shrink-0 items-center justify-between gap-4 pt-5 pr-4 pb-3 pl-6">
        <h2 className="m-0 font-head text-22 font-bold tracking-[-0.01em]">{title}</h2>
        <IconButton icon="close" label="Close" title="Close (Esc)" iconStroke={2.2} onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 text-14">{children}</div>
      {footer && <footer className="flex shrink-0 justify-end gap-[10px] border-t border-line bg-side px-6 py-4">{footer}</footer>}
    </Popup>
  );
}

export function Button({
  primary,
  danger,
  className,
  ref,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean; danger?: boolean; ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <UiButton ref={ref} size="md" variant={primary ? "primary" : danger ? "danger" : "secondary"} className={className} {...rest}>
      {children}
    </UiButton>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <div className="mb-1.5 text-12 text-muted">{label}</div>
      {children}
    </label>
  );
}

export const inputClass = clsx("h-10 w-full rounded-[12px] border border-line bg-panel px-3 text-14 text-text outline-none focus:border-accent");
