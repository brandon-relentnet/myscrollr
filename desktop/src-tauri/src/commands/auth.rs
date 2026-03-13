use crate::state::AuthServerRunning;
use tauri::{Emitter, Manager};

/// Start a temporary HTTP server on 127.0.0.1:19284 to receive the OAuth
/// callback from the system browser. Returns immediately — the server runs
/// in a background thread and emits an `auth-callback` event when the
/// browser redirects back with the authorization code.
#[tauri::command]
pub fn start_auth_server(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::time::Duration;

    // Prevent multiple concurrent auth servers
    let running = app.state::<AuthServerRunning>();
    {
        let mut guard = running.0.lock().map_err(|e| format!("lock: {e}"))?;
        if *guard {
            return Err("Auth server already running".into());
        }
        *guard = true;
    }

    // Bind first (on the calling thread) so we know the port is available
    // before opening the browser.
    let listener = TcpListener::bind("127.0.0.1:19284").map_err(|e| {
        *running.0.lock().unwrap_or_else(|p| p.into_inner()) = false;
        format!("Failed to bind: {e}")
    })?;

    let running_handle = app.state::<AuthServerRunning>().inner().clone();
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
        *running_handle.0.lock().unwrap_or_else(|p| p.into_inner()) = false;
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
