import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { applyAppearance } from "./appearance";
import { saveSettings, type Settings } from "./settings";

interface Value {
  settings: Settings;
  // Changes apply at once and save in the background (no Save button).
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Value | null>(null);

export function SettingsProvider({ initial, children }: { initial: Settings; children: ReactNode }) {
  const [settings, setSettings] = useState(initial);
  const current = useRef(initial);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...current.current, ...patch } as Settings;
    current.current = next;
    applyAppearance(next);
    setSettings(next);
    void saveSettings(next);
  }, []);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Value {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettings needs a SettingsProvider");
  return value;
}
