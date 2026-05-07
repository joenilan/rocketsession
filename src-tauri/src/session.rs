use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};
use tauri::Emitter;
use tokio::sync::{broadcast, mpsc, RwLock};

const HISTORY_MAX: usize = 25;

fn iso_now() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamState {
    pub name: String,
    pub score: u32,
    pub color: String,
}
impl Default for TeamState {
    fn default() -> Self {
        Self {
            name: String::new(),
            score: 0,
            color: "#ffffff".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionPlayer {
    pub id: String,
    pub name: String,
    pub team: u8,
    pub score: u32,
    pub goals: u32,
    pub assists: u32,
    pub saves: u32,
    pub shots: u32,
    pub demos: u32,
    pub touches: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentMatch {
    pub active: bool,
    pub context: String,
    pub time_seconds: f64,
    #[serde(rename = "isOT")]
    pub is_ot: bool,
    pub teams: [TeamState; 2],
    pub players: Vec<SessionPlayer>,
    pub tracked_team: Option<u8>,
}
impl Default for CurrentMatch {
    fn default() -> Self {
        Self {
            active: false,
            context: "unknown".to_string(),
            time_seconds: 0.0,
            is_ot: false,
            teams: [
                TeamState {
                    name: "Blue".to_string(),
                    score: 0,
                    color: "#0074ff".to_string(),
                },
                TeamState {
                    name: "Orange".to_string(),
                    score: 0,
                    color: "#ff8b00".to_string(),
                },
            ],
            players: vec![],
            tracked_team: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SessionTotals {
    pub games: u32,
    pub wins: u32,
    pub losses: u32,
    pub unknown_results: u32,
    pub streak: i32,
    pub goals: u32,
    pub assists: u32,
    pub saves: u32,
    pub shots: u32,
    pub demos: u32,
    pub touches: u32,
    pub ball_hits: u32,
    pub strongest_hit: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedPlayer {
    pub id: String,
    pub name: String,
    pub team: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlaySettings {
    pub x: f64,
    pub y: f64,
    pub scale: f64,
    pub opacity: f64,
}
impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            x: 50.0,
            y: 50.0,
            scale: 100.0,
            opacity: 90.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextOverlayElement {
    pub id: String,
    pub label: String,
    pub stat: String,
    pub show_label: bool,
    pub show_value: bool,
    pub x: f64,
    pub y: f64,
    pub font_family: String,
    pub font_size: f64,
    pub font_weight: u16,
    pub color: String,
    pub align: String,
    pub opacity: f64,
}

impl Default for TextOverlayElement {
    fn default() -> Self {
        Self {
            id: "wins".to_string(),
            label: "Wins:".to_string(),
            stat: "wins".to_string(),
            show_label: true,
            show_value: true,
            x: 50.0,
            y: 50.0,
            font_family: "Rajdhani, Inter, sans-serif".to_string(),
            font_size: 72.0,
            font_weight: 700,
            color: "#ffffff".to_string(),
            align: "center".to_string(),
            opacity: 100.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastMatch {
    pub result: String,
    pub winner_team: Option<u8>,
    pub tracked_team: Option<u8>,
    pub ended_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoricalMatch {
    pub id: String,
    pub ended_at: String,
    pub result: String,
    pub teams: [TeamState; 2],
    pub players: Vec<SessionPlayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub app: String,
    pub connection: String,
    pub connection_message: String,
    pub stats_api_address: String,
    #[serde(rename = "allowDualPC")]
    pub allow_dual_pc: bool,
    pub last_event_at: Option<String>,
    pub tracked_player: Option<TrackedPlayer>,
    pub current_match: CurrentMatch,
    pub totals: SessionTotals,
    pub last_match: Option<LastMatch>,
    pub match_history: Vec<HistoricalMatch>,
    pub raw_event_counts: HashMap<String, u32>,
    pub overlay_settings: OverlaySettings,
    pub overlay_mode: String,
    pub text_overlay_elements: Vec<TextOverlayElement>,
}
impl Default for SessionSnapshot {
    fn default() -> Self {
        Self {
            app: "rocket-session-stats".to_string(),
            connection: "connecting".to_string(),
            connection_message: "Connecting to Rocket League Stats API...".to_string(),
            stats_api_address: "127.0.0.1:49123".to_string(),
            allow_dual_pc: false,
            last_event_at: None,
            tracked_player: None,
            current_match: CurrentMatch::default(),
            totals: SessionTotals::default(),
            last_match: None,
            match_history: vec![],
            raw_event_counts: HashMap::new(),
            overlay_settings: OverlaySettings::default(),
            overlay_mode: "stock".to_string(),
            text_overlay_elements: vec![TextOverlayElement::default()],
        }
    }
}

pub type SharedSnapshot = Arc<RwLock<SessionSnapshot>>;

// ── Persistence ───────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Default)]
struct PersistedSession {
    totals: SessionTotals,
    tracked_player: Option<TrackedPlayer>,
    last_match: Option<LastMatch>,
    allow_dual_pc: bool,
    match_history: Vec<HistoricalMatch>,
    overlay_settings: OverlaySettings,
    overlay_mode: String,
    text_overlay_elements: Vec<TextOverlayElement>,
}

fn do_persist(data_dir: &PathBuf, snap: &SessionSnapshot) {
    let p = PersistedSession {
        totals: snap.totals.clone(),
        tracked_player: snap.tracked_player.clone(),
        last_match: snap.last_match.clone(),
        allow_dual_pc: snap.allow_dual_pc,
        match_history: snap.match_history.clone(),
        overlay_settings: snap.overlay_settings.clone(),
        overlay_mode: snap.overlay_mode.clone(),
        text_overlay_elements: snap.text_overlay_elements.clone(),
    };
    if let Ok(json) = serde_json::to_string_pretty(&p) {
        let _ = std::fs::write(data_dir.join("session-data.json"), json);
    }
}

fn write_obs_files(data_dir: &PathBuf, snap: &SessionSnapshot) {
    let obs_dir = data_dir.join("obs-text");
    if std::fs::create_dir_all(&obs_dir).is_err() {
        return;
    }
    let streak = match snap.totals.streak {
        s if s > 0 => format!("W{s}"),
        s if s < 0 => format!("L{}", s.unsigned_abs()),
        _ => "0".to_string(),
    };
    let player_name = snap
        .tracked_player
        .as_ref()
        .map(|p| p.name.as_str())
        .unwrap_or("None")
        .to_string();
    let files: &[(&str, String)] = &[
        ("wins.txt", snap.totals.wins.to_string()),
        ("losses.txt", snap.totals.losses.to_string()),
        ("games.txt", snap.totals.games.to_string()),
        ("streak.txt", streak),
        ("goals.txt", snap.totals.goals.to_string()),
        ("assists.txt", snap.totals.assists.to_string()),
        ("saves.txt", snap.totals.saves.to_string()),
        ("shots.txt", snap.totals.shots.to_string()),
        ("demos.txt", snap.totals.demos.to_string()),
        ("ball_hits.txt", snap.totals.ball_hits.to_string()),
        (
            "strongest_hit.txt",
            snap.totals.strongest_hit.round().to_string(),
        ),
        ("tracked_player.txt", player_name),
        ("connection.txt", snap.connection.clone()),
    ];
    for (file, content) in files {
        let _ = std::fs::write(obs_dir.join(file), content);
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

pub enum TrackerCmd {
    Reset,
    ResetHistory,
    SetTrackedPlayer(String),
    SetAllowDualPc(bool),
    SetOverlaySettings(OverlaySettings),
    SetOverlayConfig {
        overlay_mode: Option<String>,
        text_overlay_elements: Option<Vec<TextOverlayElement>>,
    },
    SetConnection {
        connection: String,
        message: String,
    },
    RawEvent(String),
}

// ── Internal tracker ──────────────────────────────────────────────────────────

struct Tracker {
    snap: SessionSnapshot,
    history: VecDeque<HistoricalMatch>,
    last_auto_skip_at: Option<Instant>,
    replay_active: bool,
}

impl Tracker {
    fn load(data_dir: &PathBuf) -> Self {
        let p: PersistedSession = std::fs::read(data_dir.join("session-data.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let history = VecDeque::from(p.match_history.clone());
        let overlay_mode = if p.overlay_mode == "textCanvas" {
            "textCanvas".to_string()
        } else {
            "stock".to_string()
        };
        let text_overlay_elements = if p.text_overlay_elements.is_empty() {
            vec![TextOverlayElement::default()]
        } else {
            p.text_overlay_elements
        };
        let snap = SessionSnapshot {
            totals: p.totals,
            tracked_player: p.tracked_player,
            last_match: p.last_match,
            allow_dual_pc: p.allow_dual_pc,
            match_history: p.match_history,
            overlay_settings: p.overlay_settings,
            overlay_mode,
            text_overlay_elements,
            ..SessionSnapshot::default()
        };
        Self {
            snap,
            history,
            last_auto_skip_at: None,
            replay_active: false,
        }
    }

    fn sync_history(&mut self) {
        self.snap.match_history = self.history.iter().cloned().collect();
    }

    fn on_update_state(&mut self, data: &Value) -> bool {
        self.snap.current_match.active = true;
        let mut replay_started = false;

        if let Some(game) = data.get("game") {
            let is_replay = game
                .get("isReplay")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || game
                    .get("status")
                    .and_then(Value::as_str)
                    .is_some_and(|status| status == "replay");
            replay_started = is_replay && !self.replay_active;
            self.replay_active = is_replay;

            self.snap.current_match.time_seconds = game
                .get("time_seconds")
                .and_then(Value::as_f64)
                .unwrap_or(0.0);
            self.snap.current_match.is_ot =
                game.get("isOT").and_then(Value::as_bool).unwrap_or(false);

            if let Some(teams) = game.get("teams").and_then(Value::as_array) {
                for (i, team) in teams.iter().enumerate().take(2) {
                    if let Some(t) = self.snap.current_match.teams.get_mut(i) {
                        if let Some(n) = team.get("name").and_then(Value::as_str) {
                            t.name = n.to_string();
                        }
                        if let Some(s) = team.get("score").and_then(Value::as_u64) {
                            t.score = s as u32;
                        }
                        if let Some(c) = team.get("color_primary").and_then(Value::as_str) {
                            t.color = if c.starts_with('#') {
                                c.to_string()
                            } else {
                                format!("#{c}")
                            };
                        }
                    }
                }
            }

            // Auto-track via the Stats API "target" field (local player)
            if self.snap.tracked_player.is_none() {
                if let Some(tid) = game
                    .get("target")
                    .and_then(Value::as_str)
                    .filter(|s| !s.is_empty())
                {
                    if let Some(p) = data
                        .get("players")
                        .and_then(Value::as_object)
                        .and_then(|m| m.get(tid))
                    {
                        self.snap.tracked_player = Some(TrackedPlayer {
                            id: tid.to_string(),
                            name: p
                                .get("name")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            team: p.get("team").and_then(Value::as_u64).unwrap_or(0) as u8,
                        });
                    }
                }
            }
        }

        if let Some(players_obj) = data.get("players").and_then(Value::as_object) {
            self.snap.current_match.players = players_obj
                .values()
                .filter_map(|p| {
                    let team = p.get("team").and_then(Value::as_u64)? as u8;
                    if team > 1 {
                        return None;
                    }
                    Some(SessionPlayer {
                        id: p.get("id").and_then(Value::as_str)?.to_string(),
                        name: p
                            .get("name")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        team,
                        score: p.get("score").and_then(Value::as_u64).unwrap_or(0) as u32,
                        goals: p.get("goals").and_then(Value::as_u64).unwrap_or(0) as u32,
                        assists: p.get("assists").and_then(Value::as_u64).unwrap_or(0) as u32,
                        saves: p.get("saves").and_then(Value::as_u64).unwrap_or(0) as u32,
                        shots: p.get("shots").and_then(Value::as_u64).unwrap_or(0) as u32,
                        demos: p.get("demos").and_then(Value::as_u64).unwrap_or(0) as u32,
                        touches: p.get("touches").and_then(Value::as_u64).unwrap_or(0) as u32,
                        boost: p.get("boost").and_then(Value::as_f64),
                    })
                })
                .collect();

            // Fallback: single player visible = freeplay, auto-track
            if self.snap.tracked_player.is_none() && self.snap.current_match.players.len() == 1 {
                if let Some(p) = self.snap.current_match.players.first() {
                    self.snap.tracked_player = Some(TrackedPlayer {
                        id: p.id.clone(),
                        name: p.name.clone(),
                        team: p.team,
                    });
                }
            }
        }

        // Keep tracked_team in sync
        if let Some(ref tp) = self.snap.tracked_player.clone() {
            if let Some(live) = self
                .snap
                .current_match
                .players
                .iter()
                .find(|p| p.id == tp.id)
            {
                self.snap.current_match.tracked_team = Some(live.team);
                if let Some(ref mut t) = self.snap.tracked_player {
                    t.team = live.team;
                }
            }
        }

        replay_started
    }

    fn on_match_created(&mut self, data: &Value) {
        let has_guid = data
            .get("MatchGuid")
            .or_else(|| data.get("MatchGUID"))
            .and_then(Value::as_str)
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        self.snap.current_match = CurrentMatch {
            active: true,
            context: if has_guid { "match" } else { "freeplay" }.to_string(),
            teams: self.snap.current_match.teams.clone(),
            ..CurrentMatch::default()
        };
    }

    fn on_match_ended(&mut self, data: &Value) {
        let winner_team = data
            .get("winner_team_num")
            .and_then(Value::as_i64)
            .filter(|&n| n >= 0)
            .map(|n| n as u8);
        let tracked_team = self
            .snap
            .current_match
            .tracked_team
            .or_else(|| self.snap.tracked_player.as_ref().map(|p| p.team));

        let result = match (winner_team, tracked_team) {
            (Some(w), Some(t)) if w == t => "win",
            (Some(_), Some(_)) => "loss",
            _ => "unknown",
        };

        self.snap.totals.games += 1;
        match result {
            "win" => {
                self.snap.totals.wins += 1;
                self.snap.totals.streak = self.snap.totals.streak.max(0) + 1;
            }
            "loss" => {
                self.snap.totals.losses += 1;
                self.snap.totals.streak = self.snap.totals.streak.min(0) - 1;
            }
            _ => {
                self.snap.totals.unknown_results += 1;
            }
        }

        if let Some(ref tp) = self.snap.tracked_player {
            if let Some(p) = self
                .snap
                .current_match
                .players
                .iter()
                .find(|p| p.id == tp.id)
            {
                self.snap.totals.goals += p.goals;
                self.snap.totals.assists += p.assists;
                self.snap.totals.saves += p.saves;
                self.snap.totals.shots += p.shots;
                self.snap.totals.demos += p.demos;
                self.snap.totals.touches += p.touches;
            }
        }

        let now = iso_now();
        self.snap.last_match = Some(LastMatch {
            result: result.to_string(),
            winner_team,
            tracked_team,
            ended_at: now.clone(),
        });
        self.history.push_front(HistoricalMatch {
            id: now.clone(),
            ended_at: now,
            result: result.to_string(),
            teams: self.snap.current_match.teams.clone(),
            players: self.snap.current_match.players.clone(),
        });
        while self.history.len() > HISTORY_MAX {
            self.history.pop_back();
        }
        self.sync_history();
    }

    fn on_match_destroyed(&mut self) {
        self.snap.current_match.active = false;
        self.snap.current_match.players.clear();
        self.snap.current_match.context = "unknown".to_string();
        self.snap.current_match.tracked_team = None;
        self.replay_active = false;
    }

    fn on_ball_hit(&mut self, data: &Value) {
        self.snap.totals.ball_hits += 1;
        if let Some(speed) = data
            .get("Ball")
            .and_then(|b| b.get("PostHitSpeed"))
            .and_then(Value::as_f64)
        {
            if speed > self.snap.totals.strongest_hit {
                self.snap.totals.strongest_hit = speed;
            }
        }
    }

    fn should_auto_skip_replay(&mut self) -> bool {
        let now = Instant::now();
        if self
            .last_auto_skip_at
            .is_some_and(|last| now.duration_since(last) < Duration::from_secs(5))
        {
            return false;
        }
        self.last_auto_skip_at = Some(now);
        true
    }
}

fn queue_auto_skip_replay(
    tracker: &mut Tracker,
    data_dir: &PathBuf,
    log_tx: &mpsc::UnboundedSender<crate::logging::LogEntry>,
    source: &str,
) {
    let settings = crate::settings::load(data_dir);
    let _ = log_tx.send(crate::logging::LogEntry::info(
        "auto_skip",
        format!("Replay start detected from {source}"),
    ));
    if !settings.auto_skip_replays {
        let _ = log_tx.send(crate::logging::LogEntry::debug(
            "auto_skip",
            "Replay auto-skip is disabled",
        ));
        return;
    }
    if !tracker.should_auto_skip_replay() {
        let _ = log_tx.send(crate::logging::LogEntry::debug(
            "auto_skip",
            "Replay auto-skip suppressed by cooldown",
        ));
        return;
    }

    let delay = settings.auto_skip_delay_ms.clamp(100, 5000);
    let log = log_tx.clone();
    let _ = log_tx.send(crate::logging::LogEntry::info(
        "auto_skip",
        format!("Replay skip queued after {delay}ms"),
    ));
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(delay)).await;
        match crate::auto_skip::send_replay_skip_key() {
            Ok(()) => {
                let _ = log.send(crate::logging::LogEntry::info(
                    "auto_skip",
                    format!("Sent replay skip right-click after {delay}ms"),
                ));
            }
            Err(err) => {
                let _ = log.send(crate::logging::LogEntry::warn(
                    "auto_skip",
                    format!("Replay skip right-click failed: {err}"),
                ));
            }
        }
    });
}

// ── Public spawn ──────────────────────────────────────────────────────────────

pub fn spawn_session_tracker(
    app: tauri::AppHandle,
    shared: SharedSnapshot,
    sse_tx: broadcast::Sender<String>,
    data_dir: PathBuf,
    log_tx: mpsc::UnboundedSender<crate::logging::LogEntry>,
) -> mpsc::UnboundedSender<TrackerCmd> {
    let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<TrackerCmd>();

    tauri::async_runtime::spawn(async move {
        let _ = log_tx.send(crate::logging::LogEntry::info(
            "session",
            "Session tracker started",
        ));
        let mut tracker = Tracker::load(&data_dir);

        // Emit initial state
        {
            let mut w = shared.write().await;
            *w = tracker.snap.clone();
            if let Ok(json) = serde_json::to_string(&*w) {
                let _ = sse_tx.send(json);
            }
            app.emit("session:state", &tracker.snap).ok();
        }

        while let Some(cmd) = cmd_rx.recv().await {
            let mut needs_persist = false;

            match cmd {
                TrackerCmd::Reset => {
                    let _ = log_tx.send(crate::logging::LogEntry::info(
                        "session",
                        "Session stats reset",
                    ));
                    tracker.snap.totals = SessionTotals::default();
                    tracker.snap.last_match = None;
                    tracker.snap.raw_event_counts.clear();
                    needs_persist = true;
                }
                TrackerCmd::ResetHistory => {
                    let _ = log_tx.send(crate::logging::LogEntry::info(
                        "session",
                        "Match history cleared",
                    ));
                    tracker.history.clear();
                    tracker.sync_history();
                    needs_persist = true;
                }
                TrackerCmd::SetTrackedPlayer(id) => {
                    if let Some(p) = tracker
                        .snap
                        .current_match
                        .players
                        .iter()
                        .find(|p| p.id == id)
                        .cloned()
                    {
                        tracker.snap.tracked_player = Some(TrackedPlayer {
                            id: p.id,
                            name: p.name,
                            team: p.team,
                        });
                        tracker.snap.current_match.tracked_team = Some(p.team);
                        needs_persist = true;
                    }
                }
                TrackerCmd::SetAllowDualPc(val) => {
                    tracker.snap.allow_dual_pc = val;
                    needs_persist = true;
                }
                TrackerCmd::SetOverlaySettings(s) => {
                    tracker.snap.overlay_settings = s;
                    needs_persist = true;
                }
                TrackerCmd::SetOverlayConfig {
                    overlay_mode,
                    text_overlay_elements,
                } => {
                    if let Some(mode) = overlay_mode {
                        tracker.snap.overlay_mode = if mode == "textCanvas" {
                            "textCanvas".to_string()
                        } else {
                            "stock".to_string()
                        };
                    }
                    if let Some(elements) = text_overlay_elements {
                        tracker.snap.text_overlay_elements = if elements.is_empty() {
                            vec![TextOverlayElement::default()]
                        } else {
                            elements
                        };
                    }
                    needs_persist = true;
                }
                TrackerCmd::SetConnection {
                    connection,
                    message,
                } => {
                    let level = if connection == "connected" {
                        crate::logging::LogEntry::info("rl_tcp", &message)
                    } else {
                        crate::logging::LogEntry::warn("rl_tcp", &message)
                    };
                    let _ = log_tx.send(level);
                    tracker.snap.connection = connection;
                    tracker.snap.connection_message = message;
                }
                TrackerCmd::RawEvent(raw) => {
                    let Ok(v) = serde_json::from_str::<Value>(&raw) else {
                        continue;
                    };
                    let event_name = v
                        .get("event")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let data = v.get("data").cloned().unwrap_or(Value::Null);

                    *tracker
                        .snap
                        .raw_event_counts
                        .entry(event_name.clone())
                        .or_insert(0) += 1;
                    tracker.snap.last_event_at = Some(iso_now());

                    match event_name.as_str() {
                        "game:update_state" => {
                            if tracker.on_update_state(&data) {
                                queue_auto_skip_replay(
                                    &mut tracker,
                                    &data_dir,
                                    &log_tx,
                                    "update_state replay flag",
                                );
                            }
                        }
                        "game:match_created" | "game:initialized" => {
                            let _ = log_tx.send(crate::logging::LogEntry::info(
                                "session",
                                format!("Match created: {event_name}"),
                            ));
                            tracker.on_match_created(&data);
                        }
                        "game:match_ended" => {
                            let _ = log_tx
                                .send(crate::logging::LogEntry::info("session", "Match ended"));
                            tracker.on_match_ended(&data);
                            needs_persist = true;
                        }
                        "game:match_destroyed" => {
                            let _ = log_tx
                                .send(crate::logging::LogEntry::info("session", "Match destroyed"));
                            tracker.on_match_destroyed();
                            needs_persist = true;
                        }
                        "game:ball_hit" => tracker.on_ball_hit(&data),
                        "game:replay_start" => {
                            queue_auto_skip_replay(
                                &mut tracker,
                                &data_dir,
                                &log_tx,
                                "replay_start event",
                            );
                        }
                        _ => {}
                    }
                }
            }

            {
                let mut w = shared.write().await;
                *w = tracker.snap.clone();
                if let Ok(json) = serde_json::to_string(&*w) {
                    let _ = sse_tx.send(json);
                }
                app.emit("session:state", &tracker.snap).ok();
            }

            if needs_persist {
                let dd = data_dir.clone();
                let snap = tracker.snap.clone();
                tokio::task::spawn_blocking(move || {
                    write_obs_files(&dd, &snap);
                    do_persist(&dd, &snap);
                });
            }
        }
    });

    cmd_tx
}
