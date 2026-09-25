import clsx from "clsx";
import { useState } from "react";
import { useSettings } from "../lib/SettingsContext";
import { Button, IconButton } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
import { Icon } from "../ui/icons";
import { SectionLabel } from "../ui/bits";
import { Popup, PopupBody, PopupFooter, PopupHeader } from "../ui/Popup";
import { catalog, LOCAL, topics } from "./feeds";
import { probeFeed } from "./news";
import { hostOf, newsSources, weatherPlace, type NewsSource } from "./prefs";
import { placeLabel } from "./weather";

const errorText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong.");

// Home → News → Manage sources: pick feeds from the checked catalog by topic,
// or add any RSS or Atom feed by its address. Changes apply on Save.
export default function NewsSourcesPopup({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const [chosen, setChosen] = useState<NewsSource[]>(() => newsSources(settings));
  const [address, setAddress] = useState("");
  const [topic, setTopic] = useState("Top stories");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const place = weatherPlace(settings);

  const has = (url: string) => chosen.some((s) => s.Url === url);
  const toggle = (source: NewsSource, on: boolean) => setChosen((c) => (on ? [...c.filter((s) => s.Url !== source.Url), source] : c.filter((s) => s.Url !== source.Url)));

  const add = async () => {
    if (!address.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const found = await probeFeed(address);
      if (has(found.url)) setAddError("That feed is already on your list.");
      else {
        setChosen((c) => [...c, { Url: found.url, Name: found.title || hostOf(found.url), Topic: topic }]);
        setAddress("");
      }
    } catch (e) {
      setAddError(errorText(e));
    } finally {
      setAdding(false);
    }
  };

  const save = () => {
    update({ NewsSources: chosen });
    onClose();
  };

  const topicsChosen = topics.filter((t) => chosen.some((s) => s.Topic === t));
  const summary = chosen.length ? `${chosen.length} ${chosen.length === 1 ? "source" : "sources"} · ${topicsChosen.join(", ")}` : "No sources: the News card will be empty";

  return (
    <Popup onClose={onClose} onSubmit={save} width={1060} height={880} label="News sources">
      <PopupHeader tag="NEWS SOURCES" onClose={onClose}>
        <span className="truncate text-13 text-muted">
          Pick what the News card follows. Headlines are fetched straight from each site.
        </span>
      </PopupHeader>
      <PopupBody>
        <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-7 py-[22px]">
          <Group title="Local">
            <SourceRow
              name="Local news"
              detail={place ? `Google News for ${placeLabel(place)}` : "Choose a place in the Weather card first"}
              checked={has(LOCAL)}
              onChange={(on) => toggle({ Url: LOCAL, Name: "Local news", Topic: "Local" }, on)}
            />
          </Group>
          {catalog.map((c) => (
            <Group key={c.name} title={c.name}>
              {c.sources.map((s) => (
                <SourceRow key={s.url} name={s.name} detail={hostOf(s.url)} checked={has(s.url)} onChange={(on) => toggle({ Url: s.url, Name: s.name, Topic: c.name }, on)} />
              ))}
            </Group>
          ))}
        </div>
        <aside className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-line bg-side px-[22px] py-6">
          <SectionLabel>Your sources</SectionLabel>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            {chosen.map((s) => (
              <div key={s.Url} className="flex min-h-11 items-center gap-3 rounded-[12px] border border-line bg-panel py-1 pr-1 pl-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-13 font-medium">{s.Name}</span>
                  <span className="truncate text-11 text-muted">{s.Topic}</span>
                </span>
                <IconButton icon="close" label={`Remove ${s.Name}`} size={36} iconSize={12} iconStroke={2.4} bordered={false} onClick={() => toggle(s, false)} />
              </div>
            ))}
            {!chosen.length && <p className="m-0 text-13 text-muted">None yet. Pick a few on the left.</p>}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <SectionLabel>Add a feed by address</SectionLabel>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
              placeholder="capecodtimes.com or a feed URL"
              aria-label="Feed or website address"
              className="h-10 rounded-[12px] border border-line bg-panel px-3 text-13 text-text focus:border-accent"
            />
            <div className="flex gap-2">
              <span className="relative flex flex-1">
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  aria-label="Topic"
                  className="h-10 w-full appearance-none rounded-[12px] border border-line bg-panel pr-8 pl-3 text-13 text-text"
                >
                  {topics.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <Icon name="chevronDown" size={14} stroke={2} className="pointer-events-none absolute top-[13px] right-3 text-muted" />
              </span>
              <Button size="md" variant="primary" icon="plus" disabled={adding || !address.trim()} onClick={() => void add()}>
                {adding ? "Checking…" : "Add"}
              </Button>
            </div>
            {addError && <p className={clsx("m-0 text-12 leading-[1.45] text-danger")}>{addError}</p>}
          </div>
        </aside>
      </PopupBody>
      <PopupFooter summary={summary} onCancel={onClose} primaryLabel="Save sources" onPrimary={save} />
    </Popup>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <SectionLabel className="pb-1">{title}</SectionLabel>
      <div className="grid grid-cols-2 gap-x-3">{children}</div>
    </div>
  );
}

function SourceRow({ name, detail, checked, onChange }: { name: string; detail: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <Checkbox shape="square" size={20} checked={checked} onChange={onChange} label={name} className="-ml-3" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-14 font-medium">{name}</span>
        <span className="truncate text-12 text-muted">{detail}</span>
      </span>
    </div>
  );
}
