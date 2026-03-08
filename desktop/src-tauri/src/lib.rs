use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// Resize the window height, preserving current width.
/// Called from JS during drag-resize and collapse/expand.
#[tauri::command]
fn resize_window(window: tauri::Window, height: f64) {
    if let Ok(size) = window.outer_size() {
        let scale = window.scale_factor().unwrap_or(1.0);
        let current_width = size.width as f64 / scale;
        let _ = window.set_size(tauri::LogicalSize::new(current_width, height));
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![resize_window])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();

            // Allow the window to collapse to just the 32px header
            let _ = window.set_min_size(Some(tauri::LogicalSize::new(200.0, 32.0)));

            // Set initial window width to fill screen
            if let Ok(Some(monitor)) = window.current_monitor() {
                let scale = monitor.scale_factor();
                let screen_width = monitor.size().width as f64 / scale;
                let _ = window.set_size(tauri::LogicalSize::new(screen_width, 200.0));
            }

            let _ = window.show();

            // System tray
            let show = MenuItemBuilder::with_id("show", "Show/Hide").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&show, &quit]).build()?;

            let window_clone = window.clone();
            TrayIconBuilder::new()
                .tooltip("Scrollr")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
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
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if window_clone.is_visible().unwrap_or(false) {
                            let _ = window_clone.hide();
                        } else {
                            let _ = window_clone.show();
                            let _ = window_clone.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
