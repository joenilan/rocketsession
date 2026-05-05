use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigStatus {
    pub found: bool,
    pub enabled: bool,
    pub path: Option<String>,
    pub install_dir: Option<String>,
    pub packet_send_rate: f64,
    pub port: u16,
    pub error: Option<String>,
}


fn parse_steam_library_paths(vdf_path: &Path) -> Vec<PathBuf> {
    if let Ok(contents) = fs::read_to_string(vdf_path) {
        contents
            .lines()
            .filter(|line| line.trim().to_lowercase().starts_with("\"path\""))
            .filter_map(|line| {
                let parts: Vec<&str> = line.trim().split('"').collect();
                parts.get(3).map(|p| PathBuf::from(p.replace("\\\\", "\\")))
            })
            .collect()
    } else {
        vec![]
    }
}

pub fn candidate_install_dirs() -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut dirs: Vec<PathBuf> = vec![];
    let mut push = |p: PathBuf| {
        let canon = p.to_string_lossy().to_lowercase();
        if seen.insert(canon) {
            dirs.push(p);
        }
    };

    if let Ok(val) = std::env::var("ROCKET_LEAGUE_INSTALL_DIR") {
        push(PathBuf::from(val));
    }

    #[cfg(target_os = "windows")]
    {
        let pf86 = std::env::var("ProgramFiles(x86)")
            .unwrap_or_else(|_| "C:\\Program Files (x86)".into());
        let pf = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        push(PathBuf::from(&pf).join("Epic Games").join("rocketleague"));
        push(PathBuf::from(&pf86).join("Epic Games").join("rocketleague"));
        for steam_root in [
            PathBuf::from(&pf86).join("Steam"),
            PathBuf::from(&pf).join("Steam"),
        ] {
            push(steam_root.join("steamapps").join("common").join("rocketleague"));
            let vdf = steam_root.join("steamapps").join("libraryfolders.vdf");
            for lib in parse_steam_library_paths(&vdf) {
                push(lib.join("steamapps").join("common").join("rocketleague"));
            }
        }
    }

    dirs
}

pub fn is_valid_install_dir(p: &Path) -> bool {
    p.join("TAGame").join("Config").exists()
}

pub fn ini_path_from_install_dir(install_dir: &Path) -> PathBuf {
    install_dir
        .join("TAGame")
        .join("Config")
        .join("DefaultStatsAPI.ini")
}

pub fn resolve_ini_path(manual: Option<&str>) -> (Option<PathBuf>, Option<String>) {
    if let Some(m) = manual.filter(|s| !s.trim().is_empty()) {
        let p = PathBuf::from(m.trim());
        let lower = p.to_string_lossy().to_lowercase();
        if lower.ends_with("defaultstatsapi.ini") {
            return (Some(p), None);
        }
        if is_valid_install_dir(&p) {
            return (Some(ini_path_from_install_dir(&p)), None);
        }
        let direct = p.join("DefaultStatsAPI.ini");
        if direct.exists() || lower.ends_with("config") {
            return (Some(direct), None);
        }
        return (
            None,
            Some("Select the Rocket League install folder or DefaultStatsAPI.ini.".into()),
        );
    }
    if let Some(found) = candidate_install_dirs()
        .into_iter()
        .find(|d| is_valid_install_dir(d))
    {
        return (Some(ini_path_from_install_dir(&found)), None);
    }
    (
        None,
        Some("Rocket League install folder not found. Set the path manually.".into()),
    )
}

pub fn read_ini_values(config_path: &Path) -> (f64, u16) {
    let mut packet_send_rate = 0.0f64;
    let mut port = 49123u16;
    if let Ok(contents) = fs::read_to_string(config_path) {
        for line in contents.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.starts_with(';') {
                continue;
            }
            if let Some(eq) = trimmed.find('=') {
                let key = trimmed[..eq].trim().to_lowercase();
                let val = trimmed[eq + 1..].trim();
                match key.as_str() {
                    "packetsendrate" => packet_send_rate = val.parse().unwrap_or(0.0),
                    "port" => port = val.parse().unwrap_or(49123),
                    _ => {}
                }
            }
        }
    }
    (packet_send_rate, port)
}

pub fn upsert_ini_value(contents: &str, key: &str, value: &str) -> String {
    let mut replaced = false;
    let lines: Vec<String> = contents
        .lines()
        .map(|line| {
            let trimmed = line.trim_start();
            if !trimmed.starts_with('#') && !trimmed.starts_with(';') {
                if let Some(eq) = trimmed.find('=') {
                    if trimmed[..eq].trim().to_lowercase() == key.to_lowercase() {
                        replaced = true;
                        return format!("{}={}", key, value);
                    }
                }
            }
            line.to_string()
        })
        .collect();
    let mut result = lines.join("\n");
    if !replaced {
        if !result.is_empty() && !result.ends_with('\n') {
            result.push('\n');
        }
        result.push_str(&format!("{}={}", key, value));
    }
    if !result.ends_with('\n') {
        result.push('\n');
    }
    result
}

pub fn build_config_status(path: Option<&PathBuf>, error: Option<String>) -> ConfigStatus {
    match path {
        None => ConfigStatus {
            found: false,
            enabled: false,
            path: None,
            install_dir: None,
            packet_send_rate: 0.0,
            port: 49123,
            error,
        },
        Some(p) => {
            let found = p.exists() || p.parent().map(|d| d.exists()).unwrap_or(false);
            let (packet_send_rate, port) =
                if p.exists() { read_ini_values(p) } else { (0.0, 49123) };
            let install_dir = p
                .ancestors()
                .nth(3)
                .map(|a| a.to_string_lossy().into_owned());
            ConfigStatus {
                found,
                enabled: packet_send_rate > 0.0,
                path: Some(p.to_string_lossy().into_owned()),
                install_dir,
                packet_send_rate,
                port,
                error,
            }
        }
    }
}
