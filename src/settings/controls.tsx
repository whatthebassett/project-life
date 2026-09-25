import clsx from "clsx";
import { Check, ChevronDown } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";
import type { MenuItem } from "../components/ContextMenu";
import { ListRow } from "../ui/bits";
import { SegmentedControl, type SegmentOption } from "../ui/SegmentedControl";
import { Switch } from "../ui/Switch";

// The row types in Settings.dc.html: switch, segmented, dropdown, button,
// info, path with Change, key caps, color swatches, and account.

// Dropdowns open the app's menu; Settings provides where it opens.
export const SettingsMenu = createContext<(x: number, y: number, items: MenuItem[]) => void>(() => {});

export function Toggle({ label, desc, value, onChange, disabled }: { label: string; desc?: ReactNode; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <ListRow label={label} description={desc}>
      <Switch label={label} checked={value} onChange={onChange} disabled={disabled} />
    </ListRow>
  );
}

export function Seg<T extends string>({ label, desc, value, options, onChange }: { label: string; desc?: ReactNode; value: T; options: SegmentOption<T>[]; onChange: (v: T) => void }) {
  return (
    <ListRow label={label} description={desc}>
      <SegmentedControl<T> label={label} surface="panel" size="sm" value={value} onChange={onChange} options={options} />
    </ListRow>
  );
}

export function Choice<T extends string | number>({
  label,
  desc,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  desc?: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const openMenu = useContext(SettingsMenu);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <ListRow label={label} description={desc}>
      <button
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${current?.label}`}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          openMenu(
            r.left,
            r.bottom + 4,
            options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) })),
          );
        }}
        className="flex h-[38px] shrink-0 items-center gap-2.5 rounded-[11px] bg-panel2 pr-3 pl-3.5 text-13 font-medium whitespace-nowrap disabled:opacity-50"
      >
        {current?.label}
        <ChevronDown size={14} className="text-muted" />
      </button>
    </ListRow>
  );
}

export function Action({
  label,
  desc,
  action,
  tone,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  desc?: ReactNode;
  action: string;
  tone?: "primary" | "danger";
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <ListRow label={label} description={desc} danger={danger}>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={clsx(
          "h-[38px] shrink-0 rounded-[11px] border px-3.5 text-13 font-semibold whitespace-nowrap disabled:opacity-50",
          tone === "primary" ? "border-accent bg-accent text-accent-ink" : tone === "danger" ? "border-danger text-danger hover:bg-panel2" : "border-line text-text hover:bg-panel2",
        )}
      >
        {action}
      </button>
    </ListRow>
  );
}

export function Info({ label, desc, value }: { label: string; desc?: ReactNode; value?: ReactNode }) {
  return (
    <ListRow label={label} description={desc}>
      {value !== undefined && <span className="shrink-0 text-13 whitespace-nowrap text-muted">{value}</span>}
    </ListRow>
  );
}

export function Path({ label, desc, value, actions }: { label: string; desc?: ReactNode; value: string; actions: { label: string; onClick: () => void; disabled?: boolean }[] }) {
  return (
    <ListRow label={label} description={desc}>
      <span className="flex shrink-0 items-center gap-2">
        <span title={value} className="max-w-[260px] truncate rounded-[9px] border border-dashed border-line px-2.5 py-2 font-mono text-11 whitespace-nowrap text-muted">
          {value}
        </span>
        {actions.map((a) => (
          <button key={a.label} type="button" disabled={a.disabled} onClick={a.onClick} className="h-9 rounded-[10px] border border-line px-3 text-12 font-medium hover:bg-panel2 disabled:opacity-50">
            {a.label}
          </button>
        ))}
      </span>
    </ListRow>
  );
}

export function Swatches<T extends string>({ label, desc, value, options, onChange }: { label: string; desc?: ReactNode; value: T; options: { value: T; label: string; color: string }[]; onChange: (v: T) => void }) {
  return (
    <ListRow label={label} description={desc}>
      <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-accent-ink"
            style={{ background: o.color, boxShadow: `0 0 0 2px var(--panel), 0 0 0 4px ${o.value === value ? "var(--text)" : "transparent"}` }}
          >
            {o.value === value && <Check size={13} strokeWidth={3} />}
          </button>
        ))}
      </div>
    </ListRow>
  );
}

export function Account({ label, desc, connected, onToggle, disabled }: { label: string; desc: string; connected: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <ListRow label={label} description={desc}>
      <span className="flex shrink-0 items-center gap-2.5">
        <span className={clsx("flex h-[26px] items-center gap-1.5 rounded-[8px] px-2.5 text-12 font-medium", connected ? "text-accent2" : "text-muted")}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {connected ? "Connected" : "Not connected"}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={onToggle}
          className={clsx("h-9 rounded-[10px] border px-3.5 text-12 font-semibold disabled:opacity-50", connected ? "border-line text-text" : "border-accent bg-accent text-accent-ink")}
        >
          {connected ? "Disconnect" : "Connect"}
        </button>
      </span>
    </ListRow>
  );
}

// "This part arrives in Phase 8" and similar notes under a group.
export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-[16px] border border-dashed border-line px-[18px] py-4 text-13 leading-[1.5] text-muted">{children}</div>;
}
