use std::sync::Mutex;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::watch;

// ── SSE state ────────────────────────────────────────────────────

/// Holds the cancellation handle for the background SSE task.
struct SseHandle(Mutex<Option<watch::Sender<bool>>>);

/// Resize the window height, preserving current width.
/// The `anchor` parameter controls which edge stays fixed:
///   - `"top"`: top edge stays fixed, height extends downward (no reposition)
///   - `"bottom"` (or any other value): bottom edge stays fixed, top moves
///
/// Reads current geometry once up-front, then applies size + position
/// in a single pass to minimise visual tearing.
#[tauri::command]
fn resize_window(window: tauri::Window, height: f64, anchor: Option<String>) {
    let (size, pos) = match (window.outer_size(), window.outer_position()) {
        (Ok(s), Ok(p)) => (s, p),
        _ => return,
    };
    let scale = window.scale_factor().unwrap_or(1.0);
    let current_width = size.width as f64 / scale;
    let current_height = size.height as f64 / scale;
    let delta = height - current_height;

    if delta.abs() < 0.5 {
        return; // no meaningful change
    }

    // 1. Resize — window extends downward from current position
    let _ = window.set_size(tauri::LogicalSize::new(current_width, height));

    // 2. If bottom-anchored, shift upward so bottom edge stays fixed
    let is_top = anchor.as_deref() == Some("top");
    if !is_top {
        let current_y = pos.y as f64 / scale;
        let _ = window.set_position(tauri::LogicalPosition::new(
            pos.x as f64 / scale,
            current_y - delta,
        ));
    }
}

/// Start a temporary HTTP server on 127.0.0.1:19284 to receive the OAuth
/// callback from the system browser. Returns immediately — the server runs
/// in a background thread and emits an `auth-callback` event when the
/// browser redirects back with the authorization code.
#[tauri::command]
fn start_auth_server(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    // Bind first (on the calling thread) so we know the port is available
    // before opening the browser.
    let listener =
        TcpListener::bind("127.0.0.1:19284").map_err(|e| format!("Failed to bind: {e}"))?;

    std::thread::spawn(move || {
        // Accept one connection with a 5-minute timeout.
        // SO_RCVTIMEO on the listener socket doesn't work portably, so we
        // set a deadline on the accepted stream's read instead.
        if let Ok((mut stream, _)) = listener.accept() {
            stream.set_read_timeout(Some(Duration::from_secs(300))).ok();

            let mut buf = [0u8; 4096];
            if let Ok(n) = stream.read(&mut buf) {
                let request = String::from_utf8_lossy(&buf[..n]);

                let code = extract_query_param(&request, "code");
                let state = extract_query_param(&request, "state");

                // Respond with a styled "you can close this tab" page
                let html = r#"<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#0a0a0a;color:#d4d4da}div{text-align:center}h2{color:#bfff00;margin-bottom:8px}p{color:#84848e;font-size:14px}</style></head><body><div><h2>Login successful</h2><p>You can close this tab and return to Scrollr.</p></div></body></html>"#;

                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    html.len(),
                    html,
                );
                stream.write_all(response.as_bytes()).ok();
                stream.flush().ok();

                // Emit the result back to the webview
                let payload = serde_json::json!({
                    "code": code,
                    "state": state,
                });
                app.emit("auth-callback", payload).ok();
            }
        }
        // Listener drops here, freeing the port
    });

    Ok(())
}

/// Extract a query parameter from a raw HTTP request line.
/// Parses "GET /callback?code=xxx&state=yyy HTTP/1.1".
fn extract_query_param(request: &str, key: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;

    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next()? == key {
            return kv.next().map(|v| percent_decode(v));
        }
    }
    None
}

/// Minimal percent-decoding for OAuth callback parameters.
fn percent_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hi = chars.next().unwrap_or(b'0');
            let lo = chars.next().unwrap_or(b'0');
            let hex = [hi, lo];
            if let Ok(s) = std::str::from_utf8(&hex) {
                if let Ok(val) = u8::from_str_radix(s, 16) {
                    out.push(val as char);
                    continue;
                }
            }
            out.push('%');
            out.push(hi as char);
            out.push(lo as char);
        } else if b == b'+' {
            out.push(' ');
        } else {
            out.push(b as char);
        }
    }
    out
}

/// Snap the ticker window to a screen edge and stretch it to full monitor width.
/// Sets x = monitor left edge, width = monitor width, y = top or bottom edge.
///
/// Like `pin_window`, Wayland compositors ignore GTK's `set_position()` and
/// may ignore `set_size()`. We detect the compositor and use native IPC:
///   Hyprland → `hyprctl dispatch movewindowpixel` + `resizewindowpixel`
///   Sway     → `swaymsg move absolute position` + `resize set`
///   KDE/KWin → `qdbus6` D-Bus scripting API → frameGeometry
///   Fallback → GTK set_size + set_position (works on macOS/Windows/X11)
#[tauri::command]
fn position_ticker(
    window: tauri::Window,
    position: String,
    height: Option<f64>,
) -> Result<(), String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("monitor query failed: {e}"))?
        .ok_or("no monitor found")?;

    let scale = monitor.scale_factor();
    let screen_width = monitor.size().width as f64 / scale;
    let screen_height = monitor.size().height as f64 / scale;
    let monitor_x = monitor.position().x as f64 / scale;
    let monitor_y = monitor.position().y as f64 / scale;

    // Use explicit height if provided; otherwise read from window.
    // On Wayland, a preceding set_size() may not have propagated yet,
    // so callers should always pass the desired height.
    let win_height = match height {
        Some(h) => h,
        None => {
            let size = window
                .outer_size()
                .map_err(|e| format!("outer_size failed: {e}"))?;
            size.height as f64 / scale
        }
    };

    let new_y = if position == "top" {
        monitor_y
    } else {
        monitor_y + screen_height - win_height
    };

    // Wayland compositors ignore GTK set_position/set_size — use native IPC.
    // Pass height so compositor sets full geometry atomically.
    if std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok() {
        return position_hyprland(&window, monitor_x, new_y, screen_width, win_height);
    }
    if std::env::var("SWAYSOCK").is_ok() {
        return position_sway(&window, monitor_x, new_y, screen_width, win_height);
    }
    if is_kde() {
        if let Some(qdbus) = find_qdbus() {
            return position_kwin(&window, monitor_x, new_y, screen_width, win_height, &qdbus);
        }
    }

    // Fallback: GTK (macOS, Windows, X11, GNOME)
    let _ = window.set_size(tauri::LogicalSize::new(screen_width, win_height));
    window
        .set_position(tauri::LogicalPosition::new(monitor_x, new_y))
        .map_err(|e| format!("set_position failed: {e}"))?;
    Ok(())
}

/// Hyprland: move + resize via `hyprctl dispatch`.
fn position_hyprland(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let title = window.title().unwrap_or_default();

    let output = std::process::Command::new("hyprctl")
        .args(["clients", "-j"])
        .output()
        .map_err(|e| format!("hyprctl failed: {e}"))?;

    let clients: Vec<serde_json::Value> =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse error: {e}"))?;

    for client in &clients {
        if client["title"].as_str().unwrap_or("") == title {
            let addr = client["address"].as_str().ok_or("no address field")?;

            // Resize to full monitor width + desired height
            std::process::Command::new("hyprctl")
                .args([
                    "dispatch",
                    "resizewindowpixel",
                    &format!("exact {} {},address:{addr}", width as i32, height as i32),
                ])
                .output()
                .map_err(|e| format!("hyprctl resize failed: {e}"))?;

            // Move to target position
            std::process::Command::new("hyprctl")
                .args([
                    "dispatch",
                    "movewindowpixel",
                    &format!("exact {} {},address:{addr}", x as i32, y as i32),
                ])
                .output()
                .map_err(|e| format!("hyprctl move failed: {e}"))?;

            return Ok(());
        }
    }

    Err("window not found in hyprctl clients".into())
}

/// Sway: `move absolute position` + `resize set` for floating windows.
fn position_sway(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let title = window.title().unwrap_or_default();

    std::process::Command::new("swaymsg")
        .arg(format!(
            "[title=\"{title}\"] move absolute position {} {}, resize set {} {}",
            x as i32, y as i32, width as i32, height as i32,
        ))
        .output()
        .map_err(|e| format!("swaymsg failed: {e}"))?;

    Ok(())
}

/// KDE/KWin: inject a KWin script that sets the full `frameGeometry` via D-Bus.
fn position_kwin(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    qdbus: &str,
) -> Result<(), String> {
    let title = window.title().unwrap_or_default();
    let x_int = x as i32;
    let y_int = y as i32;
    let w_int = width as i32;
    let h_int = height as i32;

    let script = format!(
        r#"var wins = workspace.windowList();
for (var i = 0; i < wins.length; i++) {{
    if (wins[i].caption === "{title}") {{
        wins[i].frameGeometry = {{x: {x_int}, y: {y_int}, width: {w_int}, height: {h_int}}};
    }}
}}"#
    );

    let tmp = std::env::temp_dir().join("scrollr_kwin_pos.js");
    std::fs::write(&tmp, &script).map_err(|e| format!("write temp script: {e}"))?;
    let tmp_path = tmp.to_str().ok_or("invalid temp path")?;

    // Unload any previous instance (ignore errors — may not exist)
    std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            "scrollr_pos",
        ])
        .output()
        .ok();

    // Load the script → returns a numeric script ID
    let load = std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.loadScript",
            tmp_path,
            "scrollr_pos",
        ])
        .output()
        .map_err(|e| format!("{qdbus} loadScript failed: {e}"))?;

    let script_id = String::from_utf8_lossy(&load.stdout).trim().to_string();
    if script_id.is_empty() || !load.status.success() {
        let stderr = String::from_utf8_lossy(&load.stderr);
        std::fs::remove_file(&tmp).ok();
        return Err(format!("loadScript failed: {stderr}"));
    }

    // Run the script
    let run_path = format!("/Scripting/Script{script_id}");
    std::process::Command::new(qdbus)
        .args(["org.kde.KWin", &run_path, "org.kde.kwin.Script.run"])
        .output()
        .map_err(|e| format!("{qdbus} run failed: {e}"))?;

    // Stop and unload — script is one-shot, clean up immediately
    std::process::Command::new(qdbus)
        .args(["org.kde.KWin", &run_path, "org.kde.kwin.Script.stop"])
        .output()
        .ok();

    std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            "scrollr_pos",
        ])
        .output()
        .ok();

    std::fs::remove_file(&tmp).ok();
    Ok(())
}

// ── Pin (always-on-top) via compositor IPC ───────────────────────
//
// Wayland compositors ignore GTK's `set_keep_above()` at runtime
// (Tauri's `setAlwaysOnTop()` is a no-op on most Wayland compositors).
// We detect the compositor and use its native IPC instead:
//   Hyprland → `hyprctl dispatch pin address:0x...`
//   Sway     → `swaymsg [title="..."] sticky enable/disable`
//   KDE/KWin → `qdbus6` D-Bus scripting API → keepAbove
//   Fallback → GTK set_always_on_top (works on GNOME/X11)

#[tauri::command]
fn pin_window(window: tauri::Window, pinned: bool) -> Result<(), String> {
    // Try Hyprland first
    if std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok() {
        return pin_hyprland(&window, pinned);
    }

    // Try Sway
    if std::env::var("SWAYSOCK").is_ok() {
        return pin_sway(&window, pinned);
    }

    // Try KDE/KWin (qdbus6 required)
    if is_kde() {
        if let Some(qdbus) = find_qdbus() {
            return pin_kwin(&window, pinned, &qdbus);
        }
    }

    // Fallback: GTK set_always_on_top (works on GNOME, X11)
    window
        .set_always_on_top(pinned)
        .map_err(|e| format!("set_always_on_top failed: {e}"))
}

/// Hyprland: `pin` is a toggle, so we query current state first.
fn pin_hyprland(window: &tauri::Window, desired: bool) -> Result<(), String> {
    let title = window.title().unwrap_or_default();

    // Query all clients as JSON to find our window
    let output = std::process::Command::new("hyprctl")
        .args(["clients", "-j"])
        .output()
        .map_err(|e| format!("hyprctl failed: {e}"))?;

    let clients: Vec<serde_json::Value> =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse error: {e}"))?;

    for client in &clients {
        let client_title = client["title"].as_str().unwrap_or("");
        if client_title == title {
            let currently_pinned = client["pinned"].as_bool().unwrap_or(false);
            if currently_pinned != desired {
                let addr = client["address"]
                    .as_str()
                    .ok_or("no address field")?;
                std::process::Command::new("hyprctl")
                    .args(["dispatch", "pin", &format!("address:{addr}")])
                    .output()
                    .map_err(|e| format!("hyprctl dispatch failed: {e}"))?;
            }
            return Ok(());
        }
    }

    Err("window not found in hyprctl clients".into())
}

/// Sway: `sticky` enables/disables always-visible-on-all-workspaces.
fn pin_sway(window: &tauri::Window, pinned: bool) -> Result<(), String> {
    let title = window.title().unwrap_or_default();
    let action = if pinned { "sticky enable" } else { "sticky disable" };

    std::process::Command::new("swaymsg")
        .arg(format!("[title=\"{title}\"] {action}"))
        .output()
        .map_err(|e| format!("swaymsg failed: {e}"))?;

    Ok(())
}

/// Check if running under KDE Plasma.
fn is_kde() -> bool {
    std::env::var("XDG_CURRENT_DESKTOP")
        .map(|d| d.to_uppercase().contains("KDE"))
        .unwrap_or(false)
}

/// Find qdbus6 (Plasma 6) or qdbus (Plasma 5) binary.
fn find_qdbus() -> Option<String> {
    for cmd in &["qdbus6", "qdbus"] {
        if std::process::Command::new("which")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(cmd.to_string());
        }
    }
    None
}

/// KDE/KWin: inject a temporary KWin script via D-Bus that sets keepAbove.
fn pin_kwin(window: &tauri::Window, pinned: bool, qdbus: &str) -> Result<(), String> {
    let title = window.title().unwrap_or_default();
    let keep_above = if pinned { "true" } else { "false" };

    let script = format!(
        r#"var wins = workspace.windowList();
for (var i = 0; i < wins.length; i++) {{
    if (wins[i].caption === "{title}") {{
        wins[i].keepAbove = {keep_above};
    }}
}}"#
    );

    // Write to temp file — KWin scripting API requires a file path
    let tmp = std::env::temp_dir().join("scrollr_kwin_pin.js");
    std::fs::write(&tmp, &script).map_err(|e| format!("write temp script: {e}"))?;
    let tmp_path = tmp.to_str().ok_or("invalid temp path")?;

    // Unload any previous instance (ignore errors — may not exist)
    std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            "scrollr_pin",
        ])
        .output()
        .ok();

    // Load the script → returns a numeric script ID
    let load = std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.loadScript",
            tmp_path,
            "scrollr_pin",
        ])
        .output()
        .map_err(|e| format!("{qdbus} loadScript failed: {e}"))?;

    let script_id = String::from_utf8_lossy(&load.stdout).trim().to_string();
    if script_id.is_empty() || !load.status.success() {
        let stderr = String::from_utf8_lossy(&load.stderr);
        std::fs::remove_file(&tmp).ok();
        return Err(format!("loadScript failed: {stderr}"));
    }

    // Run the script
    let run_path = format!("/Scripting/Script{script_id}");
    std::process::Command::new(qdbus)
        .args(["org.kde.KWin", &run_path, "org.kde.kwin.Script.run"])
        .output()
        .map_err(|e| format!("{qdbus} run failed: {e}"))?;

    // Stop and unload — script is one-shot, clean up immediately
    std::process::Command::new(qdbus)
        .args(["org.kde.KWin", &run_path, "org.kde.kwin.Script.stop"])
        .output()
        .ok();

    std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            "scrollr_pin",
        ])
        .output()
        .ok();

    std::fs::remove_file(&tmp).ok();
    Ok(())
}

// ── SSE commands ─────────────────────────────────────────────────

const SSE_URL: &str = "https://api.myscrollr.relentnet.dev/events";

/// Connect to the SSE endpoint and stream CDC events to the webview.
/// Cancels any existing SSE connection first. Runs in a background
/// tokio task with automatic reconnection and exponential backoff.
#[tauri::command]
async fn start_sse(app: tauri::AppHandle, token: String) -> Result<(), String> {
    // Cancel any existing connection
    stop_sse_internal(&app);

    let (cancel_tx, cancel_rx) = watch::channel(false);
    {
        let state = app.state::<SseHandle>();
        *state.0.lock().unwrap() = Some(cancel_tx);
    }

    tokio::spawn(sse_loop(app, token, cancel_rx));
    Ok(())
}

/// Disconnect from the SSE endpoint.
#[tauri::command]
async fn stop_sse(app: tauri::AppHandle) -> Result<(), String> {
    stop_sse_internal(&app);
    app.emit("sse-status", serde_json::json!({ "status": "disconnected" })).ok();
    Ok(())
}

fn stop_sse_internal(app: &tauri::AppHandle) {
    let state = app.state::<SseHandle>();
    let sender = state.0.lock().unwrap().take();
    if let Some(tx) = sender {
        let _ = tx.send(true);
    }
}

/// Main SSE loop: connect → stream → reconnect on error.
async fn sse_loop(
    app: tauri::AppHandle,
    token: String,
    mut cancel_rx: watch::Receiver<bool>,
) {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let url = format!("{SSE_URL}?token={token}");
    let mut backoff_secs = 1u64;

    loop {
        if *cancel_rx.borrow() {
            break;
        }

        let response = client
            .get(&url)
            .header("Accept", "text/event-stream")
            .send()
            .await;

        match response {
            Ok(res) if res.status().is_success() => {
                app.emit(
                    "sse-status",
                    serde_json::json!({ "status": "connected" }),
                )
                .ok();
                backoff_secs = 1; // Reset on success

                let mut stream = res.bytes_stream();
                let mut buffer = String::new();

                loop {
                    tokio::select! {
                        chunk = stream.next() => {
                            match chunk {
                                Some(Ok(bytes)) => {
                                    buffer.push_str(&String::from_utf8_lossy(&bytes));
                                    // Process complete SSE frames (delimited by \n\n)
                                    while let Some(pos) = buffer.find("\n\n") {
                                        let frame = buffer[..pos].to_string();
                                        buffer = buffer[pos + 2..].to_string();
                                        process_sse_frame(&app, &frame);
                                    }
                                }
                                Some(Err(_)) => break, // Stream error, reconnect
                                None => break,         // Stream ended
                            }
                        }
                        _ = cancel_rx.changed() => {
                            break; // Cancelled
                        }
                    }
                }
            }
            Ok(res) if res.status() == 401 => {
                // Token expired — notify JS so it can refresh and restart
                app.emit(
                    "sse-status",
                    serde_json::json!({ "status": "auth-expired" }),
                )
                .ok();
                break; // Don't retry with a bad token
            }
            Ok(res) => {
                app.emit(
                    "sse-status",
                    serde_json::json!({
                        "status": "error",
                        "code": res.status().as_u16()
                    }),
                )
                .ok();
            }
            Err(e) => {
                app.emit(
                    "sse-status",
                    serde_json::json!({
                        "status": "disconnected",
                        "error": e.to_string()
                    }),
                )
                .ok();
            }
        }

        // Check cancellation before sleeping
        if *cancel_rx.borrow() {
            break;
        }

        app.emit(
            "sse-status",
            serde_json::json!({ "status": "reconnecting" }),
        )
        .ok();

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
        tokio::time::sleep(std::time::Duration::from_secs(backoff_secs)).await;
        backoff_secs = (backoff_secs * 2).min(30);
    }
}

/// Parse a single SSE frame and emit data events to the webview.
fn process_sse_frame(app: &tauri::AppHandle, frame: &str) {
    for line in frame.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if let Ok(payload) = serde_json::from_str::<serde_json::Value>(data) {
                app.emit("sse-event", payload).ok();
            }
        }
        // Lines starting with ':' are comments (heartbeats) — ignore
        // Lines starting with 'retry:' set reconnect interval — we use our own backoff
    }
}

// ── App window commands ──────────────────────────────────────────

#[tauri::command]
fn show_app_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("app") {
        w.show().map_err(|e| format!("show failed: {e}"))?;
        w.set_focus().map_err(|e| format!("focus failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn hide_app_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("app") {
        w.hide().map_err(|e| format!("hide failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SseHandle(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            resize_window,
            position_ticker,
            pin_window,
            start_auth_server,
            start_sse,
            stop_sse,
            show_app_window,
            hide_app_window,
            quit_app,
        ])
        .on_window_event(|window, event| {
            // Intercept close on both windows — hide instead of destroy.
            // Only tray "Quit" or context menu "Quit" actually exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "app" || label == "ticker" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // ── Ticker window setup ──────────────────────────────
            let ticker = app.get_webview_window("ticker").unwrap();

            // Set initial ticker width to fill screen
            if let Ok(Some(monitor)) = ticker.current_monitor() {
                let scale = monitor.scale_factor();
                let screen_width = monitor.size().width as f64 / scale;
                let _ = ticker.set_size(tauri::LogicalSize::new(screen_width, 200.0));
            }

            let _ = ticker.show();

            // ── App window: strip native chrome on Linux/Windows ─
            // macOS keeps native decorations (traffic lights). On
            // other platforms we use our custom TitleBar component.
            #[cfg(not(target_os = "macos"))]
            if let Some(app_win) = app.get_webview_window("app") {
                let _ = app_win.set_decorations(false);
            }

            // ── System tray ──────────────────────────────────────
            let open = MenuItemBuilder::with_id("open", "Open Scrollr").build(app)?;
            let show_ticker = MenuItemBuilder::with_id("show_ticker", "Show/Hide Ticker").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&open, &show_ticker, &quit])
                .build()?;

            TrayIconBuilder::new()
                .tooltip("Scrollr")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("app") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "show_ticker" => {
                        if let Some(w) = app.get_webview_window("ticker") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| {
                    // Left-click tray icon opens/focuses the app window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("app") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
