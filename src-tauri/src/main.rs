#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::ManagerExt;

#[cfg(windows)]
const REMINDER_SECONDS: u64 = 45 * 60;
#[cfg(windows)]
const SNOOZE_SECONDS: u64 = 15 * 60;
#[cfg(windows)]
const TOAST_APP_ID: &str = "app.spira.desktop";

#[cfg(windows)]
#[repr(C)]
struct LastInputInfo {
    cb_size: u32,
    dw_time: u32,
}

#[cfg(windows)]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
}

#[cfg(windows)]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetTickCount() -> u32;
}

#[cfg(windows)]
fn user_is_active() -> bool {
    let mut info = LastInputInfo {
        cb_size: std::mem::size_of::<LastInputInfo>() as u32,
        dw_time: 0,
    };
    unsafe {
        GetLastInputInfo(&mut info) != 0 && GetTickCount().wrapping_sub(info.dw_time) < 60_000
    }
}

#[cfg(windows)]
fn register_toast_identity() {
    use winreg::{enums::HKEY_CURRENT_USER, RegKey};

    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(_) => return,
    };
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let Ok((key, _)) =
        hkcu.create_subkey(format!(r"SOFTWARE\Classes\AppUserModelId\{TOAST_APP_ID}"))
    else {
        return;
    };
    let _ = key.set_value("DisplayName", &"spira");
    let _ = key.set_value("IconUri", &executable.to_string_lossy().to_string());
}

#[cfg(windows)]
fn show_reminder_toast(app: tauri::AppHandle, remaining: std::sync::Arc<std::sync::Mutex<u64>>) {
    use tauri_winrt_notification::{Duration, Scenario, Toast};

    let _ = Toast::new(TOAST_APP_ID)
        .title("spira")
        .text1("È il momento di respirare.")
        .scenario(Scenario::Reminder)
        .duration(Duration::Long)
        .add_button("Avvia", "start")
        .add_button("Rimanda 15 min", "snooze")
        .add_button("Ignora", "ignore")
        .on_activated(move |action| {
            let action = action.unwrap_or_else(|| "ignore".to_string());
            if let Ok(mut seconds) = remaining.lock() {
                *seconds = if action == "snooze" {
                    SNOOZE_SECONDS
                } else {
                    REMINDER_SECONDS
                };
            }
            if action == "start" {
                show_main(&app);
                let _ = app.emit("reminder-action", "start");
            }
            Ok(())
        })
        .show();
}

#[cfg(windows)]
fn start_reminder(app: tauri::AppHandle) {
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    register_toast_identity();
    let remaining = Arc::new(Mutex::new(REMINDER_SECONDS));
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(10));
        if !user_is_active() {
            continue;
        }
        let due = {
            let Ok(mut seconds) = remaining.lock() else {
                continue;
            };
            *seconds = seconds.saturating_sub(10);
            if *seconds == 0 {
                *seconds = REMINDER_SECONDS;
                true
            } else {
                false
            }
        };
        if due {
            show_reminder_toast(app.clone(), Arc::clone(&remaining));
        }
    });
}

fn autostart_disabled_marker(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("autostart-disabled")
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--background"]),
        ))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle();
            let disabled_marker = autostart_disabled_marker(&handle);
            if !disabled_marker.exists() {
                let _ = handle.autolaunch().enable();
            }

            let show = MenuItem::with_id(app, "show", "Apri spira", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pausa / riprendi", true, None::<&str>)?;
            let restart = MenuItem::with_id(app, "restart", "Ricomincia", true, None::<&str>)?;
            let audio = MenuItem::with_id(app, "audio", "Audio", true, None::<&str>)?;
            let topmost = MenuItem::with_id(app, "topmost", "Sempre sopra", true, None::<&str>)?;
            let autostart =
                MenuItem::with_id(app, "autostart", "Avvio automatico", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Esci", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(
                app,
                &[
                    &show, &pause, &restart, &audio, &topmost, &autostart, &separator, &quit,
                ],
            )?;
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("icona spira mancante");
            TrayIconBuilder::with_id("spira-tray")
                .icon(icon)
                .tooltip("spira")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "autostart" => {
                        let marker = autostart_disabled_marker(app);
                        if marker.exists() {
                            let _ = std::fs::remove_file(marker);
                            let _ = app.autolaunch().enable();
                        } else {
                            let _ = app.autolaunch().disable();
                            if let Some(parent) = marker.parent() {
                                let _ = std::fs::create_dir_all(parent);
                            }
                            let _ = std::fs::write(marker, "disabled");
                        }
                    }
                    "quit" => app.exit(0),
                    action => {
                        let _ = app.emit("tray-action", action);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } = event
                    {
                        show_main(&tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(true);
                if std::env::args().any(|argument| argument == "--background") {
                    let _ = window.hide();
                }
            }
            #[cfg(windows)]
            start_reminder(handle.clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("errore durante spira");
}
