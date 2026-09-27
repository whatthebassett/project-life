// The file layer. Project Life keeps everything local, in a Data folder beside
// the executable: settings, and tasks, events, habits and goals as JSON files.
// The frontend owns the JSON; this side only reads and writes it whole, so
// keys it doesn't know about are never lost. Notes are Markdown files in
// their own folder (notes.rs).
mod accounts;
mod attachments;
mod merge;
mod notes;
mod oauth_ids;
mod system;
mod tray;
mod update;
mod web;

use std::{
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// Data sits beside the executable so the app stays portable. During development
// the executable lives deep in target/, so use the project's own Data folder.
fn data_dir() -> PathBuf {
    if cfg!(debug_assertions) {
        return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("Data");
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("Data")))
        .unwrap_or_else(|| PathBuf::from("Data"))
}

fn ensure(dir: PathBuf) -> Result<PathBuf, String> {
    fs::create_dir_all(&dir).map_err(err)?;
    Ok(dir)
}

// Write to a sibling temp file and swap it in, so a crash mid-write never
// leaves a half-written file.
fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    let mut tmp: OsString = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    fs::write(&tmp, contents).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

#[tauri::command]
fn read_settings() -> Result<Option<String>, String> {
    let path = data_dir().join("settings.json");
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
fn write_settings(contents: String) -> Result<(), String> {
    write_atomic(&ensure(data_dir())?.join("settings.json"), &contents)
}

// The data files the frontend may read and write, by name. Nothing else in
// Data\ (or outside it) can be reached this way.
const DATA_FILES: [&str; 6] = ["tasks.json", "events.json", "habits.json", "goals.json", "accounts.json", "calendars.json"];

fn data_file(name: &str) -> Result<PathBuf, String> {
    if !DATA_FILES.contains(&name) {
        return Err(format!("{name} isn't one of Project Life's data files."));
    }
    Ok(data_dir().join(name))
}

#[tauri::command]
fn read_data(name: String) -> Result<Option<String>, String> {
    let path = data_file(&name)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(err)
}

#[tauri::command]
fn write_data(name: String, contents: String) -> Result<(), String> {
    let path = data_file(&name)?;
    ensure(data_dir())?;
    write_atomic(&path, &contents)
}

fn crash_reports_on() -> bool {
    fs::read_to_string(data_dir().join("settings.json"))
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(t.trim_start_matches('\u{feff}')).ok())
        .and_then(|v| v.get("SaveCrashReports").and_then(|b| b.as_bool()))
        .unwrap_or(false)
}

// The name to greet someone by until they set their own in Settings → Profile.
#[tauri::command]
fn default_name() -> String {
    std::env::var("USERNAME").unwrap_or_default()
}

// The window opens at 1440 x 1000, the size the screens were designed at, but
// never bigger than the screen it's on (less the taskbar).
fn fit_to_monitor(win: &WebviewWindow) {
    let (Ok(Some(monitor)), Ok(size)) = (win.current_monitor(), win.outer_size()) else {
        return;
    };
    if win.is_maximized().unwrap_or(false) {
        return;
    }
    let area = monitor.work_area();
    if size.width <= area.size.width && size.height <= area.size.height {
        return;
    }
    let width = size.width.min(area.size.width);
    let height = size.height.min(area.size.height);
    let _ = win.set_size(PhysicalSize::new(width, height));
    let _ = win.set_position(PhysicalPosition::new(
        area.position.x + ((area.size.width - width) / 2) as i32,
        area.position.y + ((area.size.height - height) / 2) as i32,
    ));
}

// Project Life runs from any folder on any Windows PC, but it can't carry
// WebView2 with it. Windows 11 and updated Windows 10 already have it; when
// it's missing, say so plainly instead of failing silently.
#[cfg(not(debug_assertions))]
fn prepare_portable() -> bool {
    use windows::{
        core::HSTRING,
        Win32::UI::WindowsAndMessaging::{MessageBoxW, IDYES, MB_ICONWARNING, MB_YESNO},
    };
    if tauri::webview_version().is_err() {
        let text = "Project Life needs Microsoft Edge WebView2, which isn't installed on this PC.\n\nWindows 11 includes it, and Windows 10 gets it with updates. Open the download page now?";
        let answer = unsafe { MessageBoxW(None, &HSTRING::from(text), &HSTRING::from("Project Life"), MB_YESNO | MB_ICONWARNING) };
        if answer == IDYES {
            let _ = std::process::Command::new("explorer").arg("https://go.microsoft.com/fwlink/p/?LinkId=2124703").spawn();
        }
        return false;
    }
    true
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(not(debug_assertions))]
    if !prepare_portable() {
        return;
    }
    notes::load_notes_folder();
    // Settings → Privacy → Save crash reports: a crash on this side goes into
    // Data\Logs too.
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if crash_reports_on() {
            system::log_crash(&format!("Rust: {info}"));
        }
        default_hook(info);
    }));
    tauri::Builder::default()
        // A second copy (started again while this one sits in the tray)
        // just brings this one forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| tray::show_main(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        // Settings → General → Open when Windows starts.
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        // Pictures in notes, as http://pl.localhost/assets/… (notes.rs).
        // Downloaded fonts too, as http://pl.localhost/__fonts/… (system.rs).
        .register_uri_scheme_protocol("pl", |_ctx, request| {
            let path = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8_lossy().into_owned();
            if let Some(rel) = path.strip_prefix("/__fonts/") {
                if let Some(bytes) = system::font_file(rel).and_then(|f| fs::read(f).ok()) {
                    return tauri::http::Response::builder()
                        .header("Content-Type", "font/ttf")
                        .header("Access-Control-Allow-Origin", "*")
                        .body(std::borrow::Cow::Owned(bytes))
                        .unwrap();
                }
            }
            notes::serve_note_file(&request)
        })
        // Remember size and position, but never the frame (the window draws its
        // own) or visibility (the page shows the window once its theme is on).
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::DECORATIONS
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                fit_to_monitor(&win);
            }
            tray::setup(app)?;
            update::clean_up();
            #[cfg(windows)]
            tray::register_toast_identity(app);
            Ok(())
        })
        // Closing the main window closes Tasks' own window too (it saves first,
        // in its close handler), so the app doesn't linger.
        .on_window_event(|win, event| {
            // Closing the main window hides it to the tray, unless that's off.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" && tray::keep_in_tray() {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
            if win.label() == "main" && matches!(event, WindowEvent::Destroyed) {
                if let Some(tasks) = win.app_handle().get_webview_window("tasks") {
                    let _ = tasks.close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            read_settings,
            write_settings,
            read_data,
            write_data,
            default_name,
            web::fetch_text,
            tray::quit_app,
            system::system_theme,
            system::os_build,
            system::running_apps,
            system::read_clipboard,
            web::fetch_calendar,
            web::fetch_data,
            system::current_location,
            system::secret_get,
            system::secret_set,
            system::list_system_fonts,
            system::list_app_fonts,
            system::download_google_font,
            system::remove_app_font,
            system::data_info,
            system::open_data_folder,
            system::open_backup_folder,
            system::export_everything,
            system::backup_now,
            system::clear_caches,
            system::delete_all_data,
            system::save_crash,
            system::import_checkpoint,
            accounts::accounts_available,
            accounts::account_connect,
            accounts::account_allow_meetings,
            accounts::account_disconnect,
            accounts::account_calendars,
            accounts::account_events,
            accounts::account_save_event,
            accounts::account_delete_event,
            accounts::account_meeting,
            update::update_check,
            update::update_download,
            update::update_install,
            update::update_ready,
            tray::show_toast,
            attachments::attach_file,
            attachments::open_attachment,
            attachments::remove_attachment,
            notes::list_notes,
            notes::read_note,
            notes::write_note,
            notes::create_note,
            notes::seed_notes,
            notes::rename_note,
            notes::recycle_note,
            notes::delete_note,
            notes::list_trash,
            notes::restore_note,
            notes::delete_trash,
            notes::import_notes,
            notes::export_note,
            notes::export_all,
            notes::open_notes_folder,
            notes::save_asset,
            notes::import_asset,
            notes::read_meta,
            notes::write_meta,
            notes::notes_folder_info,
            notes::set_notes_folder,
            notes::fetch_link_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
