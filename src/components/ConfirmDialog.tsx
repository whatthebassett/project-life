import { useEffect, useRef } from "react";
import Dialog, { Button } from "./Dialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  okLabel?: string;
  // No cancel label means a plain message with one button.
  cancelLabel?: string;
  danger?: boolean;
}

interface Props extends ConfirmOptions {
  onResult: (ok: boolean) => void;
}

// The app's own confirmation and message box, in place of the system one.
export default function ConfirmDialog({ title, message, okLabel = "OK", cancelLabel, danger, onResult }: Props) {
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => ok.current?.focus(), []);
  return (
    <Dialog
      title={title}
      width={400}
      onClose={() => onResult(false)}
      footer={
        <>
          {cancelLabel && <Button onClick={() => onResult(false)}>{cancelLabel}</Button>}
          <Button ref={ok} primary={!danger} danger={danger} onClick={() => onResult(true)}>
            {okLabel}
          </Button>
        </>
      }
    >
      <p className="whitespace-pre-wrap leading-relaxed">{message}</p>
    </Dialog>
  );
}
