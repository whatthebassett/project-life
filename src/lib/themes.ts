// The eight themes (DESIGN.md §2). The colors themselves live in
// styles/tokens.css; this list carries what the pickers show: the name, the
// mood line, and the colors a swatch or preview card paints no matter which
// theme is on.
export type ThemeId = "midnight" | "dark" | "aurora" | "ember" | "lifestream" | "light" | "daylight" | "peach";

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
    // Plain dark: neutral grays and an ordinary blue.
    id: "dark",
    name: "Dark",
    mood: "Plain, neutral",
    scheme: "dark",
    preview: { bg: "#101011", side: "#151517", panel: "#1C1C1F", line: "rgba(255,255,255,0.08)", text: "#F2F2F4", muted: "#A3A3AB", accent: "#5AA2FF", accent2: "#4CCF96" },
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
    // Deep sea blue-green with a mako glow.
    id: "lifestream",
    name: "Lifestream",
    mood: "Deep, luminous",
    scheme: "dark",
    preview: { bg: "#04121A", side: "#061822", panel: "#0A202C", line: "rgba(150,240,255,0.09)", text: "#E6F8F6", muted: "#8FB3B8", accent: "#3DF2C6", accent2: "#5AC8FF" },
  },
  {
    // Plain light: neutral grays and an ordinary blue.
    id: "light",
    name: "Light",
    mood: "Plain, neutral",
    scheme: "light",
    preview: { bg: "#F4F4F5", side: "#EBEBED", panel: "#FFFFFF", line: "rgba(0,0,0,0.1)", text: "#18181B", muted: "#5B5B64", accent: "#0F62D6", accent2: "#0A7F58" },
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
