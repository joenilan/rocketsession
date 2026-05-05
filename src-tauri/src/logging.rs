use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp_ms: u64,
    pub level: LogLevel,
    pub scope: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

impl LogEntry {
    pub fn debug(scope: impl Into<String>, message: impl Into<String>) -> Self {
        Self { timestamp_ms: now_ms(), level: LogLevel::Debug, scope: scope.into(), message: message.into(), details: None }
    }

    pub fn info(scope: impl Into<String>, message: impl Into<String>) -> Self {
        Self { timestamp_ms: now_ms(), level: LogLevel::Info, scope: scope.into(), message: message.into(), details: None }
    }

    pub fn warn(scope: impl Into<String>, message: impl Into<String>) -> Self {
        Self { timestamp_ms: now_ms(), level: LogLevel::Warn, scope: scope.into(), message: message.into(), details: None }
    }

    #[allow(dead_code)]
    pub fn error(scope: impl Into<String>, message: impl Into<String>) -> Self {
        Self { timestamp_ms: now_ms(), level: LogLevel::Error, scope: scope.into(), message: message.into(), details: None }
    }

    #[allow(dead_code)]
    pub fn with_details(mut self, details: impl Into<String>) -> Self {
        self.details = Some(details.into());
        self
    }
}
