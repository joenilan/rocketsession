use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_stats_api_port")]
    pub stats_api_port: u16,
    #[serde(default)]
    pub auto_skip_replays: bool,
    #[serde(default = "default_auto_skip_delay_ms")]
    pub auto_skip_delay_ms: u64,
}

fn default_stats_api_port() -> u16 {
    49123
}

fn default_auto_skip_delay_ms() -> u64 {
    700
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            stats_api_port: default_stats_api_port(),
            auto_skip_replays: false,
            auto_skip_delay_ms: default_auto_skip_delay_ms(),
        }
    }
}

pub fn load(data_dir: &Path) -> AppSettings {
    let path = data_dir.join("settings.json");
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(data_dir: &Path, settings: &AppSettings) -> Result<(), String> {
    let path = data_dir.join("settings.json");
    let tmp = path.with_extension("tmp");
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, &json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}
