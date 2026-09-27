// The five themes (DESIGN.md §2). The colors themselves live in
// styles/tokens.css; this list carries what the pickers show: the name, the
// mood line, and the colors a swatch or preview card paints no matter which
// theme is on.
export type ThemeId = "midnight" | "aurora" | "ember" | "daylight" | "peach";

export interface Theme {
  id: ThemeId;
  name: string;
  mood: string;
  scheme: "dark" | "light";
  preview: {
    bg: string;
    side: string;
    panel: string;
    line: string;
    text: string;
    muted: string;
    accent: string;
    accent2: string;
  };
}

export const themes: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    mood: "Calm, focused",
    scheme: "dark",
    preview: { bg: "#0A0C11", side: "#0D1017", panel: "#12161F", line: "rgba(255,255,255,0.07)", text: "#ECEEF5", muted: "#969DAF", accent: "#A092FF", accent2: "#5CE1C6" },
  },
  {
    id: "aurora",
    name: "Aurora",
    mood: "Fresh, airy",
    scheme: "dark",
    preview: { bg: "#07110F", side: "#0A1614", panel: "#0F1D1A", line: "rgba(220,255,245,0.08)", text: "#E8F4F0", muted: "#93ABA4", accent: "#4FE0B0", accent2: "#7CB8FF" },
  },
  {
    id: "ember",
    name: "Ember",
    mood: "Warm, cozy",
    scheme: "dark",
    preview: { bg: "#110C0A", side: "#16100D", panel: "#1D1512", line: "rgba(255,235,220,0.08)", text: "#F6ECE6", muted: "#B5A197", accent: "#FF9A5C", accent2: "#F2CF6A" },
  },
  {
    id: "daylight",
    name: "Daylight",
    mood: "Bright, clean",
    scheme: "light",
    preview: { bg: "#F3F2EE", side: "#ECEAE4", panel: "#FFFFFF", line: "rgba(20,22,30,0.09)", text: "#15171D", muted: "#5A5F6B", accent: "#5A48E0", accent2: "#0B8A6D" },
  },
  {
    // Checkpoint's Peach.
    id: "peach",
    name: "Peach",
    mood: "Soft, warm",
    scheme: "light",
    preview: { bg: "#FFF7F5", side: "#F5D7D0", panel: "#FFFCFB", line: "rgba(175,95,100,0.17)", text: "#40292B", muted: "#765657", accent: "#A84A73", accent2: "#2F7D6D" },
  },
];

export function themeFor(id: unknown): Theme {
  return themes.find((t) => t.id === id) ?? themes[0];
}
