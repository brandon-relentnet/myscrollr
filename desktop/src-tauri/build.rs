fn main() {
    // Re-run when icon files change so the embedded window/tray icon updates.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
