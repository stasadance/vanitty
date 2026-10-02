use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

static NEXT: AtomicU32 = AtomicU32::new(0);

/// macOS keeps its native, already rounded frame with the traffic lights laid
/// over our tab bar. Elsewhere the window is frameless and transparent so the
/// webview draws the rounded border and the window controls itself.
pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let label = format!("main-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("Vanitty")
        .inner_size(900.0, 600.0)
        .min_inner_size(320.0, 200.0);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false).transparent(true);

    builder.build()
}

#[tauri::command]
pub fn window_new(app: AppHandle) -> Result<(), String> {
    create(&app).map(|_| ()).map_err(|e| e.to_string())
}
