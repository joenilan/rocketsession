#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::Write,
    net::TcpStream,
    process::{Child, Command},
    sync::Mutex,
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent,
};

struct ServerProcess(Mutex<Option<Child>>);

fn spawn_server() -> Option<Child> {
    #[cfg(debug_assertions)]
    {
        let project_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .to_path_buf();
        Command::new("bun")
            .args(["src/server/index.mjs"])
            .current_dir(&project_root)
            .spawn()
            .map_err(|e| eprintln!("[server] Failed to spawn bun: {e}"))
            .ok()
    }
    #[cfg(not(debug_assertions))]
    {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();
        Command::new(exe_dir.join("rocket-session-stats-server.exe"))
            .spawn()
            .map_err(|e| eprintln!("[server] Failed to spawn server: {e}"))
            .ok()
    }
}

fn reset_session() {
    std::thread::spawn(|| {
        if let Ok(mut stream) = TcpStream::connect("127.0.0.1:49410") {
            let req = "POST /api/session/reset HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(req.as_bytes());
        }
    });
}

fn kill_server(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<ServerProcess>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

fn load_tray_icon() -> tauri::image::Image<'static> {
    let bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(bytes).expect("valid PNG icon");
    let rgba = img.into_rgba8();
    let (w, h) = rgba.dimensions();
    tauri::image::Image::new_owned(rgba.into_raw(), w, h)
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let server = spawn_server();
            app.manage(ServerProcess(Mutex::new(server)));

            let open  = MenuItemBuilder::with_id("open",  "Open Control Panel").build(app)?;
            let reset = MenuItemBuilder::with_id("reset", "Reset Session").build(app)?;
            let quit  = MenuItemBuilder::with_id("quit",  "Quit").build(app)?;
            let sep1  = PredefinedMenuItem::separator(app)?;
            let sep2  = PredefinedMenuItem::separator(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&open, &sep1, &reset, &sep2, &quit])
                .build()?;

            TrayIconBuilder::new()
                .icon(load_tray_icon())
                .menu(&menu)
                .tooltip("Rocket Session Stats")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "reset" => reset_session(),
                    "quit" => {
                        kill_server(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Rocket Session Stats");
}
