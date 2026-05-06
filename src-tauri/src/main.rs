#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod logging;
mod rl_tcp;
mod server;
mod session;
mod stats_api_adapter;
mod stats_config;

use std::{collections::VecDeque, sync::{Arc, atomic::{AtomicBool, Ordering}}};
use tauri::{
    Manager, WindowEvent,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{Mutex, RwLock, broadcast, mpsc};

use session::{SessionSnapshot, TrackerCmd};

const HTTP_PORT: u16 = 49410;
const DEFAULT_STATS_API_ADDR: &str = "127.0.0.1:49123";

// ── Tauri-managed state ───────────────────────────────────────────────────────

struct RssState {
    shared: session::SharedSnapshot,
    cmd_tx: mpsc::UnboundedSender<TrackerCmd>,
    data_dir: std::path::PathBuf,
    logs: Arc<Mutex<VecDeque<logging::LogEntry>>>,
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
async fn cmd_get_session(state: tauri::State<'_, RssState>) -> Result<SessionSnapshot, String> {
    Ok(state.shared.read().await.clone())
}

#[tauri::command]
async fn cmd_reset_session(state: tauri::State<'_, RssState>) -> Result<(), String> {
    state.cmd_tx.send(TrackerCmd::Reset).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_reset_history(state: tauri::State<'_, RssState>) -> Result<(), String> {
    state.cmd_tx.send(TrackerCmd::ResetHistory).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_set_tracked_player(state: tauri::State<'_, RssState>, id: String) -> Result<(), String> {
    state.cmd_tx.send(TrackerCmd::SetTrackedPlayer(id)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_set_allow_dual_pc(state: tauri::State<'_, RssState>, allow: bool) -> Result<(), String> {
    state.cmd_tx.send(TrackerCmd::SetAllowDualPc(allow)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_get_ips(state: tauri::State<'_, RssState>) -> Result<Vec<String>, String> {
    let allow_dual_pc = state.shared.read().await.allow_dual_pc;
    if !allow_dual_pc {
        return Ok(vec!["127.0.0.1".into()]);
    }
    let ips: Vec<String> = get_if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback() && i.addr.ip().is_ipv4())
        .map(|i| i.addr.ip().to_string())
        .collect();
    Ok(if ips.is_empty() { vec!["127.0.0.1".into()] } else { ips })
}

#[tauri::command]
async fn cmd_set_overlay_settings(
    state: tauri::State<'_, RssState>,
    settings: session::OverlaySettings,
) -> Result<(), String> {
    state
        .cmd_tx
        .send(TrackerCmd::SetOverlaySettings(settings))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_open_obs_text(state: tauri::State<'_, RssState>) -> Result<(), String> {
    let obs_dir = state.data_dir.join("obs-text");
    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&obs_dir).ok();
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer").arg(&obs_dir).spawn().ok();
        }
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn cmd_get_logs(state: tauri::State<'_, RssState>) -> Result<Vec<logging::LogEntry>, String> {
    Ok(state.logs.lock().await.iter().cloned().collect())
}

#[tauri::command]
async fn cmd_clear_logs(state: tauri::State<'_, RssState>) -> Result<(), String> {
    state.logs.lock().await.clear();
    Ok(())
}

#[tauri::command]
async fn cmd_get_stats_api_config(path: Option<String>) -> Result<stats_config::ConfigStatus, String> {
    tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(path.as_deref());
        stats_config::build_config_status(ini_path.as_ref(), error)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_enable_stats_api(
    path: Option<String>,
    packet_send_rate: Option<f64>,
    port: Option<u16>,
) -> Result<stats_config::ConfigStatus, String> {
    tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(path.as_deref());
        let Some(config_path) = ini_path else {
            return Err(error.unwrap_or_else(|| "Path not found".into()));
        };
        let parent = config_path.parent().unwrap_or(&config_path);
        if !parent.exists() {
            return Err("Rocket League TAGame/Config folder not found.".into());
        }
        let rate = packet_send_rate.unwrap_or(30.0);
        let p = port.unwrap_or(49123);
        let mut contents = std::fs::read_to_string(&config_path).unwrap_or_default();
        contents = stats_config::upsert_ini_value(&contents, "PacketSendRate", &rate.to_string());
        contents = stats_config::upsert_ini_value(&contents, "Port", &p.to_string());
        std::fs::write(&config_path, contents).map_err(|e| e.to_string())?;
        Ok(stats_config::build_config_status(Some(&config_path), None))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_disable_stats_api(path: Option<String>) -> Result<stats_config::ConfigStatus, String> {
    tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(path.as_deref());
        let Some(config_path) = ini_path else {
            return Err(error.unwrap_or_else(|| "Path not found".into()));
        };
        if !config_path.exists() {
            return Err("DefaultStatsAPI.ini not found.".into());
        }
        let mut contents =
            std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        contents = stats_config::upsert_ini_value(&contents, "PacketSendRate", "0");
        std::fs::write(&config_path, contents).map_err(|e| e.to_string())?;
        Ok(stats_config::build_config_status(Some(&config_path), None))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn load_tray_icon() -> tauri::image::Image<'static> {
    let bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(bytes).expect("valid PNG icon");
    let rgba = img.into_rgba8();
    let (w, h) = rgba.dimensions();
    tauri::image::Image::new_owned(rgba.into_raw(), w, h)
}

fn dist_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("dist")
    }
    #[cfg(not(debug_assertions))]
    {
        app.path()
            .resource_dir()
            .unwrap_or_else(|_| {
                std::env::current_exe()
                    .ok()
                    .and_then(|e| e.parent().map(|p| p.to_path_buf()))
                    .unwrap_or_default()
            })
            .join("dist")
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cmd_get_session,
            cmd_reset_session,
            cmd_reset_history,
            cmd_set_tracked_player,
            cmd_set_allow_dual_pc,
            cmd_get_ips,
            cmd_set_overlay_settings,
            cmd_open_obs_text,
            cmd_get_logs,
            cmd_clear_logs,
            cmd_get_stats_api_config,
            cmd_enable_stats_api,
            cmd_disable_stats_api,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // ── Persistent data directory ─────────────────────────────────
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            // ── Windows Firewall: ensure port 49410 is open for OBS/LAN ──
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let _ = std::process::Command::new("netsh")
                    .args([
                        "advfirewall", "firewall", "add", "rule",
                        "name=Rocket Session Stats",
                        "dir=in",
                        "action=allow",
                        "protocol=TCP",
                        &format!("localport={HTTP_PORT}"),
                        "profile=private,domain",
                    ])
                    .creation_flags(0x08000000)
                    .spawn();
            }

            let dist = dist_dir(&handle);

            // ── Log channel + buffer ──────────────────────────────────────
            let (log_tx, mut log_rx) = mpsc::unbounded_channel::<logging::LogEntry>();
            let logs: Arc<Mutex<VecDeque<logging::LogEntry>>> =
                Arc::new(Mutex::new(VecDeque::new()));
            {
                let logs = logs.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(entry) = log_rx.recv().await {
                        let mut buf = logs.lock().await;
                        if buf.len() >= server::LOG_BUFFER_MAX {
                            buf.pop_front();
                        }
                        buf.push_back(entry);
                    }
                });
            }

            // ── Session state + SSE channel ───────────────────────────────
            let shared = Arc::new(RwLock::new(SessionSnapshot::default()));
            let (sse_tx, _) = broadcast::channel::<String>(128);

            // ── Session tracker (processes RL events, persists state) ─────
            let cmd_tx = session::spawn_session_tracker(
                handle.clone(),
                shared.clone(),
                sse_tx.clone(),
                data_dir.clone(),
                log_tx.clone(),
            );

            // ── RL Stats API TCP client (connects on port 49123) ──────────
            let stats_api_addr = std::env::var("STATS_API_ADDR")
                .unwrap_or_else(|_| DEFAULT_STATS_API_ADDR.into());
            rl_tcp::spawn_rl_client(stats_api_addr, cmd_tx.clone(), log_tx.clone());

            // ── HTTP server (Axum on port 49410) ──────────────────────────
            let server_state = server::AppState {
                shared: shared.clone(),
                sse_tx: sse_tx.clone(),
                cmd_tx: cmd_tx.clone(),
                data_dir: data_dir.clone(),
                dist_dir: dist,
                logs: logs.clone(),
            };
            tauri::async_runtime::spawn(async move {
                server::serve(server_state, HTTP_PORT).await;
            });

            // ── Tauri-managed state for invoke commands ───────────────────
            app.manage(RssState {
                shared: shared.clone(),
                cmd_tx: cmd_tx.clone(),
                data_dir: data_dir.clone(),
                logs: logs.clone(),
            });

            // ── Also manage cmd_tx so tray menu can reach the tracker ─────
            app.manage(cmd_tx.clone());

            // ── System tray ───────────────────────────────────────────────
            let open = MenuItemBuilder::with_id("open", "Open Control Panel").build(app)?;
            let reset = MenuItemBuilder::with_id("reset", "Reset Session").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&open, &sep1, &reset, &sep2, &quit])
                .build()?;

            TrayIconBuilder::new()
                .icon(load_tray_icon())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Rocket Session Stats")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "reset" => {
                        if let Some(tx) =
                            app.try_state::<tokio::sync::mpsc::UnboundedSender<TrackerCmd>>()
                        {
                            let _ = tx.send(TrackerCmd::Reset);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::DoubleClick {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event({
            let tray_notice_shown = Arc::new(AtomicBool::new(false));
            move |window, event| {
                let should_notify = match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        let _ = window.hide();
                        api.prevent_close();
                        true
                    }
                    WindowEvent::Resized(_) => {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.hide();
                            true
                        } else {
                            false
                        }
                    }
                    _ => false,
                };

                if should_notify && !tray_notice_shown.swap(true, Ordering::Relaxed) {
                    let handle = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        handle
                            .dialog()
                            .message("Rocket Session Stats is still running in the system tray.\n\nDouble-click the tray icon to bring it back.")
                            .title("Still running")
                            .show(|_| {});
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error running Rocket Session Stats");
}
