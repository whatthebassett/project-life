import { useEffect, useRef } from "react";
import Dialog, { Button } from "../components/Dialog";
import type { Scope } from "./actions";

// Changing or deleting a repeating event: that day only, or every day.
export default function ScopeDialog({ verb, onResult }: { verb: "Change" | "Delete" | "Move"; onResult: (scope: Scope | null) => void }) {
  const one = useRef<HTMLButtonElement>(null);
  useEffect(() => one.current?.focus(), []);
  return (
    <Dialog
      title={`${verb} a repeating event`}
      width={440}
      onClose={() => onResult(null)}
      footer={
        <>
          <Button onClick={() => onResult(null)}>Cancel</Button>
          <Button danger={verb === "Delete"} onClick={() => onResult("all")}>
            All of them
          </Button>
          <Button ref={one} primary={verb !== "Delete"} danger={verb === "Delete"} onClick={() => onResult("one")}>
            Just this one
          </Button>
        </>
      }
    >
      <p className="leading-relaxed text-muted">
        {verb === "Delete" ? "Delete only this day's event, or every time it repeats?" : `${verb} only this day's event, or every time it repeats?`}
      </p>
    </Dialog>
  );
}
