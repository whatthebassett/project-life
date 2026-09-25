import { inTauri, system, type AppFont } from "./api";

// Fonts downloaded into Data\Fonts (Settings → Appearance → Add a font) load
// into the page directly from http://pl.localhost/__fonts/…; they're never
// installed into Windows, so they travel with the portable app. From
// Checkpoint's lib/fonts.ts.
const loaded = new Map<string, FontFace>();

export async function refreshAppFonts(): Promise<AppFont[]> {
  if (!inTauri) return [];
  const fonts = await system.appFonts().catch(() => [] as AppFont[]);
  const keep = new Set(fonts.map((f) => f.path));
  for (const [path, face] of loaded) {
    if (keep.has(path)) continue;
    document.fonts.delete(face);
    loaded.delete(path);
  }
  for (const f of fonts) {
    if (loaded.has(f.path)) continue;
    const url = `http://pl.localhost/__fonts/${f.path.split("/").map(encodeURIComponent).join("/")}`;
    const face = new FontFace(f.family, `url("${url}")`, { weight: String(f.weight), style: f.italic ? "italic" : "normal" });
    document.fonts.add(face);
    loaded.set(f.path, face);
  }
  return fonts;
}

let installed: Promise<string[]> | null = null;
export const systemFonts = () => (installed ??= system.systemFonts().catch(() => []));

export const googleSuggestions = ["Inter", "Lexend", "Nunito", "Work Sans", "Space Grotesk", "DM Sans", "Outfit", "Manrope", "IBM Plex Sans", "Fraunces", "Lora", "Merriweather", "Playfair Display", "Atkinson Hyperlegible Next"];
