// Copying a notebook into a folder that may already hold one. Nothing already
// in the folder is replaced:
// - A note whose name is taken gets the next free one ("Plans 2.md"), and a
//   note that's already there, word for word, is left as is.
// - Pictures work the same way, and notes that point at a renamed picture are
//   pointed at its new name.
// - Order, tags, priorities, notebooks (pages), pins, tasks and stats are
//   combined, so both notebooks keep how they were organized.
// - The Recycle Bin's files are added alongside the folder's own.
// The notebook being copied from is only read, never changed.
use serde::Serialize;
use serde_json::{Map, Value};
use std::{
    collections::HashMap,
    fs,
    path::Path,
};

use crate::notes::{title_of, unique_name};
use crate::{err, write_atomic};

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeReport {
    // Notes written into the folder, and how many of those had to be renamed.
    pub copied: usize,
    pub renamed: usize,
    // Notes that were already there, identical.
    pub same: usize,
    // The folder had a notebook of its own before.
    pub merged: bool,
}

const TRASH: &str = ".noted-trash";
const ASSETS: &str = "assets";

pub fn merge_notebook(from: &Path, to: &Path) -> Result<MergeReport, String> {
    let mut report = MergeReport { merged: has_notebook(to)?, ..Default::default() };

    // Pictures first, so the notes can be pointed at any that were renamed.
    let pictures = merge_files(&from.join(ASSETS), &to.join(ASSETS), "-")?;

    // Notes. `names` maps each note's old name (lowercase) to its name here.
    let mut names: HashMap<String, String> = HashMap::new();
    for entry in fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || !name.to_lowercase().ends_with(".md") || !entry.file_type().map_err(err)?.is_file() {
            continue;
        }
        let mut text = String::from_utf8_lossy(&fs::read(entry.path()).map_err(err)?).into_owned();
        for (old, new) in &pictures {
            text = text.replace(&format!("{ASSETS}/{old}"), &format!("{ASSETS}/{new}"));
            let (old_enc, new_enc) = (encode(old), encode(new));
            if old_enc != *old {
                text = text.replace(&format!("{ASSETS}/{old_enc}"), &format!("{ASSETS}/{new_enc}"));
            }
        }
        let existing = to.join(&name);
        let placed = if existing.exists() {
            if fs::read_to_string(&existing).map(|t| t == text).unwrap_or(false) {
                report.same += 1;
                names.insert(name.to_lowercase(), name.clone());
                continue;
            }
            report.renamed += 1;
            unique_name(to, title_of(&name), None)
        } else {
            name.clone()
        };
        write_atomic(&to.join(&placed), &text)?;
        report.copied += 1;
        names.insert(name.to_lowercase(), placed);
    }

    // The Recycle Bin's notes, alongside the folder's own.
    merge_files(&from.join(TRASH), &to.join(TRASH), " ")?;

    // How the notes were organized.
    let rename = |n: &str| names.get(&n.to_lowercase()).cloned().unwrap_or_else(|| n.to_string());
    merge_json(from, to, ".noted-order.json", |mine, theirs| Value::Array(union(list(mine), list(theirs).into_iter().map(|n| rename(&n)).collect())))?;
    merge_json(from, to, ".noted-pins.json", |mine, theirs| Value::Array(union(list(mine), list(theirs).into_iter().map(|n| rename(&n)).collect())))?;
    merge_json(from, to, ".noted-tags.json", |mine, theirs| merge_tags(mine, theirs, &rename))?;
    merge_json(from, to, ".noted-pages.json", |mine, theirs| merge_pages(mine, theirs, &rename))?;
    merge_json(from, to, ".noted-tasks.json", merge_tasks)?;
    merge_json(from, to, ".noted-stats.json", |mine, theirs| {
        let mut out = object(mine);
        let notes = out.entry("Notes").or_insert_with(|| Value::Object(Map::new()));
        if let (Some(into), Some(add)) = (notes.as_object_mut(), theirs.get("Notes").and_then(Value::as_object)) {
            for (name, stats) in add {
                insert_missing(into, &rename(name), stats.clone());
            }
        }
        Value::Object(out)
    })?;
    // Folders from before tags: only for a folder with no tags of its own.
    if !to.join(".noted-tags.json").exists() && !to.join(".noted-folders.json").exists() && from.join(".noted-folders.json").exists() {
        fs::copy(from.join(".noted-folders.json"), to.join(".noted-folders.json")).map_err(err)?;
    }

    // Anything else in the notebook folder that isn't already there.
    let target_real = fs::canonicalize(to).ok();
    for entry in fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let lower = name.to_lowercase();
        if lower.ends_with(".md") || lower.starts_with(".noted-") || lower == ASSETS {
            continue;
        }
        // The folder being copied into can sit inside this one; don't copy it into itself.
        if let (Some(t), Ok(e)) = (&target_real, fs::canonicalize(entry.path())) {
            if t.starts_with(&e) {
                continue;
            }
        }
        let dest = to.join(&name);
        if dest.exists() {
            continue;
        }
        if entry.file_type().map_err(err)?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), &dest).map_err(err)?;
        }
    }
    Ok(report)
}

// Does this folder already hold a notebook: notes, or Checkpoint's own files?
pub fn has_notebook(dir: &Path) -> Result<bool, String> {
    if !dir.exists() {
        return Ok(false);
    }
    for entry in fs::read_dir(dir).map_err(err)? {
        let name = entry.map_err(err)?.file_name().to_string_lossy().to_lowercase();
        if name.ends_with(".md") || (name.starts_with(".noted-") && name != TRASH) {
            return Ok(true);
        }
    }
    Ok(false)
}

// Copy a folder's files into another, giving a file whose name is taken the
// next free one, and skipping files that are already there unchanged.
// Returns the renames (old name → new name). Pictures are numbered with a
// hyphen ("photo-2.png"), since a space would break the links to them.
fn merge_files(from: &Path, to: &Path, sep: &str) -> Result<HashMap<String, String>, String> {
    let mut renames = HashMap::new();
    if !from.is_dir() {
        return Ok(renames);
    }
    fs::create_dir_all(to).map_err(err)?;
    for entry in fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        if !entry.file_type().map_err(err)?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let dest = to.join(&name);
        if dest.exists() {
            let same = fs::read(&dest).ok() == fs::read(entry.path()).ok();
            if same {
                continue;
            }
            let free = free_name(to, &name, sep);
            fs::copy(entry.path(), to.join(&free)).map_err(err)?;
            renames.insert(name, free);
        } else {
            fs::copy(entry.path(), &dest).map_err(err)?;
        }
    }
    Ok(renames)
}

// "photo.png" → "photo 2.png" (or "photo-2.png"), "photo 3.png"… whichever is free.
fn free_name(dir: &Path, name: &str, sep: &str) -> String {
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    };
    (2..)
        .map(|n| format!("{stem}{sep}{n}{ext}"))
        .find(|candidate| !dir.join(candidate).exists())
        .unwrap_or_else(|| name.to_string())
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    fs::create_dir_all(to).map_err(err)?;
    for entry in fs::read_dir(from).map_err(err)? {
        let entry = entry.map_err(err)?;
        let dest = to.join(entry.file_name());
        if entry.file_type().map_err(err)?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else if !dest.exists() {
            fs::copy(entry.path(), &dest).map_err(err)?;
        }
    }
    Ok(())
}

// Combine one of the notebook's files: `mine` is the folder's own (Null when
// it has none), `theirs` the one being copied in. A file that can't be read
// as JSON is left exactly as it was.
fn merge_json(from: &Path, to: &Path, file: &str, combine: impl Fn(&Value, &Value) -> Value) -> Result<(), String> {
    let source = from.join(file);
    if !source.exists() {
        return Ok(());
    }
    let Ok(theirs) = serde_json::from_str::<Value>(&fs::read_to_string(&source).map_err(err)?) else {
        return Ok(());
    };
    let target = to.join(file);
    let mine = if target.exists() {
        match serde_json::from_str::<Value>(&fs::read_to_string(&target).map_err(err)?) {
            Ok(v) => v,
            Err(_) => return Ok(()),
        }
    } else {
        Value::Null
    };
    let merged = combine(&mine, &theirs);
    write_atomic(&target, &serde_json::to_string(&merged).map_err(err)?)
}

fn list(v: &Value) -> Vec<String> {
    v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default()
}

fn object(v: &Value) -> Map<String, Value> {
    v.as_object().cloned().unwrap_or_default()
}

// The first list, then whatever the second adds, each name once.
fn union(mut first: Vec<String>, second: Vec<String>) -> Vec<Value> {
    for name in second {
        if !first.iter().any(|n| n.eq_ignore_ascii_case(&name)) {
            first.push(name);
        }
    }
    first.into_iter().map(Value::String).collect()
}

fn find_key<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a String> {
    map.keys().find(|k| k.eq_ignore_ascii_case(key))
}

fn insert_missing(map: &mut Map<String, Value>, key: &str, value: Value) {
    if find_key(map, key).is_none() {
        map.insert(key.to_string(), value);
    }
}

// Tags with the same name become one tag; the others are added. Each note
// keeps its tags, and its priority unless the folder already set one.
fn merge_tags(mine: &Value, theirs: &Value, rename: &dyn Fn(&str) -> String) -> Value {
    let mut out = object(mine);
    let mut tags: Vec<Value> = out.get("Tags").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut ids: HashMap<String, String> = HashMap::new();
    for tag in theirs.get("Tags").and_then(Value::as_array).cloned().unwrap_or_default() {
        let (Some(id), Some(name)) = (tag.get("Id").and_then(Value::as_str), tag.get("Name").and_then(Value::as_str)) else { continue };
        let same_name = tags.iter().find(|t| t.get("Name").and_then(Value::as_str).is_some_and(|n| n.eq_ignore_ascii_case(name)));
        let same_id = tags.iter().any(|t| t.get("Id").and_then(Value::as_str) == Some(id));
        if let Some(existing) = same_name.and_then(|t| t.get("Id").and_then(Value::as_str)) {
            ids.insert(id.to_string(), existing.to_string());
        } else {
            ids.insert(id.to_string(), id.to_string());
            if !same_id {
                tags.push(tag.clone());
            }
        }
    }
    out.insert("Tags".into(), Value::Array(tags));

    let mut notes = out.get("Notes").and_then(Value::as_object).cloned().unwrap_or_default();
    for (name, tag_ids) in theirs.get("Notes").and_then(Value::as_object).cloned().unwrap_or_default() {
        let name = rename(&name);
        let add: Vec<String> = list(&tag_ids).into_iter().map(|id| ids.get(&id).cloned().unwrap_or(id)).collect();
        let key = find_key(&notes, &name).cloned().unwrap_or(name);
        let merged = union(list(notes.get(&key).unwrap_or(&Value::Null)), add);
        notes.insert(key, Value::Array(merged));
    }
    out.insert("Notes".into(), Value::Object(notes));

    let mut priorities = out.get("Priorities").and_then(Value::as_object).cloned().unwrap_or_default();
    for (name, p) in theirs.get("Priorities").and_then(Value::as_object).cloned().unwrap_or_default() {
        insert_missing(&mut priorities, &rename(&name), p);
    }
    out.insert("Priorities".into(), Value::Object(priorities));
    Value::Object(out)
}

// Pages stay inside their notebooks, unless the folder already filed that note.
fn merge_pages(mine: &Value, theirs: &Value, rename: &dyn Fn(&str) -> String) -> Value {
    let mut out = object(mine);
    let mut parents = out.get("Parents").and_then(Value::as_object).cloned().unwrap_or_default();
    for (child, parent) in theirs.get("Parents").and_then(Value::as_object).cloned().unwrap_or_default() {
        if let Some(parent) = parent.as_str() {
            insert_missing(&mut parents, &rename(&child), Value::String(rename(parent)));
        }
    }
    out.insert("Parents".into(), Value::Object(parents));
    let collapsed = union(
        list(out.get("Collapsed").unwrap_or(&Value::Null)),
        list(theirs.get("Collapsed").unwrap_or(&Value::Null)).into_iter().map(|n| rename(&n)).collect(),
    );
    out.insert("Collapsed".into(), Value::Array(collapsed));
    Value::Object(out)
}

// Every task from both lists, each once.
fn merge_tasks(mine: &Value, theirs: &Value) -> Value {
    let mut out = object(mine);
    let mut tasks: Vec<Value> = out.get("Tasks").and_then(Value::as_array).cloned().unwrap_or_default();
    for task in theirs.get("Tasks").and_then(Value::as_array).cloned().unwrap_or_default() {
        let id = task.get("Id").and_then(Value::as_str);
        if !tasks.iter().any(|t| t.get("Id").and_then(Value::as_str) == id) {
            tasks.push(task);
        }
    }
    out.insert("Tasks".into(), Value::Array(tasks));
    Value::Object(out)
}

// How a file name looks in a Markdown link, with spaces and the like escaped.
fn encode(name: &str) -> String {
    percent_encoding::utf8_percent_encode(name, percent_encoding::NON_ALPHANUMERIC)
        .to_string()
        .replace("%2E", ".")
        .replace("%2D", "-")
        .replace("%5F", "_")
}
