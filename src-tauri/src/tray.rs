// The tray icon: closing the window can leave Project Life running there
// (Settings → General → Keep running in the tray, on by default), so
// reminders still fire. Clicking the icon brings the window back; its menu
// has Open and Quit. Reminders arrive as Windows toasts, a call's with a
// Join button. On a Mac the icon sits in the menu bar, where a click opens
// the menu; reminders are notifications, and the app gets a menu bar of its
// own (app_menu).
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

use crate::data_dir;
#[cfg(windows)]
use crate::err;

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
        .show_menu_on_left_click(cfg!(target_os = "macos"))
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if cfg!(target_os = "macos") {
                return;
            }
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    // The menu bar takes a one-color picture and tints it itself, light or dark.
    #[cfg(target_os = "macos")]
    {
        tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

// The Mac's menu bar: Project Life (About, Settings, Quit), Edit (so ⌘C, ⌘V
// and the rest work in the page) and Window. Quit goes through quit(), so
// anything unsaved is written first.
#[cfg(target_os = "macos")]
pub fn app_menu(app: &tauri::App) -> tauri::Result<()> {
    use tauri::menu::{PredefinedMenuItem as Item, Submenu};
    let settings = MenuItem::with_id(app, "app-settings", "Settings…", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "app-quit", "Quit Project Life", true, Some("Cmd+Q"))?;
    let about = Submenu::with_items(
        app,
        "Project Life",
        true,
        &[
            &Item::about(app, None, None)?,
            &Item::separator(app)?,
            &settings,
            &Item::separator(app)?,
            &Item::services(app, None)?,
            &Item::separator(app)?,
            &Item::hide(app, None)?,
            &Item::hide_others(app, None)?,
            &Item::show_all(app, None)?,
            &Item::separator(app)?,
            &quit_item,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&Item::undo(app, None)?, &Item::redo(app, None)?, &Item::separator(app)?, &Item::cut(app, None)?, &Item::copy(app, None)?, &Item::paste(app, None)?, &Item::select_all(app, None)?],
    )?;
    let window = Submenu::with_items(app, "Window", true, &[&Item::minimize(app, None)?, &Item::maximize(app, None)?, &Item::fullscreen(app, None)?, &Item::separator(app)?, &Item::close_window(app, None)?])?;
    app.set_menu(Menu::with_items(app, &[&about, &edit, &window])?)?;
    app.on_menu_event(|app, event| match event.id.as_ref() {
        "app-settings" => {
            show_main(app);
            let _ = app.emit_to("main", "app:settings", ());
        }
        "app-quit" => quit(app),
        _ => {}
    });
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
    // A Mac's notification: Join is its button, and clicking the rest of it
    // brings Project Life forward. Each waits on its own thread to be clicked.
    #[cfg(target_os = "macos")]
    {
        use mac_notification_sys::{MainButton, Notification, NotificationResponse, Sound};
        use tauri_plugin_opener::OpenerExt;
        // Notifications come from an app macOS knows: Project Life.app, or
        // Terminal for a development build, like the notification plugin does.
        static IDENTITY: std::sync::Once = std::sync::Once::new();
        IDENTITY.call_once(|| {
            let id = if cfg!(debug_assertions) { "com.apple.Terminal".to_string() } else { app.config().identifier.clone() };
            let _ = mac_notification_sys::set_application(&id);
        });
        let join = join_label.zip(join_url).filter(|(_, url)| url.starts_with("https://"));
        let handle = app.clone();
        std::thread::spawn(move || {
            let mut note = Notification::new();
            note.title(&title).message(&body).wait_for_click(true);
            // Settings → Notifications → Sound (and quiet hours, which send "none").
            match sound.as_deref() {
                Some("none") => {}
                Some("pop") => {
                    note.sound("Pop");
                }
                _ => {
                    note.sound(Sound::Default);
                }
            }
            if let Some((label, _)) = &join {
                note.main_button(MainButton::SingleAction(label));
            }
            match (note.send(), join) {
                (Ok(NotificationResponse::ActionButton(_)), Some((_, url))) => {
                    let _ = handle.opener().open_url(url, None::<&str>);
                }
                (Ok(NotificationResponse::Click), _) => show_main(&handle),
                _ => {}
            }
        });
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = (app, title, body, join_label, join_url, sound);
    }
    Ok(())
}
