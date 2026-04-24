mod commands;
mod compositor;
mod state;
mod tray;

use std::sync::{atomic::AtomicBool, Arc, Mutex};
use tauri::Manager;

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
        .plugin(
            tauri_plugin_updater::Builder::new()
                // Allow same-version updates so patched rebuilds (same version,
                // new binary) are detected. The JS side filters out false
                // positives by comparing pub_date against a stored value.
                .default_version_comparator(|current, remote| remote.version >= current)
                .build(),
        )
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

    // MCP bridge is opt-in (feature `dev-mcp-bridge`), dev-only, and
    // excluded on Windows — its WebSocket server is architecturally
    // incompatible with Windows COM threading. Release builds never
    // link the crate at all; development builds only pull it in when
    // explicitly enabled with `--features dev-mcp-bridge`.
    #[cfg(all(
        feature = "dev-mcp-bridge",
        debug_assertions,
        not(target_os = "windows")
    ))]
    {
        builder = builder.plugin(tauri_plugin_mcp_bridge::init());
    }

    builder
        .manage(state::SseHandle(Mutex::new(None)))
        .manage(state::AuthServerRunning(Arc::new(Mutex::new(false))))
        .manage(state::AuthServerStop(Arc::new(AtomicBool::new(false))))
        .manage(state::SysInfoState(Arc::new(state::SysInfoInner {
            sys: Mutex::new(sysinfo::System::new()),
            components: Mutex::new(sysinfo::Components::new_with_refreshed_list()),
            networks: Mutex::new(sysinfo::Networks::new_with_refreshed_list()),
            static_info: Mutex::new(None),
        })))
        .invoke_handler(tauri::generate_handler![
            commands::window::position_ticker,
            commands::window::pin_window,
            commands::auth::start_auth_server,
            commands::auth::stop_auth_server,
            commands::sse::start_sse,
            commands::sse::stop_sse,
            commands::window::show_app_window,
            commands::window::quit_app,
            commands::system_info::get_system_info,
            commands::diagnostics::collect_diagnostics,
            tray::sync_tray_pin,
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
            // Size the ticker to fill the screen width. Visibility is
            // managed by the JS side based on the showTicker preference;
            // tauri.conf.json starts the window with `visible: false`.
            if let Some(ticker) = app.get_webview_window("ticker") {
                if let Ok(Some(monitor)) = ticker.current_monitor() {
                    let scale = monitor.scale_factor();
                    let screen_width = monitor.size().width as f64 / scale;
                    let _ = ticker.set_size(tauri::LogicalSize::new(screen_width, 200.0));
                }
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
            tray::setup(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
