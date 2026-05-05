use crate::state::{AuthServerRunning, AuthServerStop};
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

const AUTH_SERVER_ADDR: &str = "127.0.0.1:19284";
const AUTH_SERVER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
const AUTH_SERVER_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(50);

// HTML served back to the user's browser after the OAuth redirect lands
// on our localhost callback. The page is what the user sees in the
// browser tab — they should immediately see "✓ Signed in" and the
// Scrollr app should jump to the foreground (handled separately by the
// callback closure in start_auth_server, which calls show + set_focus
// on the main window).
//
// We TRY to auto-close the browser tab via window.close(), but every
// modern browser blocks JS-initiated close on tabs that weren't opened
// by JS — and OAuth redirect tabs are opened by the OS shell, not JS.
// So the close usually fails silently. The visible "Return to Scrollr"
// button is the fallback: in browsers where window.close() is blocked,
// the click is also blocked (same restriction), but at least the page
// looks intentional rather than orphaned.
//
// Color palette matches the desktop app:
//   #0a0a0a — background
//   #bfff00 — accent green (success)
//   #ef4444 — accent red (failure)
//   #d4d4da — primary foreground
//   #84848e — muted foreground
//   #1a1a1f — surface (cards, buttons)
const AUTH_SUCCESS_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Signed in to Scrollr</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#0a0a0a;color:#d4d4da;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  .stage{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center;padding:48px 32px;background:#0f0f12;
    border:1px solid #1f1f24;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,0.5)}
  .check{margin:0 auto 24px;width:72px;height:72px;border-radius:50%;
    background:rgba(191,255,0,0.10);display:flex;align-items:center;justify-content:center;
    animation:pop 320ms cubic-bezier(0.34,1.56,0.64,1)}
  .check svg{width:36px;height:36px;stroke:#bfff00;stroke-width:3;fill:none;
    stroke-linecap:round;stroke-linejoin:round;
    stroke-dasharray:48;stroke-dashoffset:48;
    animation:draw 460ms 220ms forwards cubic-bezier(0.65,0,0.35,1)}
  h1{margin:0 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#f5f5f7}
  p{margin:0 0 24px;font-size:14px;line-height:1.5;color:#84848e}
  .btn{display:inline-block;padding:10px 20px;background:#bfff00;color:#0a0a0a;
    border:none;border-radius:8px;font:inherit;font-size:14px;font-weight:600;
    cursor:pointer;text-decoration:none;transition:transform 100ms,background 100ms}
  .btn:hover{background:#cfff33;transform:translateY(-1px)}
  .countdown{margin-top:14px;font-size:12px;color:#5a5a64;letter-spacing:0.02em}
  @keyframes pop{0%{transform:scale(0)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
  @keyframes draw{to{stroke-dashoffset:0}}
</style>
</head>
<body>
  <main class="stage">
    <div class="card">
      <div class="check" aria-hidden="true">
        <svg viewBox="0 0 24 24"><polyline points="4 12 10 18 20 6"/></svg>
      </div>
      <h1>Signed in to Scrollr</h1>
      <p>You can close this tab — Scrollr is ready in the app window.</p>
      <button class="btn" type="button" id="close-btn">Close this tab</button>
      <div class="countdown" id="countdown">Closing automatically in 3…</div>
    </div>
  </main>
<script>
(function(){
  var btn = document.getElementById('close-btn');
  var counter = document.getElementById('countdown');
  function tryClose(){ try { window.close(); } catch (e) { /* blocked by browser */ } }
  btn.addEventListener('click', tryClose);
  var n = 3;
  var iv = setInterval(function(){
    n -= 1;
    if (n <= 0) {
      clearInterval(iv);
      counter.textContent = 'You can close this tab now.';
      tryClose();
    } else {
      counter.textContent = 'Closing automatically in ' + n + '…';
    }
  }, 1000);
})();
</script>
</body>
</html>"##;

const AUTH_FAILURE_HTML: &str = r##"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign-in failed</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#0a0a0a;color:#d4d4da;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  .stage{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:420px;text-align:center;padding:48px 32px;background:#0f0f12;
    border:1px solid #1f1f24;border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,0.5)}
  .x{margin:0 auto 24px;width:72px;height:72px;border-radius:50%;
    background:rgba(239,68,68,0.10);display:flex;align-items:center;justify-content:center;
    animation:pop 320ms cubic-bezier(0.34,1.56,0.64,1)}
  .x svg{width:36px;height:36px;stroke:#ef4444;stroke-width:3;fill:none;
    stroke-linecap:round;stroke-linejoin:round}
  h1{margin:0 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.01em;color:#f5f5f7}
  p{margin:0 0 16px;font-size:14px;line-height:1.5;color:#84848e}
  .actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .btn{display:inline-block;padding:10px 18px;background:#1a1a1f;color:#d4d4da;
    border:1px solid #2a2a32;border-radius:8px;font:inherit;font-size:14px;font-weight:500;
    cursor:pointer;text-decoration:none;transition:transform 100ms,background 100ms}
  .btn:hover{background:#22222a;transform:translateY(-1px)}
  .btn-primary{background:#bfff00;color:#0a0a0a;border-color:transparent}
  .btn-primary:hover{background:#cfff33}
  @keyframes pop{0%{transform:scale(0)}60%{transform:scale(1.08)}100%{transform:scale(1)}}
</style>
</head>
<body>
  <main class="stage">
    <div class="card">
      <div class="x" aria-hidden="true">
        <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
      </div>
      <h1>Sign-in failed</h1>
      <p>Something went wrong on the way back to Scrollr. Return to the app and try again — if it keeps happening, contact support.</p>
      <div class="actions">
        <button class="btn btn-primary" type="button" id="close-btn">Close this tab</button>
        <a class="btn" href="https://myscrollr.com/support" target="_self" rel="noopener">Contact support</a>
      </div>
    </div>
  </main>
<script>
(function(){
  var btn = document.getElementById('close-btn');
  btn.addEventListener('click', function(){ try { window.close(); } catch (e) {} });
})();
</script>
</body>
</html>"##;

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
            // Notify the JS side that auth completed so it can exchange
            // the code for tokens.
            app.emit("auth-callback", payload).ok();

            // Bring Scrollr to the foreground immediately. The browser
            // tab will show our success page (which also tries to
            // window.close()), but we don't depend on the tab closing —
            // pulling the main window forward via the OS-level window
            // activation API is what actually makes the user feel "back
            // in the app." On macOS this also activates the Scrollr
            // process so it shows in the dock as the active app.
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
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

                let request = match read_callback_request(&mut stream, &stop_requested, started_at)
                {
                    Some(r) => r,
                    None => {
                        // Connection closed before a full HTTP request arrived
                        // (preflight, dropped connection, etc.) — keep listening
                        continue;
                    }
                };

                // Only process requests to /callback — ignore favicon, prefetch,
                // and other spurious requests the browser sends.
                let first_line = request.lines().next().unwrap_or("");
                if !first_line.contains("/callback") {
                    let _ =
                        stream.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n");
                    stream.flush().ok();
                    continue;
                }

                // Extract OAuth params — Logto may return error params instead of code
                let code = extract_query_param(&request, "code");
                let state = extract_query_param(&request, "state");
                let error = extract_query_param(&request, "error");
                let error_desc = extract_query_param(&request, "error_description");

                // Respond with context-appropriate HTML. Both pages match the
                // desktop app's palette (#0a0a0a background, #bfff00 accent on
                // success, #ef4444 on failure). Both attempt window.close()
                // and provide a visible button as a fallback for browsers
                // that block JS-initiated close on tabs not opened by JS.
                let html = if error.is_some() {
                    AUTH_FAILURE_HTML
                } else {
                    AUTH_SUCCESS_HTML
                };

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
                    "error": error,
                    "error_description": error_desc,
                }));

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
    fn auth_server_ignores_favicon_and_processes_real_callback() {
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

        // Send a favicon request first — should be ignored
        {
            let mut favicon_stream = TcpStream::connect(addr).expect("connect for favicon");
            favicon_stream
                .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .expect("write favicon request");
            // Read the 204 response
            let mut buf = [0u8; 256];
            let _ = std::io::Read::read(&mut favicon_stream, &mut buf);
        }

        // Small delay to let the server loop back
        thread::sleep(Duration::from_millis(50));

        // Now send the real callback — should be processed
        {
            let mut callback_stream = TcpStream::connect(addr).expect("connect for callback");
            callback_stream
                .write_all(b"GET /callback?code=real-code&state=real-state HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .expect("write callback request");
        }

        thread.join().expect("join auth server thread");

        let payloads = payloads.lock().expect("lock payload store");
        assert_eq!(payloads.len(), 1, "should emit exactly one callback");
        assert_eq!(payloads[0]["code"], "real-code");
        assert_eq!(payloads[0]["state"], "real-state");
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
