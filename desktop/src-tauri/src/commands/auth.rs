use crate::state::{AuthServerRunning, AuthServerStop};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

const AUTH_SERVER_ADDR: &str = "127.0.0.1:19284";
const AUTH_SERVER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
const AUTH_SERVER_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);

/// Start a temporary HTTP server on 127.0.0.1:19284 to receive the OAuth
/// callback from the system browser. Returns immediately — the server runs
/// in a background thread and emits an `auth-callback` event when the
/// browser redirects back with the authorization code.
#[tauri::command]
pub fn start_auth_server(app: tauri::AppHandle) -> Result<(), String> {
    use std::net::TcpListener;

    // Prevent multiple concurrent auth servers
    let running = app.state::<AuthServerRunning>();
    {
        let mut guard = running.0.lock().map_err(|e| format!("lock: {e}"))?;
        if *guard {
            return Err("Auth server already running".into());
        }
        *guard = true;
    }

    let stop_requested = app.state::<AuthServerStop>();
    stop_requested.0.store(false, Ordering::SeqCst);

    // Bind first (on the calling thread) so we know the port is available
    // before opening the browser.
    let listener = TcpListener::bind(AUTH_SERVER_ADDR).map_err(|e| {
        *running.0.lock().unwrap_or_else(|p| {
            log::warn!("AuthServerRunning mutex was poisoned, recovering");
            p.into_inner()
        }) = false;
        format!("Failed to bind: {e}")
    })?;

    let running_handle = app.state::<AuthServerRunning>().inner().clone();
    let stop_handle = app.state::<AuthServerStop>().inner().clone();
    std::thread::spawn(move || {
        run_auth_server(listener, running_handle, stop_handle, move |payload| {
            app.emit("auth-callback", payload).ok();
        });
    });

    Ok(())
}

/// Request shutdown of the temporary OAuth callback server and wait briefly
/// for the background thread to release the port.
#[tauri::command]
pub fn stop_auth_server(app: tauri::AppHandle) -> Result<(), String> {
    let running = app.state::<AuthServerRunning>().inner().clone();
    let stop_requested = app.state::<AuthServerStop>();

    let is_running = *running.0.lock().map_err(|e| format!("lock: {e}"))?;
    if !is_running {
        stop_requested.0.store(false, Ordering::SeqCst);
        return Ok(());
    }

    stop_requested.0.store(true, Ordering::SeqCst);

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(1);
    loop {
        let still_running = *running.0.lock().map_err(|e| format!("lock: {e}"))?;
        if !still_running {
            return Ok(());
        }

        if std::time::Instant::now() >= deadline {
            return Err("Timed out waiting for auth server shutdown".into());
        }

        std::thread::sleep(std::time::Duration::from_millis(25));
    }
}

fn run_auth_server<F>(
    listener: std::net::TcpListener,
    running_handle: AuthServerRunning,
    stop_requested: AuthServerStop,
    emit_callback: F,
) where
    F: Fn(serde_json::Value),
{
    use std::io::{ErrorKind, Write};

    if let Err(err) = listener.set_nonblocking(true) {
        log::error!("Failed to set auth listener nonblocking: {err}");
        finish_auth_server(&running_handle, &stop_requested);
        return;
    }

    let started_at = std::time::Instant::now();

    loop {
        if stop_requested.0.load(Ordering::SeqCst) {
            break;
        }

        if started_at.elapsed() >= AUTH_SERVER_TIMEOUT {
            break;
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(true).ok();

                if let Some(request) =
                    read_callback_request(&mut stream, &stop_requested, started_at)
                {
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

                    emit_callback(serde_json::json!({
                        "code": code,
                        "state": state,
                    }));
                }

                break;
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(AUTH_SERVER_POLL_INTERVAL);
            }
            Err(err) => {
                log::warn!("Auth server accept failed: {err}");
                break;
            }
        }
    }

    finish_auth_server(&running_handle, &stop_requested);
}

fn read_callback_request(
    stream: &mut std::net::TcpStream,
    stop_requested: &AuthServerStop,
    started_at: std::time::Instant,
) -> Option<String> {
    use std::io::{ErrorKind, Read};

    let mut request = Vec::with_capacity(4096);

    loop {
        if stop_requested.0.load(Ordering::SeqCst) || started_at.elapsed() >= AUTH_SERVER_TIMEOUT {
            return None;
        }

        let mut buf = [0u8; 1024];
        match stream.read(&mut buf) {
            Ok(0) => return None,
            Ok(n) => {
                request.extend_from_slice(&buf[..n]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    return Some(String::from_utf8_lossy(&request).into_owned());
                }
            }
            Err(err) if err.kind() == ErrorKind::WouldBlock => {
                std::thread::sleep(AUTH_SERVER_POLL_INTERVAL);
            }
            Err(err) => {
                log::warn!("Auth server read failed: {err}");
                return None;
            }
        }
    }
}

fn finish_auth_server(running_handle: &AuthServerRunning, stop_requested: &AuthServerStop) {
    stop_requested.0.store(false, Ordering::SeqCst);
    *running_handle.0.lock().unwrap_or_else(|p| {
        log::warn!("AuthServerRunning mutex was poisoned, recovering");
        p.into_inner()
    }) = false;
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
            return kv.next().map(percent_decode);
        }
    }
    None
}

/// Minimal percent-decoding for OAuth callback parameters.
/// Accumulates raw bytes so multi-byte UTF-8 sequences (e.g. %C3%A9 → é)
/// decode correctly instead of being treated as individual codepoints.
fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut iter = input.bytes();
    while let Some(b) = iter.next() {
        if b == b'%' {
            let hi = iter.next().unwrap_or(b'0');
            let lo = iter.next().unwrap_or(b'0');
            let hex = [hi, lo];
            if let Ok(s) = std::str::from_utf8(&hex) {
                if let Ok(val) = u8::from_str_radix(s, 16) {
                    bytes.push(val);
                    continue;
                }
            }
            bytes.push(b'%');
            bytes.push(hi);
            bytes.push(lo);
        } else if b == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::{TcpListener, TcpStream};
    use std::sync::{atomic::AtomicBool, Arc, Mutex};
    use std::thread;
    use std::time::Duration;

    #[test]
    fn auth_server_stops_when_stop_is_requested() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let running_handle = AuthServerRunning(Arc::new(Mutex::new(true)));
        let stop_requested = AuthServerStop(Arc::new(AtomicBool::new(false)));

        let running_for_thread = running_handle.clone();
        let stop_for_thread = stop_requested.clone();
        let thread = thread::spawn(move || {
            run_auth_server(listener, running_for_thread, stop_for_thread, |_| {});
        });

        thread::sleep(Duration::from_millis(100));
        stop_requested.0.store(true, Ordering::SeqCst);

        thread.join().expect("join auth server thread");

        assert!(!*running_handle.0.lock().expect("lock running flag"));
        assert!(!stop_requested.0.load(Ordering::SeqCst));
    }

    #[test]
    fn auth_server_emits_code_and_state_from_callback_request() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let addr = listener.local_addr().expect("read listener addr");
        let running_handle = AuthServerRunning(Arc::new(Mutex::new(true)));
        let stop_requested = AuthServerStop(Arc::new(AtomicBool::new(false)));
        let payloads = Arc::new(Mutex::new(Vec::<serde_json::Value>::new()));

        let running_for_thread = running_handle.clone();
        let stop_for_thread = stop_requested.clone();
        let payloads_for_thread = payloads.clone();
        let thread = thread::spawn(move || {
            run_auth_server(
                listener,
                running_for_thread,
                stop_for_thread,
                move |payload| {
                    payloads_for_thread
                        .lock()
                        .expect("lock payload store")
                        .push(payload);
                },
            );
        });

        let mut stream = TcpStream::connect(addr).expect("connect to auth listener");
        stream
            .write_all(b"GET /callback?code=test-code&state=test-state HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .expect("write callback request");

        thread.join().expect("join auth server thread");

        let payloads = payloads.lock().expect("lock payload store");
        assert_eq!(payloads.len(), 1);
        assert_eq!(payloads[0]["code"], "test-code");
        assert_eq!(payloads[0]["state"], "test-state");
        assert!(!*running_handle.0.lock().expect("lock running flag"));
    }

    #[test]
    fn auth_server_stops_while_client_connection_is_stalled() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind test listener");
        let addr = listener.local_addr().expect("read listener addr");
        let running_handle = AuthServerRunning(Arc::new(Mutex::new(true)));
        let stop_requested = AuthServerStop(Arc::new(AtomicBool::new(false)));

        let running_for_thread = running_handle.clone();
        let stop_for_thread = stop_requested.clone();
        let thread = thread::spawn(move || {
            run_auth_server(listener, running_for_thread, stop_for_thread, |_| {});
        });

        let _stream = TcpStream::connect(addr).expect("connect to auth listener");
        thread::sleep(Duration::from_millis(100));
        stop_requested.0.store(true, Ordering::SeqCst);

        thread.join().expect("join auth server thread");

        assert!(!*running_handle.0.lock().expect("lock running flag"));
        assert!(!stop_requested.0.load(Ordering::SeqCst));
    }
}
