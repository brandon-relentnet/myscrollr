pub mod hyprland;
pub mod kwin;
pub mod sway;

/// Which Wayland compositor (if any) is managing the session.
pub enum Compositor {
    Hyprland,
    Sway,
    Kwin(String), // path to qdbus binary
    Fallback,
}

/// Detect the running compositor from environment variables.
pub fn detect() -> Compositor {
    if std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok() {
        return Compositor::Hyprland;
    }
    if std::env::var("SWAYSOCK").is_ok() {
        return Compositor::Sway;
    }
    if is_kde() {
        if let Some(qdbus) = find_qdbus() {
            return Compositor::Kwin(qdbus);
        }
    }
    Compositor::Fallback
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

/// Load, run, and clean up a one-shot KWin script via D-Bus.
/// Used by both position and pin operations to avoid duplicating
/// the load → run → stop → unload → delete-temp-file boilerplate.
pub fn run_kwin_script(qdbus: &str, script_content: &str, script_name: &str) -> Result<(), String> {
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
