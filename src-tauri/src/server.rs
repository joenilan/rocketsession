use axum::{
    Router,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response, Sse, sse::Event},
    routing::{get, post},
};
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::VecDeque,
    convert::Infallible,
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio_stream::{wrappers::BroadcastStream, StreamExt};
use tower_http::cors::{Any, CorsLayer};

use crate::logging::LogEntry;
use crate::session::{SharedSnapshot, TrackerCmd};
use crate::stats_config;

pub const LOG_BUFFER_MAX: usize = 500;

#[derive(Clone)]
pub struct AppState {
    pub shared: SharedSnapshot,
    pub sse_tx: broadcast::Sender<String>,
    pub cmd_tx: mpsc::UnboundedSender<TrackerCmd>,
    pub data_dir: PathBuf,
    pub dist_dir: PathBuf,
    pub logs: Arc<Mutex<VecDeque<LogEntry>>>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn get_session(State(state): State<AppState>) -> impl IntoResponse {
    let snap = state.shared.read().await.clone();
    json_response(StatusCode::OK, &snap)
}

async fn get_events(State(state): State<AppState>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.sse_tx.subscribe();
    // Send the current snapshot immediately, then stream updates
    let initial = {
        let snap = state.shared.read().await.clone();
        serde_json::to_string(&snap).unwrap_or_default()
    };
    let stream = BroadcastStream::new(rx).filter_map(|r| r.ok());
    // Prepend the initial state
    let initial_stream = futures_util::stream::once(async move { initial });
    let merged = initial_stream.chain(stream);

    Sse::new(merged.map(|data| Ok(Event::default().data(data))))
        .keep_alive(
            axum::response::sse::KeepAlive::new()
                .interval(Duration::from_secs(15)),
        )
}

async fn get_ips(State(state): State<AppState>) -> impl IntoResponse {
    let allow_dual_pc = state.shared.read().await.allow_dual_pc;
    if !allow_dual_pc {
        return json_response(StatusCode::OK, &json!({ "ips": ["127.0.0.1"] }));
    }
    let ips: Vec<String> = get_if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback() && i.addr.ip().is_ipv4())
        .map(|i| i.addr.ip().to_string())
        .collect();
    let ips = if ips.is_empty() { vec!["127.0.0.1".into()] } else { ips };
    json_response(StatusCode::OK, &json!({ "ips": ips }))
}

async fn post_reset(State(state): State<AppState>) -> impl IntoResponse {
    let _ = state.cmd_tx.send(TrackerCmd::Reset);
    let snap = state.shared.read().await.clone();
    json_response(StatusCode::OK, &snap)
}

#[derive(Deserialize)]
struct TrackedPlayerBody {
    id: String,
}

async fn post_tracked_player(
    State(state): State<AppState>,
    axum::Json(body): axum::Json<TrackedPlayerBody>,
) -> impl IntoResponse {
    let exists = state
        .shared
        .read()
        .await
        .current_match
        .players
        .iter()
        .any(|p| p.id == body.id);
    if !exists {
        return json_response(
            StatusCode::NOT_FOUND,
            &json!({ "error": "Player not found in current match." }),
        );
    }
    let _ = state.cmd_tx.send(TrackerCmd::SetTrackedPlayer(body.id));
    let snap = state.shared.read().await.clone();
    json_response(StatusCode::OK, &snap)
}

#[derive(Deserialize)]
struct NetworkAccessBody {
    #[serde(rename = "allowDualPC")]
    allow_dual_pc: bool,
}

async fn post_network_access(
    State(state): State<AppState>,
    axum::Json(body): axum::Json<NetworkAccessBody>,
) -> impl IntoResponse {
    let _ = state.cmd_tx.send(TrackerCmd::SetAllowDualPc(body.allow_dual_pc));
    // Give the tracker a moment to update shared state before reading it back
    tokio::time::sleep(Duration::from_millis(20)).await;
    let snap = state.shared.read().await.clone();
    json_response(StatusCode::OK, &snap)
}

#[derive(Deserialize)]
struct StatsApiConfigQuery {
    path: Option<String>,
}

async fn get_stats_api_config(
    Query(q): Query<StatsApiConfigQuery>,
) -> impl IntoResponse {
    let status = tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(q.path.as_deref());
        stats_config::build_config_status(ini_path.as_ref(), error)
    })
    .await
    .unwrap_or_else(|_| stats_config::build_config_status(None, Some("Internal error".into())));
    json_response(StatusCode::OK, &status)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StatsApiEnableBody {
    path: Option<String>,
    packet_send_rate: Option<f64>,
    port: Option<u16>,
}

async fn post_stats_api_enable(
    axum::Json(body): axum::Json<StatsApiEnableBody>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(body.path.as_deref());
        let Some(config_path) = ini_path else {
            return Err(error.unwrap_or_else(|| "Path not found".into()));
        };
        let parent = config_path.parent().unwrap_or(&config_path);
        if !parent.exists() {
            return Err("Rocket League TAGame\\Config folder not found.".into());
        }
        let rate = body.packet_send_rate.unwrap_or(30.0);
        let port = body.port.unwrap_or(49123);
        let mut contents = std::fs::read_to_string(&config_path).unwrap_or_default();
        contents = stats_config::upsert_ini_value(&contents, "PacketSendRate", &rate.to_string());
        contents = stats_config::upsert_ini_value(&contents, "Port", &port.to_string());
        std::fs::write(&config_path, contents).map_err(|e| e.to_string())?;
        Ok(stats_config::build_config_status(Some(&config_path), None))
    })
    .await;

    match result {
        Ok(Ok(status)) => json_response(StatusCode::OK, &status),
        Ok(Err(msg)) => json_response(StatusCode::BAD_REQUEST, &json!({ "error": msg })),
        Err(_) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "error": "Internal error" }),
        ),
    }
}

#[derive(Deserialize)]
struct StatsApiDisableBody {
    path: Option<String>,
}

async fn post_stats_api_disable(
    axum::Json(body): axum::Json<StatsApiDisableBody>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let (ini_path, error) = stats_config::resolve_ini_path(body.path.as_deref());
        let Some(config_path) = ini_path else {
            return Err(error.unwrap_or_else(|| "Path not found".into()));
        };
        if !config_path.exists() {
            return Err("DefaultStatsAPI.ini not found.".into());
        }
        let mut contents = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        contents = stats_config::upsert_ini_value(&contents, "PacketSendRate", "0");
        std::fs::write(&config_path, contents).map_err(|e| e.to_string())?;
        Ok(stats_config::build_config_status(Some(&config_path), None))
    })
    .await;

    match result {
        Ok(Ok(status)) => json_response(StatusCode::OK, &status),
        Ok(Err(msg)) => json_response(StatusCode::BAD_REQUEST, &json!({ "error": msg })),
        Err(_) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "error": "Internal error" }),
        ),
    }
}

async fn get_logs(State(state): State<AppState>) -> impl IntoResponse {
    let lock = state.logs.lock().await;
    let entries: Vec<&LogEntry> = lock.iter().collect();
    json_response(StatusCode::OK, &entries)
}

async fn post_clear_logs(State(state): State<AppState>) -> impl IntoResponse {
    state.logs.lock().await.clear();
    json_response(StatusCode::OK, &json!({ "ok": true }))
}

async fn post_overlay_settings(
    State(state): State<AppState>,
    axum::Json(body): axum::Json<crate::session::OverlaySettings>,
) -> impl IntoResponse {
    let _ = state.cmd_tx.send(TrackerCmd::SetOverlaySettings(body));
    tokio::time::sleep(Duration::from_millis(20)).await;
    let snap = state.shared.read().await.clone();
    json_response(StatusCode::OK, &snap)
}

async fn post_open_obs_text(State(state): State<AppState>) -> impl IntoResponse {
    let obs_dir = state.data_dir.join("obs-text");
    let result = tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&obs_dir)?;
        #[cfg(target_os = "windows")]
        std::process::Command::new("explorer").arg(&obs_dir).spawn()?;
        #[cfg(target_os = "macos")]
        std::process::Command::new("open").arg(&obs_dir).spawn()?;
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        std::process::Command::new("xdg-open").arg(&obs_dir).spawn()?;
        Ok::<_, std::io::Error>(())
    })
    .await;

    match result {
        Ok(Ok(())) => json_response(StatusCode::OK, &json!({ "ok": true })),
        Ok(Err(e)) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "error": e.to_string() }),
        ),
        Err(_) => json_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            &json!({ "error": "Internal error" }),
        ),
    }
}

// ── Static file serving ───────────────────────────────────────────────────────

async fn serve_static(
    State(state): State<AppState>,
    uri: axum::http::Uri,
) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let file_path = if path.is_empty() || path == "index.html" {
        state.dist_dir.join("index.html")
    } else {
        state.dist_dir.join(path)
    };

    match tokio::fs::read(&file_path).await {
        Ok(bytes) => {
            let mime = mime_for_path(&file_path);
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(mime));
            (StatusCode::OK, headers, bytes).into_response()
        }
        Err(_) => {
            // SPA fallback: serve index.html for unmatched paths
            match tokio::fs::read(state.dist_dir.join("index.html")).await {
                Ok(bytes) => {
                    let mut headers = HeaderMap::new();
                    headers.insert(
                        header::CONTENT_TYPE,
                        HeaderValue::from_static("text/html; charset=utf-8"),
                    );
                    (StatusCode::OK, headers, bytes).into_response()
                }
                Err(_) => StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}

fn mime_for_path(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") | Some("mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("json") => "application/json; charset=utf-8",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        _ => "application/octet-stream",
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn json_response(status: StatusCode, body: &impl Serialize) -> Response {
    let json = serde_json::to_string(body).unwrap_or_else(|_| "{}".into());
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("application/json; charset=utf-8"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"),
    );
    (status, headers, json).into_response()
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn build_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/session", get(get_session))
        .route("/api/events", get(get_events))
        .route("/api/ips", get(get_ips))
        .route("/api/session/reset", post(post_reset))
        .route("/api/tracked-player", post(post_tracked_player))
        .route("/api/network-access", post(post_network_access))
        .route("/api/stats-api-config", get(get_stats_api_config))
        .route("/api/stats-api-config/enable", post(post_stats_api_enable))
        .route("/api/stats-api-config/disable", post(post_stats_api_disable))
        .route("/api/overlay-settings", post(post_overlay_settings))
        .route("/api/open-obs-text", post(post_open_obs_text))
        .route("/api/logs", get(get_logs))
        .route("/api/logs/clear", post(post_clear_logs))
        .fallback(serve_static)
        .with_state(state)
        .layer(cors)
}

// ── Spawn ─────────────────────────────────────────────────────────────────────

pub async fn serve(state: AppState, port: u16) {
    let bind_addr: SocketAddr = format!("0.0.0.0:{port}").parse().unwrap();

    let router = build_router(state);
    let listener = match tokio::net::TcpListener::bind(bind_addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[server] Failed to bind {bind_addr}: {e}");
            return;
        }
    };
    println!("[server] Listening on http://{bind_addr}");
    if let Err(e) = axum::serve(listener, router).await
    {
        eprintln!("[server] Error: {e}");
    }
}
