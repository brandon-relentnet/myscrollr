/// Look up a Hyprland client by window title and return its address field.
pub fn find_address(window: &tauri::Window) -> Result<(String, Vec<serde_json::Value>), String> {
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
pub fn position(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let (addr, _) = find_address(window)?;

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

/// Hyprland: `pin` is a toggle, so we query current state first.
pub fn pin(window: &tauri::Window, desired: bool) -> Result<(), String> {
    let title = window.title().unwrap_or_default();
    let (addr, clients) = find_address(window)?;

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
