import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useRef, useState } from "react";
import { PlaceSearch } from "../../home/WeatherCard";
import NewsSourcesPopup from "../../home/NewsSourcesPopup";
import { shortPlace, temperatureUnit, weatherPlace, type Place } from "../../home/prefs";
import { fetchText, inTauri, system } from "../../lib/api";
import { accentChoices, isWindows11 } from "../../lib/appearance";
import { clockText, dateText } from "../../lib/format";
import { refreshAppFonts } from "../../lib/fonts";
import { textSizes, type Settings, type TextSize } from "../../lib/settings";
import { useSettings } from "../../lib/SettingsContext";
import { themeFor, themes } from "../../lib/themes";
import { ListGroup, ListRow, SectionLabel } from "../../ui/bits";
import { Action, Choice, Note, Seg, Swatches, Toggle } from "../controls";
import FontsPopup from "../FontsPopup";
import ThemeCard from "../ThemeCard";

// ----- Profile -----

export function Profile() {
  const { settings, update } = useSettings();
  const [name, setName] = useState(settings.DisplayName);
  const [picking, setPicking] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const place = weatherPlace(settings);

  const useMyLocation = async () => {
    setLocating("Finding you…");
    try {
      const { latitude, longitude } = await system.location();
      // A town name for the weather card and local news, from OpenStreetMap.
      let name = "My location";
      let region: string | undefined;
      try {
        const json = JSON.parse(await fetchText(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${latitude}&lon=${longitude}`)) as {
          address?: Record<string, string>;
        };
        const a = json.address ?? {};
        name = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? name;
        region = a.state ?? a.country;
      } catch {
        // No name; the weather works from the coordinates anyway.
      }
      update({ WeatherLocation: { name, region, latitude, longitude } satisfies Place });
      setLocating(null);
    } catch (e) {
      setLocating(e instanceof Error ? e.message : String(e));
    }
  };

  // A small square copy of the picture, kept in the settings.
  const pickPicture = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const s = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        update({ ProfilePicture: canvas.toDataURL("image/jpeg", 0.88) });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(f);
  };

  return (
    <>
      <ListGroup>
        <ListRow label="Display name" description="Used in greetings and on your avatar">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== settings.DisplayName && update({ DisplayName: name.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            aria-label="Display name"
            className="h-[38px] w-[220px] rounded-[11px] border border-line bg-panel2 px-3 text-13 text-text outline-none focus:border-faint"
          />
        </ListRow>
        <Seg
          label="Greeting"
          desc="The line at the top of Home"
          value={settings.Greeting ?? "evening"}
          onChange={(v) => update({ Greeting: v })}
          options={[
            { value: "evening", label: "Good evening" },
            { value: "hey", label: "Hey" },
            { value: "off", label: "Off" },
          ]}
        />
        <ListRow label="Home location" description={locating ?? "For weather and local news"}>
          <span className="flex shrink-0 items-center gap-2">
            {place && <span className="max-w-[200px] truncate text-13 text-muted">{shortPlace(place)}</span>}
            <button onClick={() => setPicking((p) => !p)} className="h-9 rounded-[10px] border border-line px-3 text-12 font-medium hover:bg-panel2">
              {place ? "Change" : "Choose"}
            </button>
            <button disabled={!inTauri} onClick={() => void useMyLocation()} className="h-9 rounded-[10px] border border-line px-3 text-12 font-medium hover:bg-panel2 disabled:opacity-50">
              Use my location
            </button>
          </span>
        </ListRow>
        {picking && (
          <div className="flex flex-col gap-2 px-[18px] py-3">
            <PlaceSearch
              onPick={(p) => {
                update({ WeatherLocation: p });
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          </div>
        )}
        <ListRow label="Profile picture" description="Shown in the sidebar">
          <span className="flex shrink-0 items-center gap-2">
            {settings.ProfilePicture && <img src={settings.ProfilePicture} alt="" className="h-9 w-9 rounded-full border border-line object-cover" />}
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pickPicture(e.target.files[0])} />
            <button onClick={() => file.current?.click()} className="h-9 rounded-[10px] border border-line px-3 text-12 font-semibold hover:bg-panel2">
              Change
            </button>
            {settings.ProfilePicture && (
              <button onClick={() => update({ ProfilePicture: null })} className="h-9 rounded-[10px] px-3 text-12 text-muted hover:bg-panel2 hover:text-text">
                Remove
              </button>
            )}
          </span>
        </ListRow>
      </ListGroup>
    </>
  );
}

// ----- General -----

export function General() {
  const { settings, update } = useSettings();
  const [startup, setStartup] = useState<boolean | null>(null);
  useEffect(() => {
    if (!inTauri) return;
    void isEnabled()
      .then(setStartup)
      .catch(() => setStartup(false));
  }, []);
  const today = new Date();
  const sample = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 30);
  const withFormat = (f: NonNullable<Settings["DateFormat"]>) => dateText(today, today, f);
  return (
    <>
      <ListGroup title="STARTUP">
        <Toggle
          label="Open when Windows starts"
          value={Boolean(startup)}
          disabled={!inTauri || startup === null}
          onChange={(v) => {
            setStartup(v);
            update({ StartWithWindows: v });
            void (v ? enable() : disable()).catch(() => setStartup(!v));
          }}
        />
        <Toggle label="Keep running in the tray" desc="Reminders still fire when the window is closed" value={settings.KeepInTray !== false} onChange={(v) => update({ KeepInTray: v })} />
        <Choice
          label="Open to"
          value={settings.OpenTo ?? "home"}
          onChange={(v) => update({ OpenTo: v })}
          options={[
            { value: "home", label: "Home" },
            { value: "notes", label: "Notes" },
            { value: "schedule", label: "Schedule" },
            { value: "tasks", label: "Tasks" },
            { value: "last", label: "Last screen" },
          ]}
        />
      </ListGroup>
      <ListGroup title="DATES AND TIME">
        <Seg
          label="Week starts on"
          value={settings.WeekStart ?? "monday"}
          onChange={(v) => update({ WeekStart: v })}
          options={[
            { value: "sunday", label: "Sunday" },
            { value: "monday", label: "Monday" },
          ]}
        />
        <Seg
          label="Time format"
          desc={clockText(sample)}
          value={settings.Clock ?? "12"}
          onChange={(v) => update({ Clock: v })}
          options={[
            { value: "12", label: "12-hour" },
            { value: "24", label: "24-hour" },
          ]}
        />
        <Choice
          label="Date format"
          value={settings.DateFormat ?? "short"}
          onChange={(v) => update({ DateFormat: v })}
          options={[
            { value: "short", label: withFormat("short") },
            { value: "dmy", label: withFormat("dmy") },
            { value: "iso", label: withFormat("iso") },
          ]}
        />
        <Choice
          label="Language"
          desc="More languages later"
          value={settings.Language ?? "en-US"}
          onChange={(v) => update({ Language: v })}
          options={[
            { value: "en-US", label: "English (US)" },
            { value: "en-GB", label: "English (UK)" },
          ]}
        />
      </ListGroup>
      <ListGroup title="UPDATES">
        <Toggle label="Check for updates automatically" desc="Checks start with the first release" value={settings.AutoUpdate !== false} onChange={(v) => update({ AutoUpdate: v })} />
        <Seg
          label="Update channel"
          desc="Beta gets new features first"
          value={settings.UpdateChannel ?? "stable"}
          onChange={(v) => update({ UpdateChannel: v })}
          options={[
            { value: "stable", label: "Stable" },
            { value: "beta", label: "Beta" },
          ]}
        />
      </ListGroup>
    </>
  );
}

// ----- Appearance -----

export function Appearance() {
  const { settings, update } = useSettings();
  const [fontsOpen, setFontsOpen] = useState(false);
  const [added, setAdded] = useState<string[]>([]);
  useEffect(() => {
    void refreshAppFonts().then((fonts) => setAdded([...new Set(fonts.map((f) => f.family))]));
  }, [fontsOpen]);
  const selected = themeFor(settings.Theme).id;
  const current = themeFor(settings.Theme);
  const win11 = isWindows11();
  const headOptions = [
    { value: "atkinson", label: "Atkinson Hyperlegible" },
    { value: "geist", label: "Geist" },
    { value: "system", label: "System" },
    ...[...new Set([...added, ...(settings.HeadlineFont && !["atkinson", "geist", "system"].includes(settings.HeadlineFont) ? [settings.HeadlineFont] : [])])].map((f) => ({ value: f, label: f })),
  ];
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel>Theme</SectionLabel>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-4 gap-3">
          {themes.map((t) => (
            <ThemeCard key={t.id} theme={t} selected={t.id === selected} onPick={() => update({ Theme: t.id })} />
          ))}
        </div>
      </div>
      <ListGroup title="COLOR">
        <Toggle label="Match Windows light and dark" desc="Switches to Daylight when Windows is in light mode" value={Boolean(settings.MatchWindows)} onChange={(v) => update({ MatchWindows: v })} />
        <Swatches
          label="Accent color"
          desc="Leave on Theme to use each theme's own accent"
          value={settings.Accent ?? "theme"}
          onChange={(v) => update({ Accent: v })}
          options={[
            { value: "theme", label: "Theme", color: current.preview.accent },
            ...accentChoices.map((a) => ({ value: a.id, label: a.name, color: current.scheme === "light" ? a.light : a.dark })),
          ]}
        />
        <Seg
          label="Window background"
          desc={win11 ? "Windows 11 only" : "Mica and Acrylic need Windows 11"}
          value={win11 ? (settings.Material ?? "solid") : "solid"}
          onChange={(v) => win11 && update({ Material: v })}
          options={
            win11
              ? [
                  { value: "solid", label: "Solid" },
                  { value: "mica", label: "Mica" },
                  { value: "acrylic", label: "Acrylic" },
                ]
              : [{ value: "solid", label: "Solid" }]
          }
        />
      </ListGroup>
      <ListGroup title="TEXT">
        {headOptions.length > 3 ? (
          <Choice label="Headline font" value={settings.HeadlineFont ?? "atkinson"} onChange={(v) => update({ HeadlineFont: v })} options={headOptions} />
        ) : (
          <Seg label="Headline font" value={settings.HeadlineFont ?? "atkinson"} onChange={(v) => update({ HeadlineFont: v })} options={headOptions} />
        )}
        <Seg<TextSize> label="Text size" desc="Changes the size of all text. Layouts keep their spacing." value={settings.TextSize} onChange={(v) => update({ TextSize: v })} options={textSizes.map((s) => ({ value: s, label: s }))} />
        <Action label="Add a font" desc="Any installed font, or one from Google Fonts" action="Browse fonts" onClick={() => setFontsOpen(true)} />
      </ListGroup>
      <ListGroup title="LAYOUT">
        <Seg
          label="Density"
          value={settings.Density ?? "comfortable"}
          onChange={(v) => update({ Density: v })}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
        />
        <Seg
          label="Sidebar"
          desc="Full shows Home's sidebar with names; Icons only uses the slim rail everywhere"
          value={settings.SidebarStyle ?? "full"}
          onChange={(v) => update({ SidebarStyle: v })}
          options={[
            { value: "full", label: "Full" },
            { value: "icons", label: "Icons only" },
          ]}
        />
      </ListGroup>
      {fontsOpen && (
        <FontsPopup
          current={settings.HeadlineFont}
          onPick={(family) => {
            update({ HeadlineFont: family });
            setFontsOpen(false);
          }}
          onClose={() => setFontsOpen(false)}
        />
      )}
    </>
  );
}

// ----- Home screen -----

export const homeCards: { id: string; label: string }[] = [
  { id: "up", label: "Up next" },
  { id: "today", label: "Today's progress" },
  { id: "schedule", label: "Schedule" },
  { id: "tasks", label: "Tasks" },
  { id: "goals", label: "Goals" },
  { id: "habits", label: "Habits" },
  { id: "notes", label: "Recent notes" },
  { id: "news", label: "News" },
  { id: "weather", label: "Weather" },
];

export function HomeScreenSettings() {
  const { settings, update } = useSettings();
  const [newsOpen, setNewsOpen] = useState(false);
  const hidden = new Set(settings.HiddenCards ?? []);
  const set = (id: string, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(id);
    else next.add(id);
    update({ HiddenCards: [...next] });
  };
  const sources = Array.isArray(settings.NewsSources) ? settings.NewsSources.length : null;
  return (
    <>
      <ListGroup title="CARDS">
        {homeCards.map((c) => (
          <Toggle key={c.id} label={c.label} value={!hidden.has(c.id)} onChange={(v) => set(c.id, v)} />
        ))}
      </ListGroup>
      <ListGroup title="NEWS AND WEATHER">
        <Action label="News sources" desc={sources !== null ? `${sources} ${sources === 1 ? "source" : "sources"}` : "Gaming, tech and local"} action="Manage" onClick={() => setNewsOpen(true)} />
        <Seg
          label="Temperature"
          value={temperatureUnit(settings)}
          onChange={(v) => update({ TemperatureUnit: v })}
          options={[
            { value: "F", label: "°F" },
            { value: "C", label: "°C" },
          ]}
        />
      </ListGroup>
      {newsOpen && <NewsSourcesPopup onClose={() => setNewsOpen(false)} />}
    </>
  );
}

// ----- Accessibility -----

export function Accessibility() {
  const { settings, update } = useSettings();
  return (
    <ListGroup>
      <Toggle label="Reduce motion" desc="Turns off animations and the live pulse" value={settings.ReduceMotion} onChange={(v) => update({ ReduceMotion: v })} />
      <Toggle label="Higher contrast" desc="Stronger borders and text" value={Boolean(settings.HigherContrast)} onChange={(v) => update({ HigherContrast: v })} />
      <Toggle label="Bigger click targets" value={Boolean(settings.BigTargets)} onChange={(v) => update({ BigTargets: v })} />
      <Toggle label="Underline links" value={Boolean(settings.UnderlineLinks)} onChange={(v) => update({ UnderlineLinks: v })} />
      <Toggle label="Always show the focus ring" desc="Not just when using the keyboard" value={settings.AlwaysShowFocus} onChange={(v) => update({ AlwaysShowFocus: v })} />
      <Toggle label="Announce changes to screen readers" desc="Like a task moving or a streak going up" value={settings.Announce !== false} onChange={(v) => update({ Announce: v })} />
    </ListGroup>
  );
}

export { Note };
