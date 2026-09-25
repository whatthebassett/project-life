// Files attached to tasks. Each is copied into Data\Attachments\<task id>\,
// so the task keeps it even if the original moves or goes; the task stores
// the path under Attachments ("<task id>/<file name>").
use std::{
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::{data_dir, ensure, err};

fn root() -> PathBuf {
    data_dir().join("Attachments")
}

// A stored path back to a file inside Attachments, and nowhere else.
fn resolve(stored: &str) -> Result<PathBuf, String> {
    let rel = Path::new(stored);
    if rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err("That isn't an attachment.".into());
    }
    Ok(root().join(rel))
}

// Task ids are hex; anything else can't name a folder.
fn task_folder(task: &str) -> Result<PathBuf, String> {
    if task.is_empty() || !task.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("That isn't a task.".into());
    }
    ensure(root().join(task))
}

#[derive(Serialize)]
pub struct Attached {
    path: String,
    name: String,
    size: u64,
}

#[tauri::command]
pub fn attach_file(task: String, source: String) -> Result<Attached, String> {
    let source = PathBuf::from(source);
    let meta = fs::metadata(&source).map_err(err)?;
    if !meta.is_file() {
        return Err("Only files can be attached.".into());
    }
    let name = source.file_name().and_then(|n| n.to_str()).ok_or("That file has no name.")?.to_string();
    let folder = task_folder(&task)?;
    // Two files with the same name: "sketch (2).png".
    let stem = Path::new(&name).file_stem().and_then(|s| s.to_str()).unwrap_or("file").to_string();
    let ext = Path::new(&name).extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let mut file = name.clone();
    let mut n = 2;
    while folder.join(&file).exists() {
        file = format!("{stem} ({n}){ext}");
        n += 1;
    }
    fs::copy(&source, folder.join(&file)).map_err(err)?;
    Ok(Attached { path: format!("{task}/{file}"), name: file, size: meta.len() })
}

#[tauri::command]
pub fn open_attachment(app: AppHandle, path: String) -> Result<(), String> {
    let file = resolve(&path)?;
    if !file.exists() {
        return Err("The file isn't there any more.".into());
    }
    app.opener().open_path(file.to_string_lossy().to_string(), None::<&str>).map_err(err)
}

// Removing an attachment deletes Project Life's copy (never the original).
#[tauri::command]
pub fn remove_attachment(path: String) -> Result<(), String> {
    let file = resolve(&path)?;
    if file.exists() {
        fs::remove_file(&file).map_err(err)?;
    }
    if let Some(dir) = file.parent() {
        if dir != root() && fs::read_dir(dir).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = fs::remove_dir(dir);
        }
    }
    Ok(())
}
