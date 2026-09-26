// Notes, ported from Checkpoint. Every note is an ordinary .md file in the notes
// folder (Data\Notes beside the app, or one chosen in Settings → Notes); the
// notebook's organization lives in .noted-*.json files next to them, named and
// shaped exactly like Checkpoint's, so a notes folder works in both apps.
use chrono::Local;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{data_dir, ensure, err, merge, web, write_atomic};

// The notebook files the frontend may read and write, by name.
const META_FILES: [&str; 6] = [
    ".noted-order.json",
    ".noted-tags.json",
    ".noted-folders.json",
    ".noted-pages.json",
    // Notes pinned to the top of the notebook.
    ".noted-pins.json",
    // Opens and edits per note (Home's recent notes).
    ".noted-stats.json",
];

const TRASH: &str = ".noted-trash";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInfo {
    name: String,
    modified: u64,
    // When the file was made (the Details panel); 0 when Windows doesn't say.
    created: u64,
    size: u64,
}

// Where the notes live: Data\Notes beside the app, unless another folder was
// chosen (Settings → Notes → Notes folder, saved as NotesFolder in
// settings.json). If that folder can't be reached, say an unplugged drive,
// the default is used and notes_folder_info reports it.
static NOTES_FOLDER: std::sync::RwLock<Option<PathBuf>> = std::sync::RwLock::new(None);

fn default_notes_dir() -> PathBuf {
    data_dir().join("Notes")
}

fn chosen_notes_dir() -> Option<PathBuf> {
    NOTES_FOLDER.read().ok().and_then(|folder| folder.clone())
}

pub fn notes_dir() -> Result<PathBuf, String> {
    if let Some(dir) = chosen_notes_dir() {
        if let Ok(dir) = ensure(dir) {
            return Ok(dir);
        }
    }
    ensure(default_notes_dir())
}

fn trash_dir() -> Result<PathBuf, String> {
    ensure(notes_dir()?.join(TRASH))
}

// Read the chosen folder from settings.json once, at startup.
pub fn load_notes_folder() {
    let chosen = fs::read_to_string(data_dir().join("settings.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|settings| settings.get("NotesFolder").and_then(|v| v.as_str()).map(PathBuf::from))
        .filter(|path| path.is_absolute());
    if let Ok(mut folder) = NOTES_FOLDER.write() {
        *folder = chosen;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesFolderInfo {
    // The folder in use now.
    path: String,
    default_path: String,
    // The folder chosen in Settings, when there is one.
    chosen: Option<String>,
    // A chosen folder that couldn't be reached, so the default is in use.
    unavailable: bool,
}

#[tauri::command]
pub fn notes_folder_info() -> Result<NotesFolderInfo, String> {
    let chosen = chosen_notes_dir();
    let path = notes_dir()?;
    let unavailable = chosen.as_ref().is_some_and(|c| !same_folder(c, &path));
    Ok(NotesFolderInfo {
        path: path.to_string_lossy().into_owned(),
        default_path: default_notes_dir().to_string_lossy().into_owned(),
        chosen: chosen.map(|c| c.to_string_lossy().into_owned()),
        unavailable,
    })
}

fn same_folder(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

// Switch to another notes folder (None: back to Data\Notes). With `copy`, the
// notes, their pictures, tags, pins and Recycle Bin are copied there first,
// merged with any notebook the folder already holds (merge.rs, Checkpoint
// 1.1.2); the originals are left where they were.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSwitch {
    path: String,
    #[serde(flatten)]
    report: merge::MergeReport,
}

#[tauri::command(async)]
pub fn set_notes_folder(path: Option<String>, copy: bool) -> Result<FolderSwitch, String> {
    let wanted = path.as_deref().map(PathBuf::from).unwrap_or_else(default_notes_dir);
    if !wanted.is_absolute() {
        return Err("Choose a folder with its full path, such as D:\\Notes.".into());
    }
    let current = notes_dir()?;
    let target = ensure(wanted)?;
    let same = same_folder(&current, &target);
    let report = if copy && !same { merge::merge_notebook(&current, &target)? } else { merge::MergeReport::default() };
    let is_default = same_folder(&target, &default_notes_dir());
    *NOTES_FOLDER.write().map_err(err)? = if is_default { None } else { Some(target.clone()) };
    Ok(FolderSwitch { path: target.to_string_lossy().into_owned(), report })
}

fn check_name(name: &str) -> Result<(), String> {
    let bad = name.is_empty()
        || name.starts_with('.')
        || name.contains(['/', '\\'])
        || name.contains("..")
        || !name.to_lowercase().ends_with(".md");
    if bad {
        Err(format!("Invalid note name: {name}"))
    } else {
        Ok(())
    }
}

pub fn title_of(name: &str) -> &str {
    &name[..name.len().saturating_sub(3)]
}

// Characters Windows won't allow in a file name, and the lookalikes a title
// keeps in their place. titleOf (notes/api.ts) turns them back, so a note can
// be called "Q3/Q4 plan" or "What's next?". Keep the two lists in step.
const NAME_LOOKALIKES: [(char, char); 9] = [
    ('/', '\u{2215}'),  // ∕ division slash
    ('\\', '\u{29F5}'), // ⧵ reverse solidus operator
    (':', '\u{A789}'),  // ꞉ modifier letter colon
    ('*', '\u{2217}'),  // ∗ asterisk operator
    ('?', '\u{FF1F}'),  // ？ fullwidth question mark
    ('"', '\u{FF02}'),  // ＂ fullwidth quotation mark
    ('<', '\u{FF1C}'),  // ＜ fullwidth less-than
    ('>', '\u{FF1E}'),  // ＞ fullwidth greater-than
    ('|', '\u{2223}'),  // ∣ divides
];

// Turn a title into a file name Windows accepts.
fn file_stem_for(title: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match NAME_LOOKALIKES.iter().find(|(bad, _)| *bad == c) {
            Some((_, safe)) => *safe,
            None if c.is_control() => ' ',
            None => c,
        })
        .collect();
    let cleaned = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    let cleaned = cleaned.trim_end_matches('.').trim().to_string();
    if cleaned.is_empty() {
        "Untitled".to_string()
    } else {
        cleaned
    }
}

// "Title.md", then "Title 2.md", "Title 3.md"… `keep` is the note being renamed,
// so renaming a note to its own title is not a collision.
pub fn unique_name(dir: &Path, title: &str, keep: Option<&str>) -> String {
    let stem = file_stem_for(title);
    let mut n = 1;
    loop {
        let candidate = if n == 1 { format!("{stem}.md") } else { format!("{stem} {n}.md") };
        let is_self = keep.is_some_and(|k| k.eq_ignore_ascii_case(&candidate));
        if is_self || !dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

fn millis(t: std::io::Result<SystemTime>) -> u64 {
    t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn list_md(dir: &Path) -> Result<Vec<NoteInfo>, String> {
    let mut out = Vec::new();
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !name.to_lowercase().ends_with(".md") {
            continue;
        }
        let meta = entry.metadata().map_err(err)?;
        if !meta.is_file() {
            continue;
        }
        out.push(NoteInfo { name, modified: millis(meta.modified()), created: millis(meta.created()), size: meta.len() });
    }
    Ok(out)
}

#[tauri::command]
pub fn list_notes() -> Result<Vec<NoteInfo>, String> {
    list_md(&notes_dir()?)
}

#[tauri::command]
pub fn read_note(name: String) -> Result<String, String> {
    check_name(&name)?;
    fs::read_to_string(notes_dir()?.join(&name)).map_err(err)
}

#[tauri::command]
pub fn write_note(name: String, contents: String) -> Result<(), String> {
    check_name(&name)?;
    write_atomic(&notes_dir()?.join(&name), &contents)
}

#[tauri::command]
pub fn create_note(title: String) -> Result<String, String> {
    let dir = notes_dir()?;
    let name = unique_name(&dir, &title, None);
    fs::write(dir.join(&name), "").map_err(err)?;
    Ok(name)
}

// The first-run notes: written only when the notes folder has no notes and no
// notebook files at all, so they never come back once deleted.
#[tauri::command]
pub fn seed_notes(notes: Vec<(String, String)>) -> Result<Vec<String>, String> {
    let dir = notes_dir()?;
    let untouched = fs::read_dir(&dir).map_err(err)?.flatten().all(|e| {
        let name = e.file_name().to_string_lossy().to_lowercase();
        !name.ends_with(".md") && !name.starts_with(".noted-")
    });
    if !untouched {
        return Ok(Vec::new());
    }
    let mut written = Vec::new();
    for (title, contents) in notes {
        let name = unique_name(&dir, &title, None);
        write_atomic(&dir.join(&name), &contents)?;
        written.push(name);
    }
    Ok(written)
}

#[tauri::command]
pub fn rename_note(name: String, title: String) -> Result<String, String> {
    check_name(&name)?;
    let dir = notes_dir()?;
    let new_name = unique_name(&dir, &title, Some(&name));
    if new_name != name {
        fs::rename(dir.join(&name), dir.join(&new_name)).map_err(err)?;
    }
    Ok(new_name)
}

#[tauri::command]
pub fn recycle_note(name: String) -> Result<String, String> {
    check_name(&name)?;
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let trash_name = format!("{}-{}-{:032x}.md", title_of(&name), Local::now().format("%Y%m%d-%H%M%S"), nanos);
    fs::rename(notes_dir()?.join(&name), trash_dir()?.join(&trash_name)).map_err(err)?;
    Ok(trash_name)
}

#[tauri::command]
pub fn delete_note(name: String) -> Result<(), String> {
    check_name(&name)?;
    fs::remove_file(notes_dir()?.join(&name)).map_err(err)
}

#[tauri::command]
pub fn list_trash() -> Result<Vec<NoteInfo>, String> {
    list_md(&trash_dir()?)
}

// The title a recycled note had: its name without the "-yyyyMMdd-HHmmss-id"
// recycling added. (Checkpoint 1.1.2 stripped only the time and id, so
// "Plans-20260923-170458-….md" came back as "Plans-20260923.md".)
fn recycled_title(stem: &str) -> &str {
    let re = regex::Regex::new(r"^(.*)-\d{8}-\d{6}-[0-9a-f]+$").expect("valid pattern");
    re.captures(stem).and_then(|c| c.get(1)).map(|m| m.as_str()).filter(|t| !t.is_empty()).unwrap_or(stem)
}

#[tauri::command]
pub fn restore_note(name: String) -> Result<String, String> {
    check_name(&name)?;
    let dir = notes_dir()?;
    let new_name = unique_name(&dir, recycled_title(title_of(&name)), None);
    fs::rename(trash_dir()?.join(&name), dir.join(&new_name)).map_err(err)?;
    Ok(new_name)
}

#[tauri::command]
pub fn delete_trash(name: String) -> Result<(), String> {
    check_name(&name)?;
    fs::remove_file(trash_dir()?.join(&name)).map_err(err)
}

// ----- import and export -----

#[derive(Serialize)]
pub struct ImportResult {
    imported: Vec<String>,
    failed: Vec<ImportFailure>,
}

#[derive(Serialize)]
pub struct ImportFailure {
    file: String,
    error: String,
}

#[tauri::command(async)]
pub fn import_notes(paths: Vec<String>) -> Result<ImportResult, String> {
    let dir = notes_dir()?;
    let mut result = ImportResult { imported: Vec::new(), failed: Vec::new() };
    // One unreadable file doesn't stop the rest; each failure is reported.
    for path in paths {
        let source = PathBuf::from(&path);
        let file = source.file_name().map(|f| f.to_string_lossy().into_owned()).unwrap_or_else(|| path.clone());
        let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("Imported note");
        let name = unique_name(&dir, stem, None);
        match fs::read(&source).map_err(err).and_then(|bytes| write_atomic(&dir.join(&name), &text_from_file(&bytes))) {
            Ok(()) => result.imported.push(name),
            Err(error) => result.failed.push(ImportFailure { file, error }),
        }
    }
    Ok(result)
}

// Notes are stored as UTF-8. Files from other apps may be UTF-16 (Notepad's
// "Unicode") or Windows-1252, so those are converted on the way in.
fn text_from_file(bytes: &[u8]) -> String {
    let utf16 = |bytes: &[u8], big: bool| {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|p| if big { u16::from_be_bytes([p[0], p[1]]) } else { u16::from_le_bytes([p[0], p[1]]) }).collect();
        String::from_utf16_lossy(&units)
    };
    match bytes {
        [0xFF, 0xFE, rest @ ..] => utf16(rest, false),
        [0xFE, 0xFF, rest @ ..] => utf16(rest, true),
        _ => web::decode_text("charset=windows-1252", bytes),
    }
}

#[tauri::command]
pub fn export_note(name: String, destination: String) -> Result<(), String> {
    check_name(&name)?;
    fs::copy(notes_dir()?.join(&name), destination).map(|_| ()).map_err(err)
}

fn zip_dir(zip: &mut zip::ZipWriter<fs::File>, dir: &Path, prefix: &str, options: zip::write::SimpleFileOptions) -> Result<usize, String> {
    use std::io::Write;
    let mut count = 0;
    for entry in fs::read_dir(dir).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            count += zip_dir(zip, &path, &format!("{prefix}{name}/"), options)?;
        } else {
            zip.start_file(format!("{prefix}{name}"), options).map_err(err)?;
            zip.write_all(&fs::read(&path).map_err(err)?).map_err(err)?;
            count += 1;
        }
    }
    Ok(count)
}

// Every note at the top of the ZIP, with the assets folder beside them.
#[tauri::command(async)]
pub fn export_all(destination: String) -> Result<usize, String> {
    let file = fs::File::create(&destination).map_err(err)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let count = zip_dir(&mut zip, &notes_dir()?, "", options)?;
    zip.finish().map_err(err)?;
    Ok(count)
}

#[tauri::command]
pub fn open_notes_folder() -> Result<(), String> {
    std::process::Command::new("explorer").arg(notes_dir()?).spawn().map(|_| ()).map_err(err)
}

// ----- pictures -----

fn assets_dir() -> Result<PathBuf, String> {
    ensure(notes_dir()?.join("assets"))
}

// A safe file name for a picture, keeping its extension.
fn asset_name(dir: &Path, wanted: &str) -> String {
    let wanted = Path::new(wanted);
    let ext = wanted.extension().and_then(|e| e.to_str()).unwrap_or("bin").to_lowercase();
    let stem = file_stem_for(wanted.file_stem().and_then(|s| s.to_str()).unwrap_or("image"));
    let mut n = 1;
    loop {
        let candidate = if n == 1 { format!("{stem}.{ext}") } else { format!("{stem}-{n}.{ext}") };
        if !dir.join(&candidate).exists() {
            return candidate;
        }
        n += 1;
    }
}

#[tauri::command]
pub fn save_asset(name: String, base64: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD.decode(base64).map_err(err)?;
    let dir = assets_dir()?;
    let file = asset_name(&dir, &name);
    fs::write(dir.join(&file), bytes).map_err(err)?;
    Ok(format!("assets/{file}"))
}

#[tauri::command]
pub fn import_asset(path: String) -> Result<String, String> {
    let source = PathBuf::from(&path);
    let dir = assets_dir()?;
    let file = asset_name(&dir, source.file_name().and_then(|s| s.to_str()).unwrap_or("image.png"));
    fs::copy(&source, dir.join(&file)).map_err(err)?;
    Ok(format!("assets/{file}"))
}

pub fn mime_for(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mp3") => "audio/mpeg",
        Some("pdf") => "application/pdf",
        _ => "application/octet-stream",
    }
}

// Serves the notes folder to the webview as http://pl.localhost/…, so
// "assets/picture.png" in a note shows up without leaving the disk. Dot files
// (the notebook files and the Recycle Bin) and anything outside are refused.
pub fn serve_note_file(request: &tauri::http::Request<Vec<u8>>) -> tauri::http::Response<std::borrow::Cow<'static, [u8]>> {
    let path = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8_lossy().into_owned();
    let rel = path.trim_start_matches('/');
    let unsafe_path = rel.is_empty() || rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty() || p.starts_with('.'));
    let file = if unsafe_path { None } else { notes_dir().ok().map(|d| d.join(rel)) };
    match file.and_then(|f| fs::read(&f).ok().map(|bytes| (f, bytes))) {
        Some((f, bytes)) => tauri::http::Response::builder()
            .header("Content-Type", mime_for(&f))
            .header("Cache-Control", "no-cache")
            .header("Access-Control-Allow-Origin", "*")
            .body(std::borrow::Cow::Owned(bytes))
            .unwrap(),
        None => tauri::http::Response::builder().status(404).body(std::borrow::Cow::Borrowed(&[][..])).unwrap(),
    }
}

// ----- notebook files -----

#[tauri::command]
pub fn read_meta(file: String) -> Result<Option<String>, String> {
    if !META_FILES.contains(&file.as_str()) {
        return Err(format!("Unknown notebook file: {file}"));
    }
    let path = notes_dir()?.join(&file);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
pub fn write_meta(file: String, contents: String) -> Result<(), String> {
    if !META_FILES.contains(&file.as_str()) {
        return Err(format!("Unknown notebook file: {file}"));
    }
    write_atomic(&notes_dir()?.join(&file), &contents)
}

// ----- link previews -----

#[derive(Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LinkPreview {
    url: String,
    title: String,
    description: String,
    site: String,
    image: String,
}

fn preview_cache_path(url: &str) -> PathBuf {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hasher);
    data_dir().join("LinkPreviews").join(format!("{:016x}.json", hasher.finish()))
}

fn decode_entities(s: &str) -> String {
    s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&#x27;", "'").replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
}

fn meta_content(html: &str, names: &[&str]) -> Option<String> {
    let tag = regex::Regex::new(r#"(?is)<meta\s[^>]*>"#).ok()?;
    let attr = |tag: &str, name: &str| -> Option<String> {
        let re = regex::Regex::new(&format!(r#"(?is)\b{name}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))"#)).ok()?;
        let c = re.captures(tag)?;
        Some(c.get(1).or_else(|| c.get(2)).or_else(|| c.get(3))?.as_str().to_string())
    };
    for wanted in names {
        for m in tag.find_iter(html) {
            let t = m.as_str();
            let key = attr(t, "property").or_else(|| attr(t, "name")).unwrap_or_default();
            if key.eq_ignore_ascii_case(wanted) {
                if let Some(content) = attr(t, "content") {
                    let content = decode_entities(content.trim());
                    if !content.is_empty() {
                        return Some(content);
                    }
                }
            }
        }
    }
    None
}

// The title, description and picture a page offers, for a link's hover card
// and pasted link titles. Cached on disk in Data\LinkPreviews, so each link
// is fetched once.
#[tauri::command(async)]
pub fn fetch_link_preview(url: String) -> Result<Option<LinkPreview>, String> {
    let cache = preview_cache_path(&url);
    if let Ok(text) = fs::read_to_string(&cache) {
        if let Ok(preview) = serde_json::from_str::<LinkPreview>(&text) {
            return Ok(Some(preview));
        }
    }
    let Ok((current, kind, bytes)) = web::fetch_public_head(&url, 3 * 1024 * 1024, 8) else {
        return Ok(None);
    };
    if !kind.contains("html") {
        return Ok(None);
    }
    let html = String::from_utf8_lossy(&bytes).into_owned();
    if html.is_empty() {
        return Ok(None);
    }
    let title_tag = regex::Regex::new(r"(?is)<title[^>]*>(.*?)</title>").ok().and_then(|re| re.captures(&html)).map(|c| decode_entities(c[1].trim()));
    let image = meta_content(&html, &["og:image", "og:image:url", "twitter:image"])
        .and_then(|i| current.join(&i).ok())
        .filter(|u| matches!(u.scheme(), "http" | "https"))
        .map(|u| u.to_string())
        .unwrap_or_default();
    let preview = LinkPreview {
        url: url.clone(),
        title: meta_content(&html, &["og:title", "twitter:title"]).or(title_tag).unwrap_or_default(),
        description: meta_content(&html, &["og:description", "twitter:description", "description"]).unwrap_or_default(),
        site: meta_content(&html, &["og:site_name"]).unwrap_or_else(|| current.host_str().unwrap_or_default().to_string()),
        image,
    };
    if let Some(dir) = cache.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let _ = fs::write(&cache, serde_json::to_string(&preview).unwrap_or_default());
    Ok(Some(preview))
}

#[cfg(test)]
mod tests {
    use super::recycled_title;

    #[test]
    fn restores_the_whole_title() {
        assert_eq!(recycled_title("Plans-20260923-170458-0000000000000000186a5d1c0f7b2e40"), "Plans");
        assert_eq!(recycled_title("Q3-Q4 plan-20260923-170458-ab12"), "Q3-Q4 plan");
        assert_eq!(recycled_title("No suffix"), "No suffix");
    }
}
