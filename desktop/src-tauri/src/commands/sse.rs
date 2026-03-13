use crate::state::SseHandle;
use tauri::{Emitter, Manager};
use tokio::sync::watch;

/// Connect to the SSE endpoint and stream CDC events to the webview.
/// Cancels any existing SSE connection first. Runs in a background
/// tokio task with automatic reconnection and exponential backoff.
#[tauri::command]
pub async fn start_sse(app: tauri::AppHandle, token: String, api_base: String) -> Result<(), String> {
    // Cancel any existing connection
    stop_sse_internal(&app);

    let (cancel_tx, cancel_rx) = watch::channel(false);
    {
        let state = app.state::<SseHandle>();
        *state.0.lock().map_err(|e| format!("lock: {e}"))? = Some(cancel_tx);
    }

    let sse_url = format!("{}/events", api_base.trim_end_matches('/'));
    tokio::spawn(sse_loop(app, token, sse_url, cancel_rx));
    Ok(())
}

/// Disconnect from the SSE endpoint.
#[tauri::command]
pub async fn stop_sse(app: tauri::AppHandle) -> Result<(), String> {
    stop_sse_internal(&app);
    app.emit("sse-status", serde_json::json!({ "status": "disconnected" })).ok();
    Ok(())
}

fn stop_sse_internal(app: &tauri::AppHandle) {
    let state = app.state::<SseHandle>();
    let sender = state.0.lock().unwrap_or_else(|p| p.into_inner()).take();
    if let Some(tx) = sender {
        let _ = tx.send(true);
    }
}

/// Main SSE loop: connect → stream → reconnect on error.
async fn sse_loop(
    app: tauri::AppHandle,
    token: String,
    sse_url: String,
    mut cancel_rx: watch::Receiver<bool>,
) {
    use futures_util::StreamExt;

    let client = reqwest::Client::new();
    let mut backoff_secs = 1u64;

    loop {
        if *cancel_rx.borrow() {
            break;
        }

        let response = client
            .get(&sse_url)
            .header("Accept", "text/event-stream")
            .header("Authorization", format!("Bearer {token}"))
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
