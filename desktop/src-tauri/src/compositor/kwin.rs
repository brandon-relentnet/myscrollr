use super::run_kwin_script;

/// Escape a window title for safe interpolation into a KWin JavaScript string.
/// Prevents script injection via crafted window titles. Covers all JS string
/// terminators including null bytes and Unicode line separators.
fn escape_title_js(title: &str) -> String {
    title
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\0', "\\0")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// KDE/KWin: inject a KWin script that sets the full `frameGeometry` via D-Bus.
pub fn position(
    window: &tauri::Window,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    qdbus: &str,
) -> Result<(), String> {
    let title = escape_title_js(&window.title().unwrap_or_default());
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
    let title = escape_title_js(&window.title().unwrap_or_default());
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
