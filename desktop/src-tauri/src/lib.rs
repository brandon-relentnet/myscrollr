use std::sync::{Arc, Mutex};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tokio::sync::watch;

// ── SSE state ────────────────────────────────────────────────────

/// Holds the cancellation handle for the background SSE task.
struct SseHandle(Mutex<Option<watch::Sender<bool>>>);

/// Tracks whether the OAuth callback server is already running.
#[derive(Clone)]
struct AuthServerRunning(Arc<Mutex<bool>>);

// ── System monitor state ─────────────────────────────────────────

/// Data that never changes between polls — cached on first call.
#[derive(Clone)]
struct StaticSystemInfo {
    cpu_name: String,
    cpu_cores: usize,
    os_name: String,
    hostname: String,
    gpu_name: Option<String>,
    gpu_vram_total: Option<u64>,
    /// Resolved GPU sysfs device path (AMD), if any.
    gpu_sysfs_device: Option<std::path::PathBuf>,
    /// Whether nvidia-smi is available (checked once).
    has_nvidia_smi: bool,
}

/// Dynamic GPU values read each poll.
#[derive(Default)]
struct GpuDynamic {
    usage: Option<f64>,
    vram_used: Option<u64>,
    power_watts: Option<f64>,
    power_cap_watts: Option<f64>,
    clock_mhz: Option<u64>,
}

/// Persistent system info instances — refreshed on each poll.
/// Wrapped in Arc so it can be sent into `spawn_blocking`.
struct SysInfoInner {
    sys: Mutex<sysinfo::System>,
    components: Mutex<sysinfo::Components>,
    networks: Mutex<sysinfo::Networks>,
    /// Populated on first poll, then reused.
    static_info: Mutex<Option<StaticSystemInfo>>,
}

struct SysInfoState(Arc<SysInfoInner>);

/// Probe GPU once: find the sysfs device path, resolve the name and
/// VRAM total, and check whether nvidia-smi is available.  Called only
/// on the first poll; the results are cached in `StaticSystemInfo`.
fn probe_gpu_static() -> (Option<std::path::PathBuf>, Option<String>, Option<u64>, bool) {
    // Try AMD/Intel sysfs first
    let mut best: Option<(std::path::PathBuf, f64)> = None;
    if let Ok(entries) = std::fs::read_dir("/sys/class/drm") {
        for entry in entries.flatten() {
            let fname = entry.file_name();
            let s = fname.to_string_lossy();
            if s.starts_with("card") && !s.contains('-') {
                let dev = entry.path().join("device");
                if let Some(usage) = read_sysfs_f64(&dev, "gpu_busy_percent") {
                    let dominated = best.as_ref().is_none_or(|(_, u)| usage > *u);
                    if dominated {
                        best = Some((dev, usage));
                    }
                }
            }
        }
    }

    if let Some((dev, _)) = best {
        let name = std::fs::read_to_string(dev.join("product_name"))
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .or_else(|| gpu_name_from_lspci(&dev));
        let vram_total = read_sysfs_u64(&dev, "mem_info_vram_total");
        return (Some(dev), name, vram_total, false);
    }

    // Fallback: try nvidia-smi once for static values
    if let Ok(out) = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if out.status.success() {
            let line = String::from_utf8_lossy(&out.stdout);
            let f: Vec<&str> = line.trim().splitn(2, ", ").collect();
            let name = f.first().map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
            let vram = f.get(1).and_then(|s| s.trim().parse::<u64>().ok()).map(|m| m * 1024 * 1024);
            return (None, name, vram, true);
        }
    }

    (None, None, None, false)
}

/// Read dynamic GPU values from sysfs (AMD/Intel).
fn read_gpu_dynamic_sysfs(dev: &std::path::Path) -> GpuDynamic {
    let (power_watts, power_cap_watts) = read_gpu_power(dev);
    GpuDynamic {
        usage: read_sysfs_f64(dev, "gpu_busy_percent"),
        vram_used: read_sysfs_u64(dev, "mem_info_vram_used"),
        power_watts,
        power_cap_watts,
        clock_mhz: read_gpu_clock(dev),
    }
}

/// Read dynamic GPU values from nvidia-smi.
fn read_gpu_dynamic_nvidia() -> GpuDynamic {
    if let Ok(out) = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=utilization.gpu,memory.used,power.draw,power.limit,clocks.current.graphics",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if out.status.success() {
            let line = String::from_utf8_lossy(&out.stdout);
            let f: Vec<&str> = line.trim().splitn(5, ", ").collect();
            return GpuDynamic {
                usage: f.first().and_then(|s| s.trim().parse().ok()),
                vram_used: f.get(1).and_then(|s| s.trim().parse::<u64>().ok()).map(|m| m * 1024 * 1024),
                power_watts: f.get(2).and_then(|s| s.trim().parse().ok()),
                power_cap_watts: f.get(3).and_then(|s| s.trim().parse().ok()),
                clock_mhz: f.get(4).and_then(|s| s.trim().parse().ok()),
            };
        }
    }
    GpuDynamic::default()
}

/// Read GPU power from hwmon (microwatts → watts).
fn read_gpu_power(dev: &std::path::Path) -> (Option<f64>, Option<f64>) {
    // hwmon directory under the device contains power1_average / power1_cap
    let hwmon_dir = dev.join("hwmon");
    let entries = match std::fs::read_dir(&hwmon_dir) {
        Ok(e) => e,
        Err(_) => return (None, None),
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        let avg = read_sysfs_u64(&dir, "power1_average").map(|uw| uw as f64 / 1_000_000.0);
        let cap = read_sysfs_u64(&dir, "power1_cap").map(|uw| uw as f64 / 1_000_000.0);
        if avg.is_some() {
            return (avg, cap);
        }
    }
    (None, None)
}

/// Parse the active GPU clock from pp_dpm_sclk (AMD sysfs).
/// Lines look like: "0: 500Mhz", "1: 1415Mhz *" — the active state has *.
fn read_gpu_clock(dev: &std::path::Path) -> Option<u64> {
    let content = std::fs::read_to_string(dev.join("pp_dpm_sclk")).ok()?;
    for line in content.lines() {
        if line.contains('*') {
            // Extract number before "Mhz"
            return line.split_whitespace()
                .find(|w| w.ends_with("Mhz"))
                .and_then(|w| w.trim_end_matches("Mhz").parse().ok());
        }
    }
    None
}

/// Read a u64 from a sysfs file.
fn read_sysfs_u64(dir: &std::path::Path, name: &str) -> Option<u64> {
    std::fs::read_to_string(dir.join(name))
        .ok()
        .and_then(|v| v.trim().parse().ok())
}

/// Read an f64 from a sysfs file.
fn read_sysfs_f64(dir: &std::path::Path, name: &str) -> Option<f64> {
    std::fs::read_to_string(dir.join(name))
        .ok()
        .and_then(|v| v.trim().parse().ok())
}

/// Read the max CPU frequency across all cores (kHz → MHz).
fn read_cpu_freq_mhz() -> Option<u64> {
    let mut max_khz: u64 = 0;
    if let Ok(entries) = std::fs::read_dir("/sys/devices/system/cpu") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("cpu") && s[3..].chars().all(|c| c.is_ascii_digit()) {
                if let Some(khz) = read_sysfs_u64(
                    &entry.path().join("cpufreq"),
                    "scaling_cur_freq",
                ) {
                    if khz > max_khz {
                        max_khz = khz;
                    }
                }
            }
        }
    }
    if max_khz > 0 { Some(max_khz / 1000) } else { None }
}

/// Resolve a GPU's marketing name via `lspci -vmms <slot>`.
/// Reads the PCI slot from the device's `uevent` file, then parses the
/// `SDevice` line (specific product name) with a fallback to `Device`.
fn gpu_name_from_lspci(dev_path: &std::path::Path) -> Option<String> {
    let uevent = std::fs::read_to_string(dev_path.join("uevent")).ok()?;
    let slot = uevent
        .lines()
        .find_map(|l| l.strip_prefix("PCI_SLOT_NAME="))?;

    let out = std::process::Command::new("lspci")
        .args(["-vmms", slot])
        .output()
        .ok()?;

    if !out.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&out.stdout);

    // Prefer SDevice (e.g. "NITRO+ RX 7900 XTX Vapor-X") over the
    // generic Device line, but skip placeholder values like "Device XXXX".
    let sdevice = extract_lspci_field(&text, "SDevice");
    if let Some(ref sd) = sdevice {
        let low = sd.to_lowercase();
        if !low.starts_with("device ") && !low.is_empty() {
            return sdevice;
        }
    }

    extract_lspci_field(&text, "Device")
}

/// Parse a single "Key:\tValue" field from `lspci -vmm` output.
fn extract_lspci_field(text: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:\t");
    text.lines()
        .find_map(|l| l.strip_prefix(&prefix))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

/// Return a snapshot of CPU, memory, GPU, temperatures, network, and
/// system metadata.  Static values (names, totals, OS info) are cached
/// on first call.  Runs on a blocking thread to keep the IPC loop free.
#[tauri::command]
async fn get_system_info(
    state: tauri::State<'_, SysInfoState>,
) -> Result<serde_json::Value, String> {
    let inner = state.0.clone();
    tokio::task::spawn_blocking(move || get_system_info_blocking(&inner))
        .await
        .map_err(|e| format!("spawn_blocking: {e}"))?
}

/// All the actual work — runs inside `spawn_blocking`.
fn get_system_info_blocking(inner: &SysInfoInner) -> Result<serde_json::Value, String> {
    let mut sys = inner.sys.lock().map_err(|e| format!("lock: {e}"))?;
    let mut components = inner.components.lock().map_err(|e| format!("lock: {e}"))?;
    let mut networks = inner.networks.lock().map_err(|e| format!("lock: {e}"))?;

    sys.refresh_cpu_usage();
    sys.refresh_memory();
    components.refresh(false);
    networks.refresh(false);

    // ── Static info (cached after first poll) ────────────────────
    let mut static_guard = inner.static_info.lock().map_err(|e| format!("lock: {e}"))?;
    let cached = static_guard.get_or_insert_with(|| {
        let cpu_name = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
        let cpu_cores = sys.cpus().len();
        let os_name = format!(
            "{} {}",
            sysinfo::System::name().unwrap_or_default(),
            sysinfo::System::os_version().unwrap_or_default(),
        );
        let hostname = sysinfo::System::host_name().unwrap_or_default();
        let (gpu_sysfs_device, gpu_name, gpu_vram_total, has_nvidia_smi) = probe_gpu_static();

        StaticSystemInfo {
            cpu_name,
            cpu_cores,
            os_name,
            hostname,
            gpu_name,
            gpu_vram_total,
            gpu_sysfs_device,
            has_nvidia_smi,
        }
    });
    let st = cached.clone();
    drop(static_guard);

    // ── Dynamic CPU ──────────────────────────────────────────────
    let cpu_usage = if st.cpu_cores == 0 {
        0.0
    } else {
        let total: f32 = sys.cpus().iter().map(|c| c.cpu_usage()).sum();
        (total / st.cpu_cores as f32) as f64
    };
    let cpu_freq_mhz = read_cpu_freq_mhz();

    // ── Dynamic GPU ──────────────────────────────────────────────
    let gpu = if let Some(ref dev) = st.gpu_sysfs_device {
        read_gpu_dynamic_sysfs(dev)
    } else if st.has_nvidia_smi {
        read_gpu_dynamic_nvidia()
    } else {
        GpuDynamic::default()
    };

    // ── Temperatures ─────────────────────────────────────────────
    let comp_info: Vec<serde_json::Value> = components
        .iter()
        .filter(|c| c.temperature().is_some_and(|t| t > 0.0))
        .map(|c| {
            serde_json::json!({
                "label": c.label(),
                "temp": c.temperature().unwrap_or(0.0),
                "max": c.max().unwrap_or(0.0),
                "critical": c.critical(),
            })
        })
        .collect();

    // ── Memory (read before dropping sys lock) ─────────────────
    let mem_total = sys.total_memory();
    let mem_used = sys.used_memory();

    // ── Network ──────────────────────────────────────────────────
    let net_info: Vec<serde_json::Value> = networks
        .iter()
        .filter(|(name, data)| {
            if name.starts_with("lo") { return false; }
            if name.starts_with("docker")
                || name.starts_with("veth")
                || name.starts_with("br-")
                || name.starts_with("virbr")
            {
                return false;
            }
            data.received() > 0 || data.transmitted() > 0
                || data.total_received() > 0
        })
        .map(|(name, data)| {
            serde_json::json!({
                "name": name,
                "rxBytes": data.received(),
                "txBytes": data.transmitted(),
            })
        })
        .collect();

    Ok(serde_json::json!({
        "cpuName": st.cpu_name,
        "cpuCores": st.cpu_cores,
        "cpuUsage": cpu_usage,
        "cpuFreqMhz": cpu_freq_mhz,
        "gpuName": st.gpu_name,
        "gpuUsage": gpu.usage,
        "gpuVramTotal": st.gpu_vram_total,
        "gpuVramUsed": gpu.vram_used,
        "gpuPowerWatts": gpu.power_watts,
        "gpuPowerCapWatts": gpu.power_cap_watts,
        "gpuClockMhz": gpu.clock_mhz,
        "memTotal": mem_total,
        "memUsed": mem_used,
        "osName": st.os_name,
        "hostname": st.hostname,
        "uptime": sysinfo::System::uptime(),
        "components": comp_info,
        "network": net_info,
    }))
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

    // Prevent multiple concurrent auth servers
    let running = app.state::<AuthServerRunning>();
    {
        let mut guard = running.0.lock().unwrap();
        if *guard {
            return Err("Auth server already running".into());
        }
        *guard = true;
    }

    // Bind first (on the calling thread) so we know the port is available
    // before opening the browser.
    let listener = TcpListener::bind("127.0.0.1:19284").map_err(|e| {
        *running.0.lock().unwrap() = false;
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
        *running_handle.0.lock().unwrap() = false;
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
    // Validate inputs
    if position != "top" && position != "bottom" {
        return Err(format!("invalid position: {position}"));
    }
    if let Some(h) = height {
        if !h.is_finite() || h < 1.0 || h > 10_000.0 {
            return Err("height out of range".into());
        }
    }

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

/// Look up a Hyprland client by window title and return its address field.
fn hyprland_find_address(window: &tauri::Window) -> Result<(String, Vec<serde_json::Value>), String> {
    let title = window.title().unwrap_or_default();

    let output = std::process::Command::new("hyprctl")
        .args(["clients", "-j"])
        .output()
        .map_err(|e| format!("hyprctl failed: {e}"))?;

    let clients: Vec<serde_json::Value> =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("parse error: {e}"))?;

    for client in &clients {
        if client["title"].as_str().unwrap_or("") == title {
            let addr = client["address"]
                .as_str()
                .ok_or("no address field")?
                .to_string();
            return Ok((addr, clients));
        }
    }

    Err("window not found in hyprctl clients".into())
}

/// Hyprland: move + resize via `hyprctl dispatch`.
fn position_hyprland(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let (addr, _) = hyprland_find_address(window)?;

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

    Ok(())
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

/// Load, run, and clean up a one-shot KWin script via D-Bus.
/// Used by both `position_kwin` and `pin_kwin` to avoid duplicating
/// the load → run → stop → unload → delete-temp-file boilerplate.
fn run_kwin_script(qdbus: &str, script_content: &str, script_name: &str) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!("{script_name}.js"));
    std::fs::write(&tmp, script_content).map_err(|e| format!("write temp script: {e}"))?;
    let tmp_path = tmp.to_str().ok_or("invalid temp path")?;

    // Unload any previous instance (ignore errors — may not exist)
    std::process::Command::new(qdbus)
        .args([
            "org.kde.KWin",
            "/Scripting",
            "org.kde.kwin.Scripting.unloadScript",
            script_name,
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
            script_name,
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
            script_name,
        ])
        .output()
        .ok();

    std::fs::remove_file(&tmp).ok();
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

    run_kwin_script(qdbus, &script, "scrollr_pos")
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
    let (addr, clients) = hyprland_find_address(window)?;

    // Find the current pinned state from the already-fetched client list
    let currently_pinned = clients
        .iter()
        .find(|c| c["title"].as_str().unwrap_or("") == title)
        .and_then(|c| c["pinned"].as_bool())
        .unwrap_or(false);

    if currently_pinned != desired {
        std::process::Command::new("hyprctl")
            .args(["dispatch", "pin", &format!("address:{addr}")])
            .output()
            .map_err(|e| format!("hyprctl dispatch failed: {e}"))?;
    }

    Ok(())
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

    run_kwin_script(qdbus, &script, "scrollr_pin")
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
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| format!("show failed: {e}"))?;
        w.set_focus().map_err(|e| format!("focus failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    // Windows: claim the main thread for STA (Single-Threaded Apartment)
    // mode before any plugin can initialize COM in MTA mode. Plugins like
    // tauri-plugin-http (via native-tls/WinHTTP) and tauri-plugin-mcp-bridge
    // (via WebSocket server) can trigger MTA initialization, which conflicts
    // with tao's OleInitialize requirement for drag-and-drop support.
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
        unsafe {
            CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(5_000_000) // 5 MB per log file
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // Focus the main window when a second instance is attempted
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));

    // MCP bridge is dev-only and excluded on Windows — its WebSocket
    // server is architecturally incompatible with Windows COM threading.
    #[cfg(all(debug_assertions, not(target_os = "windows")))]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(SseHandle(Mutex::new(None)))
        .manage(AuthServerRunning(Arc::new(Mutex::new(false))))
        .manage(SysInfoState(Arc::new(SysInfoInner {
            sys: Mutex::new(sysinfo::System::new()),
            components: Mutex::new(sysinfo::Components::new_with_refreshed_list()),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            static_info: Mutex::new(None),
        })))
        .invoke_handler(tauri::generate_handler![
            position_ticker,
            pin_window,
            start_auth_server,
            start_sse,
            stop_sse,
            show_app_window,
            quit_app,
            get_system_info,
        ])
        .on_window_event(|window, event| {
            // Intercept close on both windows — hide instead of destroy.
            // Only tray "Quit" or context menu "Quit" actually exits.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "main" || label == "ticker" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            // ── Ticker window setup ──────────────────────────────
            if let Some(ticker) = app.get_webview_window("ticker") {
                // Set initial ticker width to fill screen
                if let Ok(Some(monitor)) = ticker.current_monitor() {
                    let scale = monitor.scale_factor();
                    let screen_width = monitor.size().width as f64 / scale;
                    let _ = ticker.set_size(tauri::LogicalSize::new(screen_width, 200.0));
                }

                let _ = ticker.show();
            } else {
                log::error!("Failed to create ticker window — continuing without it");
            }

            // ── App window: strip native chrome on Linux/Windows ─
            // macOS keeps native decorations (traffic lights). On
            // other platforms we use our custom TitleBar component.
            #[cfg(not(target_os = "macos"))]
            if let Some(app_win) = app.get_webview_window("main") {
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
                        if let Some(w) = app.get_webview_window("main") {
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
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
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
