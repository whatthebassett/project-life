import { thisComputer } from "../lib/platform";
import clsx from "clsx";
import { Download, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { inTauri, system, type AppFont } from "../lib/api";
import { googleSuggestions, refreshAppFonts, systemFonts } from "../lib/fonts";
import { Popup, PopupHeader } from "../ui/Popup";
import { SectionLabel } from "../ui/bits";

// Settings → Appearance → Add a font: pick any font installed in Windows, or
// download one from Google Fonts into Data\Fonts (it travels with the app).
// Picking one makes it the headline font.
export default function FontsPopup({ current, onPick, onClose }: { current?: string; onPick: (family: string) => void; onClose: () => void }) {
  const [installed, setInstalled] = useState<string[]>([]);
  const [added, setAdded] = useState<AppFont[]>([]);
  const [q, setQ] = useState("");
  const [google, setGoogle] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void systemFonts().then(setInstalled);
    void refreshAppFonts().then(setAdded);
  }, []);

  const families = [...new Set(added.map((f) => f.family))];
  const shown = useMemo(() => installed.filter((f) => f.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200), [installed, q]);

  const download = async (family: string) => {
    const name = family.trim();
    if (!name) return;
    setBusy(true);
    setStatus(`Downloading ${name}…`);
    try {
      const got = await system.googleFont(name);
      setAdded(await refreshAppFonts());
      setStatus(`Added ${got}.`);
      setGoogle("");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (family: string) => {
    for (const folder of new Set(added.filter((f) => f.family === family).map((f) => f.folder))) await system.removeFont(folder).catch(() => {});
    setAdded(await refreshAppFonts());
  };

  const row = (family: string, extra?: React.ReactNode) => (
    <div key={family} className={clsx("flex min-h-12 items-center gap-3 rounded-[12px] px-3", current === family && "bg-panel")}>
      <button onClick={() => onPick(family)} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-18" style={{ fontFamily: `"${family}", sans-serif` }}>
          {family}
        </span>
      </button>
      {extra}
      <button onClick={() => onPick(family)} className="h-8 rounded-[9px] border border-line px-3 text-12 font-medium hover:bg-panel2">
        {current === family ? "In use" : "Use"}
      </button>
    </div>
  );

  return (
    <Popup onClose={onClose} width={720} height={760} label="Fonts">
      <PopupHeader tag="FONTS" onClose={onClose}>
        For headlines across the app
      </PopupHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="flex flex-col gap-2">
          <SectionLabel>FROM GOOGLE FONTS</SectionLabel>
          <div className="flex gap-2">
            <input
              value={google}
              onChange={(e) => setGoogle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void download(google)}
              placeholder="A family name, like Lexend"
              aria-label="Google Fonts family"
              disabled={!inTauri}
              className="h-10 min-w-0 flex-1 rounded-[11px] border border-line bg-panel px-3 text-14 text-text outline-none focus:border-faint"
            />
            <button disabled={busy || !google.trim() || !inTauri} onClick={() => void download(google)} className="flex h-10 items-center gap-2 rounded-[11px] bg-accent px-4 text-13 font-semibold text-accent-ink disabled:opacity-50">
              <Download size={15} />
              Download
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {googleSuggestions.map((f) => (
              <button key={f} disabled={busy || !inTauri} onClick={() => void download(f)} className="h-7 rounded-[8px] border border-dashed border-line px-2.5 text-12 text-muted hover:border-faint hover:text-text disabled:opacity-50">
                {f}
              </button>
            ))}
          </div>
          {status && <span className="text-12 text-muted">{status}</span>}
        </div>

        {families.length > 0 && (
          <div className="flex flex-col gap-1">
            <SectionLabel>ADDED</SectionLabel>
            {families.map((f) =>
              row(
                f,
                <button aria-label={`Remove ${f}`} title="Remove" onClick={() => void remove(f)} className="flex h-8 w-8 items-center justify-center rounded-[9px] text-muted hover:bg-panel2 hover:text-danger">
                  <Trash2 size={14} />
                </button>,
              ),
            )}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <SectionLabel>{`INSTALLED ON ${thisComputer.toUpperCase()}`}</SectionLabel>
            <label className="flex h-8 w-56 items-center gap-2 rounded-[9px] border border-line bg-panel px-2.5 text-muted">
              <Search size={13} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a font" aria-label="Find a font" className="min-w-0 flex-1 bg-transparent text-12 text-text outline-none" />
            </label>
          </div>
          {shown.map((f) => row(f))}
          {!inTauri && <span className="px-3 py-4 text-13 text-muted">Installed fonts are listed in the Project Life app.</span>}
        </div>
      </div>
    </Popup>
  );
}
