// A web page's title, description and picture, from fetch_link_preview
// (src-tauri/src/notes.rs). Used by a link's hover card and by LinkTitles.
export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  site: string;
  image: string;
}

const cache = new Map<string, Promise<LinkPreview | null>>();

// One fetch per link for as long as the app is open.
export function previewFor(url: string, fetch: (url: string) => Promise<LinkPreview | null>) {
  let pending = cache.get(url);
  if (!pending) {
    pending = fetch(url).catch(() => null);
    cache.set(url, pending);
  }
  return pending;
}
