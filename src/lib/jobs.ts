// Work that runs in the background while Project Life is open: the daily
// backup (Settings → Storage and backup) and saving crash reports (Settings →
// Privacy).
import { enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect } from "react";
import { goalStore } from "../goals/useGoals";
import { habitStore } from "../habits/useHabits";
import { eventStore } from "../schedule/useEvents";
import { ymd } from "../tasks/dates";
import { taskStore } from "../tasks/useTasks";
import { inTauri, system } from "./api";
import { runBeforeClose } from "./closing";
import { currentSettings, type Settings } from "./settings";
import { useSettings } from "./SettingsContext";

// Everything waiting to be written goes to disk first, so a backup or an
// export has the latest.
export async function flushAll() {
  await Promise.all([taskStore().flush(), eventStore().flush(), habitStore().flush(), goalStore().flush(), runBeforeClose()]);
}

export async function backupNow(update: (patch: Partial<Settings>) => void): Promise<string> {
  await flushAll();
  const where = await system.backupNow(currentSettings().BackupFolder ?? null, 14);
  update({ LastBackup: ymd(new Date()) });
  return where;
}

export function useBackgroundJobs() {
  const { update } = useSettings();

  // Crashes in the page, written to Data\Logs when that's on.
  useEffect(() => {
    const save = (text: string) => {
      if (currentSettings().SaveCrashReports) void system.saveCrash(`${text}\nat ${location.hash || "/"} · ${navigator.userAgent}`);
    };
    const onError = (e: ErrorEvent) => save(`${e.message}\n${e.error instanceof Error ? (e.error.stack ?? "") : ""}`);
    const onRejection = (e: PromiseRejectionEvent) => save(`Unhandled: ${e.reason instanceof Error ? (e.reason.stack ?? e.reason.message) : String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  // Open when Windows starts: the portable folder may have moved since it was
  // turned on, so point Windows at this copy again.
  useEffect(() => {
    if (!inTauri || !currentSettings().StartWithWindows) return;
    void isEnabled()
      .then((on) => (on ? enable() : undefined))
      .catch(() => {});
  }, []);

  // One backup a day: a minute after starting, then checked every hour.
  useEffect(() => {
    if (!inTauri) return;
    let running = false;
    const check = async () => {
      const s = currentSettings();
      if (running || s.Backup === false || s.LastBackup === ymd(new Date())) return;
      running = true;
      try {
        await backupNow(update);
      } catch (e) {
        console.error("The daily backup didn't finish", e);
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => void check(), 60_000);
    const hourly = window.setInterval(() => void check(), 3_600_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(hourly);
    };
  }, [update]);
}
