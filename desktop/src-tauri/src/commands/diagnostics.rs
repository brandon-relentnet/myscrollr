use serde::{Deserialize, Serialize};
use sysinfo::System;
use tauri::{AppHandle, Manager};

use crate::state;

// ── Types ───────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticReport {
    app: AppMetadata,
    system: SystemInfo,
    environment: EnvironmentInfo,
    windows: WindowsState,
    runtime: RuntimeState,
    logs: LogInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppMetadata {
    version: String,
    tauri_version: String,
    platform: String,
    arch: String,
    build_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuInfo {
    model: String,
    cores: usize,
    frequency_mhz: Option<u64>,
    usage_percent: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GpuInfo {
    model: Option<String>,
    vram_total_bytes: Option<u64>,
    vram_used_bytes: Option<u64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryInfo {
    ram_total_bytes: u64,
    ram_used_bytes: u64,
    swap_total_bytes: u64,
    swap_used_bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    cpu: CpuInfo,
    gpu: GpuInfo,
    memory: MemoryInfo,
    os_name: String,
    /// Stable anonymous identifier derived from the real hostname via
    /// a non-cryptographic hash. We deliberately do NOT send the raw
    /// hostname because it frequently contains the user's real name
    /// (`Jane's MacBook Pro`) or a workplace asset tag. The hash is
    /// stable across diagnostic reports for the same machine, so
    /// multiple reports from one user can still be correlated.
    hostname_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorInfo {
    name: Option<String>,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentInfo {
    desktop_environment: Option<String>,
    session_type: String,
    monitors: Vec<MonitorInfo>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    label: String,
    position_x: i32,
    position_y: i32,
    width: u32,
    height: u32,
    visible: bool,
    always_on_top: bool,
    decorated: bool,
    maximized: bool,
    minimized: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowsState {
    ticker: Option<WindowState>,
    main: Option<WindowState>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeState {
    auth_server_running: bool,
    sse_active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LogInfo {
    log_file_path: Option<String>,
    recent_lines: Vec<String>,
}

// ── Helpers ─────────────────────────────────────────────────────

fn get_window_state(app: &AppHandle, label: &str) -> Option<WindowState> {
    let win = app.get_webview_window(label)?;
    let pos = win.outer_position().ok()?;
    let size = win.outer_size().ok()?;
    let visible = win.is_visible().unwrap_or(false);
    let always_on_top = win.is_always_on_top().unwrap_or(false);
    let decorated = win.is_decorated().unwrap_or(true);
    let maximized = win.is_maximized().unwrap_or(false);
    let minimized = win.is_minimized().unwrap_or(false);

    Some(WindowState {
        label: label.to_string(),
        position_x: pos.x,
        position_y: pos.y,
        width: size.width,
        height: size.height,
        visible,
        always_on_top,
        decorated,
        maximized,
        minimized,
    })
}

fn get_session_type() -> String {
    if cfg!(target_os = "macos") {
        return "macOS".to_string();
    }
    if cfg!(target_os = "windows") {
        return "Windows".to_string();
    }
    std::env::var("XDG_SESSION_TYPE").unwrap_or_else(|_| "unknown".to_string())
}

fn get_desktop_environment() -> Option<String> {
    if cfg!(target_os = "macos") || cfg!(target_os = "windows") {
        return None;
    }
    std::env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| std::env::var("DESKTOP_SESSION"))
        .ok()
}

fn read_log_tail(app: &AppHandle, max_lines: usize) -> LogInfo {
    let log_dir = app.path().app_log_dir().ok();
    let log_path = log_dir.map(|d| d.join(format!("{}.log", app.package_info().name)));

    let (path_str, lines) = match &log_path {
        Some(p) if p.exists() => {
            let content = std::fs::read_to_string(p).unwrap_or_default();
            let all_lines: Vec<String> = content.lines().map(String::from).collect();
            let start = all_lines.len().saturating_sub(max_lines);
            (
                Some(p.to_string_lossy().to_string()),
                all_lines[start..].to_vec(),
            )
        }
        Some(p) => (Some(p.to_string_lossy().to_string()), vec![]),
        None => (None, vec![]),
    };

    LogInfo {
        log_file_path: path_str,
        recent_lines: lines,
    }
}

// ── Command ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn collect_diagnostics(app: AppHandle) -> Result<DiagnosticReport, String> {
    let sysinfo_state = app.state::<state::SysInfoState>();
    let inner = &sysinfo_state.0;

    // Refresh system info
    {
        let mut sys = inner.sys.lock().map_err(|e| format!("sysinfo lock: {e}"))?;
        sys.refresh_cpu_all();
        sys.refresh_memory();
    }

    let sys = inner.sys.lock().map_err(|e| format!("sysinfo lock: {e}"))?;

    // CPU info
    let cpu_usage = if sys.cpus().is_empty() {
        0.0
    } else {
        sys.cpus().iter().map(|c| c.cpu_usage() as f64).sum::<f64>() / sys.cpus().len() as f64
    };

    let cpu = CpuInfo {
        model: sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default(),
        cores: sys.cpus().len(),
        frequency_mhz: sys.cpus().first().map(|c| c.frequency()),
        usage_percent: (cpu_usage * 10.0).round() / 10.0,
    };

    // GPU info (from cached static info)
    let static_info = inner.static_info.lock().map_err(|e| format!("static lock: {e}"))?;
    let gpu = GpuInfo {
        model: static_info.as_ref().and_then(|s| s.gpu_name.clone()),
        vram_total_bytes: static_info.as_ref().and_then(|s| s.gpu_vram_total),
        vram_used_bytes: None,
    };

    // Memory
    let memory = MemoryInfo {
        ram_total_bytes: sys.total_memory(),
        ram_used_bytes: sys.used_memory(),
        swap_total_bytes: sys.total_swap(),
        swap_used_bytes: sys.used_swap(),
    };

    // OS info
    let os_name = format!(
        "{} {}",
        System::name().unwrap_or_default(),
        System::os_version().unwrap_or_default()
    );
    // Anonymize hostname via DefaultHasher (std-only, no new deps).
    // Stable per-machine, reveals nothing about the original value.
    let hostname_hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let raw = System::host_name().unwrap_or_default();
        if raw.is_empty() {
            String::new()
        } else {
            let mut hasher = DefaultHasher::new();
            raw.hash(&mut hasher);
            format!("{:016x}", hasher.finish())
        }
    };

    drop(sys);
    drop(static_info);

    // Environment
    let monitors: Vec<MonitorInfo> = app
        .available_monitors()
        .map(|list| {
            list.into_iter()
                .map(|m| {
                    let size = m.size();
                    MonitorInfo {
                        name: m.name().map(String::from),
                        width: size.width,
                        height: size.height,
                        scale_factor: m.scale_factor(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let environment = EnvironmentInfo {
        desktop_environment: get_desktop_environment(),
        session_type: get_session_type(),
        monitors,
    };

    // Window state
    let windows = WindowsState {
        ticker: get_window_state(&app, "ticker"),
        main: get_window_state(&app, "main"),
    };

    // Runtime state
    let auth_running = app
        .state::<state::AuthServerRunning>()
        .0
        .lock()
        .map(|v| *v)
        .unwrap_or(false);

    let sse_active = app
        .state::<state::SseHandle>()
        .0
        .lock()
        .map(|h| h.is_some())
        .unwrap_or(false);

    let runtime = RuntimeState {
        auth_server_running: auth_running,
        sse_active,
    };

    // Logs
    let logs = read_log_tail(&app, 200);

    // App metadata
    let app_meta = AppMetadata {
        version: app.package_info().version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        build_type: if cfg!(debug_assertions) { "debug" } else { "release" }.to_string(),
    };

    Ok(DiagnosticReport {
        app: app_meta,
        system: SystemInfo {
            cpu,
            gpu,
            memory,
            os_name,
            hostname_hash,
        },
        environment,
        windows,
        runtime,
        logs,
    })
}

// ── Logout-event diagnostics ─────────────────────────────────────
//
// Background: in v1.0.5 we shipped a fix for a multi-window refresh-
// token rotation race that was logging users out periodically. The fix
// targets one of several plausible auth-clearing paths. To verify it
// worked (and surface any remaining paths firing), v1.0.6 instruments
// every clearAuth() call in auth.ts to record what triggered the
// clear, then writes the event to a JSON file in the Tauri app data
// dir.
//
// This is developer-facing: there is no Settings UI for the events.
// To retrieve them:
//   1. Locate the file: ~/Library/Application Support/com.myscrollr.scrollr/logout-events.json
//      (macOS path; analogous on Windows/Linux per dirs::data_dir())
//   2. Or call read_logout_events() from devtools console:
//      await invoke("read_logout_events")
//
// The file is rotated to keep the last LOGOUT_EVENT_LIMIT entries.

const LOGOUT_EVENT_FILENAME: &str = "logout-events.json";
const LOGOUT_EVENT_LIMIT: usize = 50;

#[derive(Serialize, Deserialize, Clone)]
pub struct LogoutEvent {
    /// ISO-8601 timestamp at which clearAuth was called.
    pub timestamp: String,
    /// One of: refresh_4xx_no_recovery, no_refresh_token, explicit_signout,
    /// dashboard_unauthenticated_sync, session_expired_banner,
    /// network_error, unknown.
    pub path: String,
    /// Which Tauri window fired it: "main", "ticker", or "unknown".
    pub window: String,
    /// Snapshot of additional context the JS side wants to attach
    /// (e.g. truncated stack, JWT expiry timestamps, network status).
    /// Free-form to keep the schema flexible across future paths.
    pub context: serde_json::Value,
}

fn logout_events_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("mkdir app_data_dir: {e}"))?;
    }
    Ok(dir.join(LOGOUT_EVENT_FILENAME))
}

fn read_events_file(path: &std::path::Path) -> Vec<LogoutEvent> {
    match std::fs::read_to_string(path) {
        Ok(s) if !s.is_empty() => serde_json::from_str::<Vec<LogoutEvent>>(&s).unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn write_events_file(path: &std::path::Path, events: &[LogoutEvent]) -> Result<(), String> {
    let body = serde_json::to_string_pretty(events).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(path, body).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

/// Append a logout event to the local diagnostics file. Called from
/// the JS auth.ts whenever clearAuth() fires so we can correlate
/// observed logouts with the path that triggered them.
#[tauri::command]
pub fn record_logout_event(app: AppHandle, event: LogoutEvent) -> Result<(), String> {
    let path = logout_events_path(&app)?;
    let mut events = read_events_file(&path);
    events.push(event);

    // Rotate: keep only the most recent LOGOUT_EVENT_LIMIT entries.
    let len = events.len();
    if len > LOGOUT_EVENT_LIMIT {
        events = events.split_off(len - LOGOUT_EVENT_LIMIT);
    }

    write_events_file(&path, &events)
}

/// Read all stored logout events. Called from devtools / diagnostics
/// flow to dump the history. Returns the events newest-last.
#[tauri::command]
pub fn read_logout_events(app: AppHandle) -> Result<Vec<LogoutEvent>, String> {
    let path = logout_events_path(&app)?;
    Ok(read_events_file(&path))
}
