// What Settings needs from Windows and the disk: light or dark mode, the
// Windows version, fonts, whether a streaming app is running, the location,
// secrets, backups, export, clearing caches, deleting everything, crash logs,
// and importing from Checkpoint.
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::{data_dir, ensure, err, merge, notes, web};

// ----- Windows -----

fn reg_query(key: &str, value: &str) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let output = std::process::Command::new("reg")
        .args(["query", key, "/v", value])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let line = text.lines().find(|l| l.trim_start().starts_with(value))?.to_string();
    line.split_whitespace().last().map(str::to_string)
}

// "light" or "dark": how Windows shows apps (Settings → Personalization → Colors).
#[tauri::command]
pub fn system_theme() -> String {
    match reg_query(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme").as_deref() {
        Some("0x1") => "light".into(),
        _ => "dark".into(),
    }
}

// The Windows build number: 22000 and up is Windows 11 (Mica and Acrylic).
#[tauri::command]
pub fn os_build() -> u32 {
    reg_query(r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber")
        .and_then(|b| b.parse().ok())
        .unwrap_or(0)
}

// Which of these programs are running (by .exe name, any case).
#[tauri::command]
pub fn running_apps(names: Vec<String>) -> Vec<String> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS};
    let wanted: Vec<String> = names.iter().map(|n| n.to_lowercase()).collect();
    let mut found = Vec::new();
    unsafe {
        let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return found };
        let mut entry = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
        let mut ok = Process32FirstW(snap, &mut entry).is_ok();
        while ok {
            let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
            let exe = String::from_utf16_lossy(&entry.szExeFile[..len]).to_lowercase();
            if let Some(w) = wanted.iter().find(|w| **w == exe) {
                if !found.contains(w) {
                    found.push(w.clone());
                }
            }
            ok = Process32NextW(snap, &mut entry).is_ok();
        }
        let _ = CloseHandle(snap);
    }
    found
}

#[derive(Serialize)]
pub struct Position {
    latitude: f64,
    longitude: f64,
}

// Where this PC is, from Windows' location service (Settings → Privacy →
// Location, "Let desktop apps access your location").
#[tauri::command(async)]
pub fn current_location() -> Result<Position, String> {
    use windows::Devices::Geolocation::Geolocator;
    let locator = Geolocator::new().map_err(|_| "Windows' location service isn't available.".to_string())?;
    let position = locator
        .GetGeopositionAsync()
        .and_then(|op| op.get())
        .map_err(|_| "Couldn't get your location. Check that location is on for desktop apps in Windows Settings → Privacy → Location.".to_string())?;
    let point = position.Coordinate().and_then(|c| c.Point()).and_then(|p| p.Position()).map_err(err)?;
    Ok(Position { latitude: point.Latitude, longitude: point.Longitude })
}

// ----- secrets (Windows Credential Manager) -----

pub(crate) fn entry(name: &str) -> Result<keyring::Entry, String> {
    if name.is_empty() || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.') {
        return Err("That isn't a secret's name.".into());
    }
    keyring::Entry::new("Project Life", name).map_err(err)
}

#[tauri::command]
pub fn secret_get(name: String) -> Result<Option<String>, String> {
    match entry(&name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(err(e)),
    }
}

#[tauri::command]
pub fn secret_set(name: String, value: Option<String>) -> Result<(), String> {
    let e = entry(&name)?;
    match value.filter(|v| !v.is_empty()) {
        Some(v) => e.set_password(&v).map_err(err),
        None => match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(x) => Err(err(x)),
        },
    }
}

// ----- fonts (from Checkpoint) -----

fn fonts_dir() -> Result<PathBuf, String> {
    ensure(data_dir().join("Fonts"))
}

// Font families Windows has installed, by the names CSS matches.
#[tauri::command(async)]
pub fn list_system_fonts() -> Vec<String> {
    use windows::Win32::Foundation::LPARAM;
    use windows::Win32::Graphics::Gdi::{EnumFontFamiliesExW, GetDC, ReleaseDC, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW};

    unsafe extern "system" fn collect(font: *const LOGFONTW, _: *const TEXTMETRICW, _: u32, names: LPARAM) -> i32 {
        let names = unsafe { &mut *(names.0 as *mut Vec<String>) };
        let face = unsafe { &(*font).lfFaceName };
        let len = face.iter().position(|&c| c == 0).unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..len]);
        // "@Name" entries are the vertical-writing variants, and names that fill
        // the 31-character field are cut off, so CSS couldn't match them.
        if !name.is_empty() && !name.starts_with('@') && len < face.len() - 1 {
            names.push(name);
        }
        1
    }

    let mut names: Vec<String> = Vec::new();
    unsafe {
        let dc = GetDC(None);
        let font = LOGFONTW { lfCharSet: DEFAULT_CHARSET, ..Default::default() };
        EnumFontFamiliesExW(dc, &font, Some(collect), LPARAM(&mut names as *mut _ as isize), 0);
        ReleaseDC(None, dc);
    }
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup();
    names
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppFont {
    family: String,
    weight: u16,
    italic: bool,
    // Relative to Data\Fonts, with forward slashes.
    path: String,
    folder: String,
}

fn be16(d: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes([*d.get(at)?, *d.get(at + 1)?]))
}

fn be32(d: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes([*d.get(at)?, *d.get(at + 1)?, *d.get(at + 2)?, *d.get(at + 3)?]))
}

// Family, weight and italic from a TrueType/OpenType file's name and OS/2 tables.
fn font_face_info(data: &[u8]) -> Option<(String, u16, bool)> {
    let tables = be16(data, 4)? as usize;
    let (mut name, mut os2) = (None, None);
    for i in 0..tables {
        let record = 12 + i * 16;
        let offset = be32(data, record + 8)? as usize;
        match data.get(record..record + 4)? {
            b"name" => name = Some(offset),
            b"OS/2" => os2 = Some(offset),
            _ => {}
        }
    }
    let table = name?;
    let count = be16(data, table + 2)? as usize;
    let storage = table + be16(data, table + 4)? as usize;
    let mut best: Option<(u8, String)> = None;
    for i in 0..count {
        let r = table + 6 + i * 12;
        let (platform, encoding, language, id) = (be16(data, r)?, be16(data, r + 2)?, be16(data, r + 4)?, be16(data, r + 6)?);
        if platform != 3 || !(encoding == 0 || encoding == 1) || !(id == 1 || id == 16) {
            continue;
        }
        let (len, off) = (be16(data, r + 8)? as usize, be16(data, r + 10)? as usize);
        let bytes = data.get(storage + off..storage + off + len)?;
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_be_bytes([c[0], c[1]])).collect();
        let rank = (if id == 16 { 2 } else { 0 }) + (if language == 0x409 { 1 } else { 0 });
        if best.as_ref().is_none_or(|(r, _)| rank > *r) {
            best = Some((rank, String::from_utf16_lossy(&units)));
        }
    }
    let family = best?.1.trim().to_string();
    let (weight, italic) = match os2 {
        Some(o) => (be16(data, o + 4).unwrap_or(400), be16(data, o + 62).unwrap_or(0) & 1 == 1),
        None => (400, false),
    };
    Some((family, weight.clamp(1, 1000), italic))
}

// Fonts downloaded into Data\Fonts, one folder per family. Project Life loads
// these itself; they're never installed into Windows.
#[tauri::command(async)]
pub fn list_app_fonts() -> Result<Vec<AppFont>, String> {
    let root = fonts_dir()?;
    let mut fonts = Vec::new();
    for folder in fs::read_dir(&root).map_err(err)?.flatten() {
        if !folder.path().is_dir() {
            continue;
        }
        let folder_name = folder.file_name().to_string_lossy().into_owned();
        for file in fs::read_dir(folder.path()).map_err(err)?.flatten() {
            let path = file.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
            if ext != "ttf" && ext != "otf" {
                continue;
            }
            let Ok(data) = fs::read(&path) else { continue };
            let Some((family, weight, italic)) = font_face_info(&data) else { continue };
            fonts.push(AppFont { family, weight, italic, path: format!("{folder_name}/{}", file.file_name().to_string_lossy()), folder: folder_name.clone() });
        }
    }
    Ok(fonts)
}

// Download a Google Fonts family (regular, bold and their italics where the
// family has them) into Data\Fonts\<slug>, with its license.
#[tauri::command(async)]
pub fn download_google_font(family: String) -> Result<String, String> {
    let family = family.split_whitespace().collect::<Vec<_>>().join(" ");
    let valid = regex::Regex::new(r"^[A-Za-z0-9][A-Za-z0-9 \-]{0,79}$").map_err(err)?;
    if !valid.is_match(&family) {
        return Err("Enter a Google Fonts family name, such as IBM Plex Sans.".into());
    }
    let slug: String = family.to_lowercase().chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let query = family.replace(' ', "+");
    let mut css = None;
    for spec in [":ital,wght@0,400;0,700;1,400;1,700", ":wght@400;700", ""] {
        let url = format!("https://fonts.googleapis.com/css2?family={query}{spec}&display=swap");
        if let Ok(text) = web::fetch_plain(&url, 40) {
            css = Some(text);
            break;
        }
    }
    let css = css.ok_or("Couldn't find that family in Google Fonts. Check its name on fonts.google.com and try again.")?;
    let url_re = regex::Regex::new(r"url\((https://[^)\s]+)\)").map_err(err)?;
    let mut urls: Vec<String> = url_re.captures_iter(&css).map(|c| c[1].to_string()).collect();
    urls.dedup();
    if urls.is_empty() || urls.len() > 8 {
        return Err("Google Fonts returned an unsupported font download.".into());
    }
    let mut files = Vec::new();
    for url in &urls {
        let parsed = url::Url::parse(url).map_err(err)?;
        let path = parsed.path().to_lowercase();
        if parsed.scheme() != "https" || parsed.host_str() != Some("fonts.gstatic.com") || !(path.ends_with(".ttf") || path.ends_with(".otf")) {
            return Err("Google Fonts did not return a desktop font.".into());
        }
        let data = web::fetch_bytes(url, 12_000_000)?;
        if data.len() < 12 || !(data.starts_with(&[0, 1, 0, 0]) || data.starts_with(b"OTTO")) {
            return Err("The download was not a valid desktop font.".into());
        }
        files.push(data);
    }
    let folder = fonts_dir()?.join(&slug);
    if folder.exists() {
        fs::remove_dir_all(&folder).map_err(err)?;
    }
    fs::create_dir_all(&folder).map_err(err)?;
    for (i, data) in files.iter().enumerate() {
        fs::write(folder.join(format!("ProjectLife-{slug}-{i}.ttf")), data).map_err(err)?;
    }
    for path in [format!("ofl/{slug}/OFL.txt"), format!("apache/{slug}/LICENSE.txt"), format!("ufl/{slug}/LICENCE.txt")] {
        if let Ok(text) = web::fetch_plain(&format!("https://raw.githubusercontent.com/google/fonts/main/{path}"), 20) {
            let _ = fs::write(folder.join("LICENSE.txt"), text);
            break;
        }
    }
    Ok(files.first().and_then(|d| font_face_info(d)).map(|(f, _, _)| f).unwrap_or(family))
}

#[tauri::command]
pub fn remove_app_font(folder: String) -> Result<(), String> {
    if folder.is_empty() || !folder.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("That isn't a font folder.".into());
    }
    fs::remove_dir_all(fonts_dir()?.join(folder)).map_err(err)
}

// A file from Data\Fonts, for the pl:// scheme's "__fonts/" path.
pub fn font_file(rel: &str) -> Option<PathBuf> {
    if rel.split(['/', '\\']).any(|p| p == ".." || p.is_empty()) {
        return None;
    }
    fonts_dir().ok().map(|d| d.join(rel))
}

// ----- the data folder -----

fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(dir) else { return 0 };
    entries
        .flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => dir_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataInfo {
    data: String,
    notes: String,
    // Notes live inside Data (Project Life's own folder), not somewhere shared.
    notes_inside: bool,
    bytes: u64,
    default_backups: String,
}

fn notes_path() -> Result<PathBuf, String> {
    notes::notes_dir()
}

fn inside(child: &Path, parent: &Path) -> bool {
    match (fs::canonicalize(child), fs::canonicalize(parent)) {
        (Ok(c), Ok(p)) => c.starts_with(p),
        _ => false,
    }
}

#[tauri::command]
pub fn data_info() -> Result<DataInfo, String> {
    let data = ensure(data_dir())?;
    let notes = notes_path()?;
    let notes_inside = inside(&notes, &data);
    let bytes = dir_size(&data) + if notes_inside { 0 } else { dir_size(&notes) };
    let shown = fs::canonicalize(&data).unwrap_or(data.clone());
    let clean = |p: &Path| p.to_string_lossy().trim_start_matches(r"\\?\").to_string();
    Ok(DataInfo { data: clean(&shown), notes: clean(&fs::canonicalize(&notes).unwrap_or(notes.clone())), notes_inside, bytes, default_backups: clean(&shown.join("Backups")) })
}

#[tauri::command]
pub fn open_data_folder(app: AppHandle, sub: Option<String>) -> Result<(), String> {
    let mut dir = ensure(data_dir())?;
    if let Some(s) = sub.filter(|s| ["Logs", "Backups", "Fonts"].contains(&s.as_str())) {
        dir = ensure(dir.join(s))?;
    }
    app.opener().open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(err)
}

// The backup folder chosen in Settings (Data\Backups when none is).
#[tauri::command]
pub fn open_backup_folder(app: AppHandle, folder: Option<String>) -> Result<(), String> {
    let dir = match folder.filter(|f| !f.is_empty()) {
        Some(f) => ensure(PathBuf::from(f))?,
        None => ensure(data_dir().join("Backups"))?,
    };
    app.opener().open_path(dir.to_string_lossy().to_string(), None::<&str>).map_err(err)
}

// Everything worth keeping, as a zip: the Data folder (not its backups, logs
// or caches) and, when they live elsewhere, the notes under "Notes\".
fn zip_everything(target: &Path) -> Result<(), String> {
    use zip::write::SimpleFileOptions;
    let data = ensure(data_dir())?;
    let notes = notes_path()?;
    let file = fs::File::create(target).map_err(err)?;
    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let skip = ["Backups", "Logs", "LinkPreviews"];
    fn add(zip: &mut zip::ZipWriter<fs::File>, dir: &Path, prefix: &str, skip: &[&str], options: SimpleFileOptions, target: &Path) -> Result<(), String> {
        for entry in fs::read_dir(dir).map_err(err)?.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let path = entry.path();
            if prefix.is_empty() && skip.contains(&name.as_str()) || path == target || name.ends_with(".tmp") {
                continue;
            }
            let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
            if path.is_dir() {
                add(zip, &path, &rel, skip, options, target)?;
            } else if let Ok(bytes) = fs::read(&path) {
                zip.start_file(&rel, options).map_err(err)?;
                zip.write_all(&bytes).map_err(err)?;
            }
        }
        Ok(())
    }
    add(&mut zip, &data, "", &skip, options, target)?;
    if !inside(&notes, &data) && notes.exists() {
        add(&mut zip, &notes, "Notes", &[], options, target)?;
    }
    zip.finish().map_err(err)?;
    Ok(())
}

#[tauri::command(async)]
pub fn export_everything(target: String) -> Result<(), String> {
    zip_everything(Path::new(&target))
}

// A backup for today in `folder` (Data\Backups when none is set), keeping
// the newest `keep` of them.
#[tauri::command(async)]
pub fn backup_now(folder: Option<String>, keep: usize) -> Result<String, String> {
    let dir = match folder.filter(|f| !f.is_empty()) {
        Some(f) => ensure(PathBuf::from(f))?,
        None => ensure(data_dir().join("Backups"))?,
    };
    let name = format!("Project Life {}.zip", chrono::Local::now().format("%Y-%m-%d"));
    let target = dir.join(&name);
    let tmp = dir.join(format!("{name}.tmp"));
    zip_everything(&tmp)?;
    fs::rename(&tmp, &target).map_err(err)?;
    let mut backups: Vec<PathBuf> = fs::read_dir(&dir)
        .map_err(err)?
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().and_then(|n| n.to_str()).is_some_and(|n| n.starts_with("Project Life ") && n.ends_with(".zip")))
        .collect();
    backups.sort();
    while backups.len() > keep.max(1) {
        let _ = fs::remove_file(backups.remove(0));
    }
    Ok(target.to_string_lossy().to_string())
}

// Link previews saved on disk (the news and weather caches live in memory).
#[tauri::command]
pub fn clear_caches() -> Result<(), String> {
    let dir = data_dir().join("LinkPreviews");
    if dir.exists() {
        fs::remove_dir_all(dir).map_err(err)?;
    }
    Ok(())
}

// Settings → Privacy → Delete all data on this PC: the Data folder, and the
// notes too when they're Project Life's own (a notes folder shared with
// Checkpoint is never touched). The app restarts fresh afterwards.
#[tauri::command]
pub fn delete_all_data(app: AppHandle) -> Result<(), String> {
    // Notes kept outside Data (a folder shared with Checkpoint) aren't in
    // here, so they stay; notes in Data\Notes go with the rest.
    let data = data_dir();
    // Connected accounts' sign-ins, and the OBS password, leave Credential Manager too.
    if let Some(accounts) = fs::read_to_string(data.join("accounts.json")).ok().and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok()) {
        for a in accounts["Accounts"].as_array().into_iter().flatten() {
            if let Some(id) = a["Id"].as_str() {
                let _ = crate::accounts::account_disconnect(id.to_string());
            }
        }
    }
    let _ = secret_set("obs-websocket".into(), None);
    if data.exists() {
        for entry in fs::read_dir(&data).map_err(err)?.flatten() {
            let path = entry.path();
            let _ = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
        }
    }
    app.restart();
}

// ----- crash reports (Settings → Privacy → Save crash reports) -----

pub fn log_crash(text: &str) {
    let Ok(dir) = ensure(data_dir().join("Logs")) else { return };
    let file = dir.join(format!("crash-{}.log", chrono::Local::now().format("%Y-%m-%d")));
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(f, "[{}] {}\n", chrono::Local::now().format("%H:%M:%S"), text);
    }
}

#[tauri::command]
pub fn save_crash(text: String) {
    log_crash(&text.chars().take(20_000).collect::<String>());
}

// ----- Import from Checkpoint -----

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    notes: merge::MergeReport,
    // Checkpoint's task file, for the page to fold into tasks.json.
    tasks: Option<String>,
    from: String,
}

// Checkpoint's notes, from its folder, its Data folder, or where its
// settings say they are.
fn checkpoint_notes(picked: &Path) -> Option<PathBuf> {
    let is_notebook = |d: &Path| d.join(".noted-order.json").exists() || d.join(".noted-tags.json").exists() || fs::read_dir(d).ok().is_some_and(|mut r| r.any(|e| e.ok().is_some_and(|e| e.file_name().to_string_lossy().to_lowercase().ends_with(".md"))));
    for data in [picked.to_path_buf(), picked.join("Data")] {
        if let Some(folder) = fs::read_to_string(data.join("settings.json"))
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(t.trim_start_matches('\u{feff}')).ok())
            .and_then(|v| v.get("NotesFolder").and_then(|f| f.as_str()).map(PathBuf::from))
        {
            if folder.is_dir() {
                return Some(folder);
            }
        }
        if data.join("Notes").is_dir() && is_notebook(&data.join("Notes")) {
            return Some(data.join("Notes"));
        }
    }
    is_notebook(picked).then(|| picked.to_path_buf())
}

#[tauri::command(async)]
pub fn import_checkpoint(folder: String) -> Result<Imported, String> {
    let picked = PathBuf::from(&folder);
    let from = checkpoint_notes(&picked).ok_or("That doesn't look like Checkpoint. Pick Checkpoint's folder, its Data folder, or its notes folder.")?;
    let to = notes_path()?;
    let tasks = fs::read_to_string(from.join(".noted-tasks.json")).ok();
    // A notes folder the two apps already share: its notes are here, so only
    // the tasks come in.
    let shared = inside(&from, &to) && inside(&to, &from);
    let notes = if shared { merge::MergeReport::default() } else { merge::merge_notebook(&from, &to)? };
    Ok(Imported { notes, tasks, from: from.to_string_lossy().to_string() })
}
