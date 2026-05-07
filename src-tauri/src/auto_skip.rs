#[cfg(target_os = "windows")]
pub fn send_replay_skip_key() -> Result<(), String> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
        MOUSEINPUT,
    };

    if !foreground_window_is_rocket_league() {
        return Err("Rocket League is not the active foreground window.".to_string());
    }

    let mut inputs = [
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_RIGHTDOWN,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_RIGHTUP,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        },
    ];

    let sent = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_mut_ptr(),
            std::mem::size_of::<INPUT>() as i32,
        )
    };

    if sent == inputs.len() as u32 {
        Ok(())
    } else {
        Err(format!(
            "SendInput sent {sent} of {} key events",
            inputs.len()
        ))
    }
}

#[cfg(target_os = "windows")]
fn foreground_window_is_rocket_league() -> bool {
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};

    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return false;
    }

    let mut title = [0u16; 256];
    let len = unsafe { GetWindowTextW(hwnd, title.as_mut_ptr(), title.len() as i32) };
    if len <= 0 {
        return false;
    }

    String::from_utf16_lossy(&title[..len as usize])
        .to_ascii_lowercase()
        .contains("rocket league")
}

#[cfg(not(target_os = "windows"))]
pub fn send_replay_skip_key() -> Result<(), String> {
    Err("Auto-skip replay input is only supported on Windows.".to_string())
}
