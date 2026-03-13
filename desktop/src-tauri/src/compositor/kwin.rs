use super::run_kwin_script;

/// KDE/KWin: inject a KWin script that sets the full `frameGeometry` via D-Bus.
pub fn position(
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

/// KDE/KWin: inject a temporary KWin script via D-Bus that sets keepAbove.
pub fn pin(window: &tauri::Window, pinned: bool, qdbus: &str) -> Result<(), String> {
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
