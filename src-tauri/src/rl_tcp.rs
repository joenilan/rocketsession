use tokio::{
    io::AsyncReadExt,
    net::TcpStream,
    sync::mpsc,
    time::{Duration, sleep},
};

use crate::session::TrackerCmd;
use crate::stats_api_adapter::StatsApiAdapter;

// Ported from BOOST ws_relay.rs — the Stats API sends concatenated JSON objects
// with no newline delimiters, so read_line never completes. This buffer counts
// braces to extract complete objects from a raw byte stream.
#[derive(Default)]
struct JsonFrameBuffer {
    buf: Vec<u8>,
}

impl JsonFrameBuffer {
    fn extend(&mut self, data: &[u8]) {
        self.buf.extend_from_slice(data);
    }

    fn next_frame(&mut self) -> Option<String> {
        let mut start = 0usize;
        while start < self.buf.len() && self.buf[start].is_ascii_whitespace() {
            start += 1;
        }
        if start >= self.buf.len() {
            self.buf.drain(..start);
            return None;
        }
        if self.buf[start] != b'{' {
            if let Some(idx) = self.buf[start..].iter().position(|&b| b == b'{') {
                self.buf.drain(..start + idx);
            } else {
                self.buf.clear();
            }
            return None;
        }

        let mut depth: i32 = 0;
        let mut in_string = false;
        let mut escape = false;
        for i in start..self.buf.len() {
            let b = self.buf[i];
            if escape {
                escape = false;
                continue;
            }
            if in_string {
                match b {
                    b'\\' => escape = true,
                    b'"' => in_string = false,
                    _ => {}
                }
                continue;
            }
            match b {
                b'"' => in_string = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        let frame = self.buf[start..=i].to_vec();
                        self.buf.drain(..=i);
                        return String::from_utf8(frame).ok();
                    }
                }
                _ => {}
            }
        }
        None
    }
}

pub fn spawn_rl_client(
    addr: String,
    cmd_tx: mpsc::UnboundedSender<TrackerCmd>,
    log_tx: mpsc::UnboundedSender<crate::logging::LogEntry>,
) {
    tauri::async_runtime::spawn(async move {
        let _ = log_tx.send(crate::logging::LogEntry::info("rl_tcp", format!("Connecting to Stats API at {addr}")));
        loop {
            match TcpStream::connect(&addr).await {
                Ok(mut stream) => {
                    let _ = log_tx.send(crate::logging::LogEntry::info("rl_tcp", "TCP stream established"));
                    let _ = cmd_tx.send(TrackerCmd::SetConnection {
                        connection: "connected".to_string(),
                        message: "Connected to Rocket League Stats API.".to_string(),
                    });

                    let mut adapter = StatsApiAdapter::default();
                    let mut frames = JsonFrameBuffer::default();
                    let mut chunk = [0u8; 8192];

                    loop {
                        let n = match stream.read(&mut chunk).await {
                            Ok(0) => break,
                            Ok(n) => n,
                            Err(_) => break,
                        };
                        frames.extend(&chunk[..n]);

                        while let Some(raw) = frames.next_frame() {
                            if let Some(normalized) = adapter.normalize_message(&raw) {
                                let _ = cmd_tx.send(TrackerCmd::RawEvent(normalized));
                            }
                        }
                    }

                    let _ = cmd_tx.send(TrackerCmd::SetConnection {
                        connection: "disconnected".to_string(),
                        message: "Lost connection to Rocket League Stats API. Reconnecting..."
                            .to_string(),
                    });
                }
                Err(_) => {
                    let _ = cmd_tx.send(TrackerCmd::SetConnection {
                        connection: "disconnected".to_string(),
                        message: "Waiting for Rocket League Stats API...".to_string(),
                    });
                }
            }
            sleep(Duration::from_millis(1500)).await;
        }
    });
}
