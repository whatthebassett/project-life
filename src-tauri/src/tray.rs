// The tray icon: closing the window can leave Project Life running there
// (Settings → General → Keep running in the tray, on by default), so
// reminders still fire. Clicking the icon brings the window back; its menu
// has Open and Quit. Reminders arrive as Windows toasts, a call's with a
// Join button.
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::{data_dir, err};

pub fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

// Settings → General → Keep running in the tray; on unless turned off.
pub fn keep_in_tray() -> bool {
    fs_settings()
        .and_then(|v| v.get("KeepInTray").and_then(|b| b.as_bool()))
        .unwrap_or(true)
}

fn fs_settings() -> Option<serde_json::Value> {
    let text = std::fs::read_to_string(data_dir().join("settings.json")).ok()?;
    serde_json::from_str(text.trim_start_matches('\u{feff}')).ok()
}

// A portable exe isn't installed, so Windows doesn't know its app id and
// drops its toasts. Tell Windows about it (name and icon, under the user's own
// registry keys) every start, so the icon's path follows the folder if it moves.
#[cfg(windows)]
pub fn register_toast_identity(app: &tauri::App) {
    use std::os::windows::process::CommandExt;
    let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));
    let dev = exe_dir.map(|d| d.ends_with("target\\debug") || d.ends_with("target\\release")).unwrap_or(true);
    if dev {
        return;
    }
    let icon = data_dir().join("app-icon.png");
    if !icon.exists() {
        let _ = std::fs::create_dir_all(data_dir());
        let _ = std::fs::write(&icon, include_bytes!("../icons/128x128@2x.png"));
    }
    let key = format!("HKCU\\Software\\Classes\\AppUserModelId\\{}", app.config().identifier);
    for (name, value) in [("DisplayName", "Project Life".to_string()), ("IconUri", icon.to_string_lossy().to_string())] {
        let _ = std::process::Command::new("reg")
            .args(["add", &key, "/v", name, "/t", "REG_SZ", "/d", &value, "/f"])
            .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
            .status();
    }
}

pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Project Life", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit_item])?;
    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Project Life")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

// Quit for real: the page saves anything still waiting and calls quit_app;
// if it can't answer, the app goes after a few seconds anyway.
pub fn quit(app: &AppHandle) {
    if app.emit_to("main", "app:quit", ()).is_err() {
        app.exit(0);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        handle.exit(0);
    });
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

// A reminder. With a join link, the toast gets a button ("Join Teams") that
// opens it; clicking the toast itself brings Project Life forward.
#[tauri::command]
pub fn show_toast(app: AppHandle, title: String, body: String, join_label: Option<String>, join_url: Option<String>, sound: Option<String>) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri_plugin_opener::OpenerExt;
        use tauri_winrt_notification::Toast;
        // Toasts need an app id Windows knows. Run from the build folder (as in
        // development) there isn't one yet, so borrow PowerShell's, like the
        // notification plugin does.
        let exe_dir = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf()));
        let dev = exe_dir.map(|d| d.ends_with("target/debug") || d.ends_with("target\\debug") || d.ends_with("target\\release")).unwrap_or(true);
        let id = if dev { Toast::POWERSHELL_APP_ID.to_string() } else { app.config().identifier.clone() };
        use tauri_winrt_notification::Sound;
        // Settings → Notifications → Sound (and quiet hours, which send "none").
        let audio = match sound.as_deref() {
            Some("none") => None,
            Some("pop") => Some(Sound::IM),
            _ => Some(Sound::Default),
        };
        let mut toast = Toast::new(&id).title(&title).text1(&body).sound(audio);
        if let (Some(label), Some(url)) = (join_label.as_deref(), join_url.as_deref()) {
            if url.starts_with("https://") {
                toast = toast.add_button(label, url);
            }
        }
        let handle = app.clone();
        toast = toast.on_activated(move |action| {
            match action {
                Some(url) if url.starts_with("https://") => {
                    let _ = handle.opener().open_url(url, None::<&str>);
                }
                _ => show_main(&handle),
            }
            Ok(())
        });
        toast.show().map_err(err)?;
    }
    #[cfg(not(windows))]
    {
        let _ = (app, title, body, join_label, join_url, sound);
    }
    Ok(())
}
