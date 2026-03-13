/// Sway: `move absolute position` + `resize set` for floating windows.
pub fn position(
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

/// Sway: `sticky` enables/disables always-visible-on-all-workspaces.
pub fn pin(window: &tauri::Window, pinned: bool) -> Result<(), String> {
    let title = window.title().unwrap_or_default();
    let action = if pinned {
        "sticky enable"
    } else {
        "sticky disable"
    };

    std::process::Command::new("swaymsg")
        .arg(format!("[title=\"{title}\"] {action}"))
        .output()
        .map_err(|e| format!("swaymsg failed: {e}"))?;

    Ok(())
}
