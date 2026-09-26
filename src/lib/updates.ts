// Updates from GitHub Releases (update.rs). With "Check for updates
// automatically" on, Project Life looks once a day, downloads a newer release
// in the background, and offers to restart into it. About → Check now does
// the same on demand.
import { useEffect, useSyncExternalStore } from "react";
import { inTauri, updatesApi, type Release } from "./api";
import { currentSettings, type Settings } from "./settings";
import { useSettings } from "./SettingsContext";
import { toast } from "../ui/Toast";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | { kind: "downloading"; release: Release }
  | { kind: "ready"; release: Release }
  | { kind: "error"; message: string };

let state: UpdateState = { kind: "idle" };
const listeners = new Set<() => void>();

function setState(next: UpdateState) {
  state = next;
  for (const l of listeners) l();
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
}

// Looks for a newer release and, if there is one, downloads it.
export async function checkForUpdate(update: (patch: Partial<Settings>) => void, quiet = false): Promise<void> {
  if (!inTauri || state.kind === "checking" || state.kind === "downloading") return;
  if (state.kind === "ready") return;
  setState({ kind: "checking" });
  try {
    const release = await updatesApi.check(currentSettings().UpdateChannel === "beta");
    update({ LastUpdateCheck: new Date().toISOString() });
    if (!release) {
      setState({ kind: "current" });
      return;
    }
    setState({ kind: "downloading", release });
    await updatesApi.download(release.download);
    setState({ kind: "ready", release });
    toast(`Project Life ${release.version} is ready`, () => void installUpdate(), "Restart");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setState({ kind: "error", message });
    if (!quiet) toast(message);
  }
}

export async function installUpdate() {
  try {
    await updatesApi.install();
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e));
  }
}

// Once a day, two minutes after starting (and hourly after that, in case
// Project Life stays open for days).
export function useAutoUpdate() {
  const { update } = useSettings();
  useEffect(() => {
    if (!inTauri) return;
    const due = () => {
      const s = currentSettings();
      if (s.AutoUpdate === false) return;
      const last = s.LastUpdateCheck ? Date.parse(s.LastUpdateCheck) : 0;
      if (Date.now() - last > 20 * 60 * 60_000) void checkForUpdate(update, true);
    };
    const first = window.setTimeout(due, 120_000);
    const hourly = window.setInterval(due, 3_600_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(hourly);
    };
  }, [update]);
}
