use crate::compositor::{self, Compositor};
use tauri::Manager;

/// Snap the ticker window to a screen edge and stretch it to full monitor width.
/// Sets x = monitor left edge, width = monitor width, y = top or bottom edge.
///
/// Wayland compositors ignore GTK's `set_position()` and may ignore `set_size()`.
/// We detect the compositor and use native IPC:
///   Hyprland → `hyprctl dispatch movewindowpixel` + `resizewindowpixel`
///   Sway     → `swaymsg move absolute position` + `resize set`
///   KDE/KWin → `qdbus6` D-Bus scripting API → frameGeometry
///   Fallback → GTK set_size + set_position (works on macOS/Windows/X11)
#[tauri::command]
pub fn position_ticker(
    window: tauri::Window,
    position: String,
    height: Option<f64>,
) -> Result<(), String> {
    // Validate inputs
    if position != "top" && position != "bottom" {
        return Err(format!("invalid position: {position}"));
    }
    if let Some(h) = height {
        if !h.is_finite() || !(1.0..=10_000.0).contains(&h) {
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
    match compositor::detect() {
        Compositor::Hyprland => {
            compositor::hyprland::position(&window, monitor_x, new_y, screen_width, win_height)
        }
        Compositor::Sway => {
            compositor::sway::position(&window, monitor_x, new_y, screen_width, win_height)
        }
        Compositor::Kwin(qdbus) => {
            compositor::kwin::position(&window, monitor_x, new_y, screen_width, win_height, qdbus)
        }
        Compositor::Fallback => {
            // GTK (macOS, Windows, X11, GNOME)
            let _ = window.set_size(tauri::LogicalSize::new(screen_width, win_height));
            window
                .set_position(tauri::LogicalPosition::new(monitor_x, new_y))
                .map_err(|e| format!("set_position failed: {e}"))
        }
    }
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
pub fn pin_window(window: tauri::Window, pinned: bool) -> Result<(), String> {
    match compositor::detect() {
        Compositor::Hyprland => compositor::hyprland::pin(&window, pinned),
        Compositor::Sway => compositor::sway::pin(&window, pinned),
        Compositor::Kwin(qdbus) => compositor::kwin::pin(&window, pinned, qdbus),
        Compositor::Fallback => window
            .set_always_on_top(pinned)
            .map_err(|e| format!("set_always_on_top failed: {e}")),
    }
}

#[tauri::command]
pub fn show_app_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        w.show().map_err(|e| format!("show failed: {e}"))?;
        w.set_focus().map_err(|e| format!("focus failed: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
