import Image from "@tiptap/extension-image";
import { mergeAttributes, type Editor } from "@tiptap/core";
import { api } from "../lib/api";

// Files live in Notes\assets and notes reference them as "assets/name.png".
// The webview can't read the disk, so the Rust side serves the notes folder
// on its own scheme; the document keeps the relative path.
export const ASSET_ORIGIN = "http://pl.localhost/";

export function resolveAsset(src: string): string {
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return ASSET_ORIGIN + src.split("/").map(encodeURIComponent).join("/");
}

function unresolveAsset(src: string): string {
  return src.startsWith(ASSET_ORIGIN) ? decodeURIComponent(src.slice(ASSET_ORIGIN.length)) : src;
}

export const NotedImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: "img[src]",
        getAttrs: (el) => ({
          src: unresolveAsset(el.getAttribute("src") ?? ""),
          alt: el.getAttribute("alt"),
          title: el.getAttribute("title"),
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { src: resolveAsset(HTMLAttributes.src ?? "") })];
  },
});

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Save an image file into assets; returns its path, like "assets/photo.png".
export async function saveImageFile(file: File): Promise<string> {
  const name = file.name && file.name !== "image.png" ? file.name : `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`;
  return api.saveAsset(name, await toBase64(file));
}

// Pasted HTML with data: images: save each one to assets, then insert the
// HTML with the saved paths in place of the blobs.
export async function insertDataImages(editor: Editor, html: string) {
  const pattern = /(<img\b[^>]*\bsrc=["'])data:(image\/([a-z0-9.+-]+));base64,([^"']+)(["'])/gi;
  let out = html;
  for (const match of html.matchAll(pattern)) {
    const [whole, before, , ext, base64, after] = match;
    const src = await api.saveAsset(`pasted-${Date.now()}.${ext === "svg+xml" ? "svg" : ext}`, base64);
    out = out.replace(whole, `${before}${src}${after}`);
  }
  editor.chain().focus().insertContent(out).run();
}

// Copy a pasted or dropped image into assets and insert it.
export async function insertImageFiles(editor: Editor, files: File[], at?: number) {
  const images = files.filter((f) => f.type.startsWith("image/"));
  for (const file of images) {
    const name = file.name && file.name !== "image.png" ? file.name : `pasted-${Date.now()}.${file.type.split("/")[1] || "png"}`;
    const src = await api.saveAsset(name, await toBase64(file));
    const chain = editor.chain().focus();
    if (at !== undefined) chain.insertContentAt(at, { type: "image", attrs: { src, alt: "" } });
    else chain.setImage({ src, alt: "" });
    chain.run();
  }
  return images.length > 0;
}
