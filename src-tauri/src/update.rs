// Updates (Settings → General → Updates, and About → Check for updates):
// releases are published on GitHub with the portable zip attached. Checking
// asks GitHub for the newest one on the chosen channel (Beta includes
// pre-releases); installing downloads the zip into Data\Updates, and on
// restart the new exe takes the old one's place. Windows lets a running exe be
// renamed, so the old one steps aside as "…exe.old" and is deleted next start.
//
// A Mac's release is a zip of Project Life.app ("…-mac-arm64.zip", from
// `npm run mac`). It's handled the same way: the new app waits in Updates, and
// on restart the old one steps aside as "Project Life.app.old".
use crate::{data_dir, ensure, err, web};
use serde::Serialize;
use serde_json::Value;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

// Where releases are published.
const REPO: &str = "whatthebassett/project-life";

// How this system's download ends. The Mac app is for Apple silicon only.
const ZIP_SUFFIX: &str = if cfg!(target_os = "macos") { "-mac-arm64.zip" } else { "-portable.zip" };

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    version: String,
    name: String,
    notes: String,
    page: String,
    download: String,
    prerelease: bool,
    published: String,
}

// "v0.2.0" and "0.10.1-beta.2" as numbers to compare; a pre-release sorts
// before its release.
fn version_key(v: &str) -> (Vec<u64>, bool) {
    let v = v.trim().trim_start_matches(['v', 'V']);
    let (main, pre) = match v.split_once('-') {
        Some((m, p)) => (m, !p.is_empty()),
        None => (v, false),
    };
    (main.split('.').map(|n| n.parse().unwrap_or(0)).collect(), !pre)
}

fn newer(a: &str, b: &str) -> bool {
    version_key(a) > version_key(b)
}

// The copy that's running, if it's the portable app (not a development build):
// the exe on Windows, Project Life.app on a Mac.
fn installed() -> Result<PathBuf, String> {
    const DEV: &str = "Updates install into the portable app, not a development build.";
    let exe = std::env::current_exe().map_err(err)?;
    let dir = exe.parent().ok_or("Can't tell where Project Life is.")?;
    if cfg!(debug_assertions) || dir.ends_with(Path::new("target").join("release")) || dir.ends_with(Path::new("target").join("debug")) {
        return Err(DEV.into());
    }
    if cfg!(target_os = "macos") {
        // …/Project Life.app/Contents/MacOS/project-life
        let app = exe.ancestors().nth(3).filter(|a| a.extension().is_some_and(|e| e == "app")).ok_or(DEV)?;
        if app.components().any(|c| c.as_os_str() == "target") {
            return Err(DEV.into());
        }
        // An app opened straight from a download runs from a read-only copy
        // macOS makes of it, which can't be replaced.
        if app.components().any(|c| c.as_os_str() == "AppTranslocation") {
            return Err("Move Project Life to the Applications folder and open it from there. Then it can update itself.".into());
        }
        return Ok(app.to_path_buf());
    }
    Ok(exe)
}

// Where the old copy waits while the new one starts.
fn old_copy(installed: &Path) -> PathBuf {
    installed.with_extension(if cfg!(target_os = "macos") { "app.old" } else { "exe.old" })
}

// A file, or a Mac app (which is a folder).
fn remove(path: &Path) {
    let _ = if path.is_dir() { fs::remove_dir_all(path) } else { fs::remove_file(path) };
}

fn get(url: &str, accept: &str) -> Result<Vec<u8>, String> {
    // GitHub sends downloads on to its file servers, so follow a few redirects.
    let agent = web::web_agent(120, "ProjectLife-Updater");
    let mut url = url.to_string();
    for _ in 0..5 {
        let mut res = agent.get(&url).header("Accept", accept).call().map_err(|e| format!("Couldn't reach GitHub: {e}."))?;
        let status = res.status().as_u16();
        if (300..400).contains(&status) {
            url = res.headers().get("location").and_then(|l| l.to_str().ok()).ok_or("GitHub sent an odd answer.")?.to_string();
            continue;
        }
        if status == 404 {
            return Err("No releases have been published yet.".into());
        }
        if status != 200 {
            return Err(format!("GitHub answered {status}."));
        }
        let mut bytes = Vec::new();
        res.body_mut().as_reader().take(300 * 1024 * 1024).read_to_end(&mut bytes).map_err(err)?;
        return Ok(bytes);
    }
    Err("GitHub sent too many redirects.".into())
}

#[tauri::command(async)]
pub fn update_check(app: AppHandle, beta: bool) -> Result<Option<Release>, String> {
    let bytes = get(&format!("https://api.github.com/repos/{REPO}/releases?per_page=20"), "application/vnd.github+json")?;
    let list: Value = serde_json::from_slice(&bytes).map_err(err)?;
    let current = app.package_info().version.to_string();
    let best = list
        .as_array()
        .into_iter()
        .flatten()
        .filter(|r| !r["draft"].as_bool().unwrap_or(false) && (beta || !r["prerelease"].as_bool().unwrap_or(false)))
        .filter_map(|r| {
            let download = r["assets"].as_array()?.iter().find(|a| a["name"].as_str().is_some_and(|n| n.ends_with(ZIP_SUFFIX)))?["browser_download_url"].as_str()?.to_string();
            let tag = r["tag_name"].as_str()?.trim_start_matches(['v', 'V']).to_string();
            Some(Release {
                name: r["name"].as_str().filter(|n| !n.is_empty()).unwrap_or(&tag).to_string(),
                version: tag,
                notes: r["body"].as_str().unwrap_or("").to_string(),
                page: r["html_url"].as_str().unwrap_or("").to_string(),
                download,
                prerelease: r["prerelease"].as_bool().unwrap_or(false),
                published: r["published_at"].as_str().unwrap_or("").to_string(),
            })
        })
        .max_by(|a, b| version_key(&a.version).cmp(&version_key(&b.version)));
    Ok(best.filter(|r| newer(&r.version, &current)))
}

fn staged() -> PathBuf {
    data_dir().join("Updates").join(if cfg!(target_os = "macos") { "Project Life.app" } else { "Project Life.exe" })
}

// Takes the new exe out of its zip and leaves it in Updates.
#[cfg(not(target_os = "macos"))]
fn stage(bytes: Vec<u8>) -> Result<(), String> {
    let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|_| "The download isn't a zip.".to_string())?;
    let mut exe = None;
    for i in 0..zip.len() {
        let mut f = zip.by_index(i).map_err(err)?;
        if f.name().replace('\\', "/").ends_with("/Project Life.exe") || f.name() == "Project Life.exe" {
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(err)?;
            exe = Some(buf);
            break;
        }
    }
    let exe = exe.ok_or("The download doesn't have Project Life.exe in it.")?;
    // A real Windows program starts with "MZ".
    if exe.len() < 1024 * 1024 || !exe.starts_with(b"MZ") {
        return Err("The downloaded Project Life.exe doesn't look right.".into());
    }
    ensure(data_dir().join("Updates"))?;
    let tmp = staged().with_extension("exe.part");
    fs::write(&tmp, &exe).map_err(err)?;
    fs::rename(&tmp, staged()).map_err(err)?;
    Ok(())
}

// Takes Project Life.app out of its zip and leaves it in Updates. ditto does
// the unzipping: it keeps what a Mac app needs (which files can run, links,
// the signature).
#[cfg(target_os = "macos")]
fn stage(bytes: Vec<u8>) -> Result<(), String> {
    let updates = ensure(data_dir().join("Updates"))?;
    let (zip, unpacked) = (updates.join("update.zip"), updates.join("unpacked"));
    remove(&unpacked);
    fs::write(&zip, &bytes).map_err(err)?;
    let unzipped = std::process::Command::new("/usr/bin/ditto").args(["-x", "-k"]).arg(&zip).arg(&unpacked).status().map(|s| s.success()).unwrap_or(false);
    remove(&zip);
    let app = unpacked.join("Project Life.app");
    // The real thing has a program inside and says it's Project Life.
    let about = fs::read(app.join("Contents").join("Info.plist")).unwrap_or_default();
    let right = unzipped && app.join("Contents").join("MacOS").is_dir() && String::from_utf8_lossy(&about).contains("com.ultimabass.projectlife");
    if !right {
        remove(&unpacked);
        return Err(if unzipped { "The download doesn't have Project Life.app in it." } else { "The download isn't a zip." }.into());
    }
    remove(&staged());
    let moved = fs::rename(&app, staged()).map_err(err);
    remove(&unpacked);
    moved
}

// Downloads the release and takes the new app out of its zip, ready for the
// next start. Nothing changes until then.
#[tauri::command(async)]
pub fn update_download(download: String) -> Result<(), String> {
    installed()?;
    if !download.starts_with("https://github.com/") {
        return Err("That download isn't from Project Life's releases.".into());
    }
    stage(get(&download, "application/octet-stream")?)
}

// Puts the downloaded copy where the running one was.
fn put(staged: &Path, installed: &Path) -> Result<(), String> {
    if cfg!(target_os = "macos") {
        // A move, or a copy when Updates is on another disk than the app.
        if fs::rename(staged, installed).is_ok() {
            return Ok(());
        }
        return match std::process::Command::new("/usr/bin/ditto").arg(staged).arg(installed).status() {
            Ok(s) if s.success() => Ok(()),
            _ => Err("it couldn't be copied there".into()),
        };
    }
    fs::copy(staged, installed).map(|_| ()).map_err(err)
}

// Swaps in the downloaded app and starts it.
#[tauri::command]
pub fn update_install(app: AppHandle) -> Result<(), String> {
    let installed = installed()?;
    let staged = staged();
    if !staged.exists() {
        return Err("Download the update first.".into());
    }
    let old = old_copy(&installed);
    remove(&old);
    fs::rename(&installed, &old).map_err(|e| format!("Couldn't make room for the update: {e}"))?;
    if let Err(e) = put(&staged, &installed) {
        // Put the running copy back so Project Life still starts.
        remove(&installed);
        let _ = fs::rename(&old, &installed);
        return Err(format!("Couldn't put the update in place: {e}"));
    }
    remove(&staged);
    app.restart();
}

// Whether an update is downloaded and waiting for a restart.
#[tauri::command]
pub fn update_ready() -> bool {
    staged().exists() && installed().is_ok()
}

// Last start's old copy, once the new one is running.
pub fn clean_up() {
    if let Ok(installed) = installed() {
        remove(&old_copy(&installed));
    }
}

#[cfg(test)]
mod tests {
    use super::newer;

    #[test]
    fn compares_versions() {
        assert!(newer("0.2.0", "0.1.0"));
        assert!(newer("v0.10.0", "0.9.9"));
        assert!(newer("0.2.0", "0.2.0-beta.1"));
        assert!(!newer("0.2.0-beta.1", "0.2.0"));
        assert!(!newer("0.1.0", "0.1.0"));
    }
}
