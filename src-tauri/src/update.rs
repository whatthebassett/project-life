// Updates (Settings → General → Updates, and About → Check for updates):
// releases are published on GitHub with the portable zip attached. Checking
// asks GitHub for the newest one on the chosen channel (Beta includes
// pre-releases); installing downloads the zip into Data\Updates, and on
// restart the new exe takes the old one's place. Windows lets a running exe be
// renamed, so the old one steps aside as "…exe.old" and is deleted next start.
use crate::{data_dir, ensure, err, web};
use serde::Serialize;
use serde_json::Value;
use std::{fs, io::Read, path::PathBuf};
use tauri::AppHandle;

// Where releases are published.
const REPO: &str = "whatthebassett/project-life";
const ZIP_SUFFIX: &str = "-portable.zip";

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

// The copy that's running, if it's the portable app (not a development build).
fn installed_exe() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(err)?;
    let dir = exe.parent().ok_or("Can't tell where Project Life is.")?;
    if cfg!(debug_assertions) || dir.ends_with("target\\release") || dir.ends_with("target\\debug") {
        return Err("Updates install into the portable app, not a development build.".into());
    }
    Ok(exe)
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

fn staged_exe() -> PathBuf {
    data_dir().join("Updates").join("Project Life.exe")
}

// Downloads the release and takes the new exe out of its zip, ready for the
// next start. Nothing changes until then.
#[tauri::command(async)]
pub fn update_download(download: String) -> Result<(), String> {
    installed_exe()?;
    if !download.starts_with("https://github.com/") {
        return Err("That download isn't from Project Life's releases.".into());
    }
    let bytes = get(&download, "application/octet-stream")?;
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
    let tmp = staged_exe().with_extension("exe.part");
    fs::write(&tmp, &exe).map_err(err)?;
    fs::rename(&tmp, staged_exe()).map_err(err)?;
    Ok(())
}

// Swaps in the downloaded exe and starts it.
#[tauri::command]
pub fn update_install(app: AppHandle) -> Result<(), String> {
    let exe = installed_exe()?;
    let staged = staged_exe();
    if !staged.exists() {
        return Err("Download the update first.".into());
    }
    let old = exe.with_extension("exe.old");
    let _ = fs::remove_file(&old);
    fs::rename(&exe, &old).map_err(|e| format!("Couldn't make room for the update: {e}"))?;
    if let Err(e) = fs::copy(&staged, &exe) {
        // Put the running copy back so Project Life still starts.
        let _ = fs::rename(&old, &exe);
        return Err(format!("Couldn't put the update in place: {e}"));
    }
    let _ = fs::remove_file(&staged);
    app.restart();
}

// Whether an update is downloaded and waiting for a restart.
#[tauri::command]
pub fn update_ready() -> bool {
    staged_exe().exists() && installed_exe().is_ok()
}

// Last start's old exe, once the new one is running.
pub fn clean_up() {
    if let Ok(exe) = installed_exe() {
        let _ = fs::remove_file(exe.with_extension("exe.old"));
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
