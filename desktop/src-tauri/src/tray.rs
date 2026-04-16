use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

/// Build the system tray with menu items and event handlers.
pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItemBuilder::with_id("open", "Open Scrollr").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle_ticker = MenuItemBuilder::with_id("toggle_ticker", "Toggle Ticker").build(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let report_bug = MenuItemBuilder::with_id("report_bug", "Report a Bug").build(app)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[
            &open,
            &sep1,
            &toggle_ticker,
            &sep2,
            &report_bug,
            &sep3,
            &quit,
        ])
        .build()?;

    // Monochrome icon for the system tray. On macOS, icon_as_template(true)
    // tells the OS to tint it white/black to match the menu bar appearance.
    let tray_icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .map_err(|e| format!("failed to load tray icon: {e}"))?;

    TrayIconBuilder::new()
        .tooltip("Scrollr")
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "toggle_ticker" => {
                // Emit an event so JS can toggle the showTicker preference,
                // which is the single source of truth for ticker visibility.
                let _ = app.emit("toggle-ticker", ());
            }
            "report_bug" => {
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.show();
                    let _ = main.set_focus();
                }
                let _ = app.emit("navigate-to", "/support");
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
}
