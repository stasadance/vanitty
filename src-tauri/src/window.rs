use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_window_state::{StateFlags, WindowExt};

static NEXT: AtomicU32 = AtomicU32::new(0);

/// macOS keeps its native, already rounded frame with the traffic lights laid
/// over our title bar. Elsewhere the window is frameless and transparent so the
/// webview draws the rounded border and the window controls itself.
pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let first = app.webview_windows().is_empty();
    let label = format!("main-{}", NEXT.fetch_add(1, Ordering::Relaxed));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::default())
        .title("Vanitty")
        .visible(false)
        .inner_size(900.0, 600.0)
        .min_inner_size(320.0, 200.0);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build()?;

    // The first window comes back where it was last closed. Later ones only
    // take its size so they don't open stacked exactly on top of it.
    let flags = if first {
        saved_state()
    } else {
        StateFlags::SIZE
    };
    let _ = window.restore_state(flags);
    window.show()?;

    Ok(window)
}

/// What we remember about a window across launches.
pub fn saved_state() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED
}

/// Every window shares one saved state, so whichever was used last wins.
pub fn state_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_window_state::Builder::new()
        .with_state_flags(saved_state())
        .map_label(|_| "main")
        .skip_initial_state("main")
        .build()
}

#[tauri::command]
pub fn window_new(app: AppHandle) -> Result<(), String> {
    create(&app).map(|_| ()).map_err(|e| e.to_string())
}
