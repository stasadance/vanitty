//! Background updates from GitHub releases. Each window asks `update_check`
//! after startup and every few hours; the first call checks and downloads,
//! later calls reuse the result. Nothing installs until the user picks
//! Restart in the notification, except on macOS and AppImage where the update
//! is applied silently when Vanitty quits.

use tauri::async_runtime::Mutex;
use tauri::utils::config::BundleType;
use tauri::utils::platform::bundle_type;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct Updater(Mutex<Option<(Update, Vec<u8>)>>);

/// Only builds from the release installers can update themselves. A binary
/// from `cargo install`, the Arch package or a dev build stays as is.
fn supported() -> bool {
    if cfg!(debug_assertions) {
        return false;
    }
    match bundle_type() {
        Some(BundleType::App) => std::env::current_exe()
            .is_ok_and(|exe| exe.to_string_lossy().contains(".app/Contents/MacOS/")),
        Some(_) => true,
        None => false,
    }
}

/// Installing replaces files without asking anything, so it can run on quit.
fn silent_install() -> bool {
    matches!(bundle_type(), Some(BundleType::App | BundleType::AppImage))
}

/// Returns the version of a downloaded update, if there is one.
#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    if !supported() {
        return Ok(None);
    }
    let state = app.state::<Updater>();
    let mut pending = state.0.lock().await;
    if let Some((update, _)) = pending.as_ref() {
        return Ok(Some(update.version.clone()));
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(None);
    };
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    let version = update.version.clone();
    *pending = Some((update, bytes));
    Ok(Some(version))
}

/// Installs the downloaded update and relaunches. On Windows the installer
/// closes Vanitty and starts the new version itself.
#[tauri::command]
pub async fn update_install<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<Updater>();
    let Some((update, bytes)) = state.0.lock().await.take() else {
        return Err("No update has been downloaded.".into());
    };
    update.install(bytes).map_err(|e| e.to_string())?;
    app.restart();
}

/// Applies a downloaded update when Vanitty quits, where that needs no prompt.
pub fn install_on_exit<R: Runtime>(app: &AppHandle<R>) {
    if !silent_install() {
        return;
    }
    let state = app.state::<Updater>();
    if let Ok(mut pending) = state.0.try_lock()
        && let Some((update, bytes)) = pending.take()
    {
        let _ = update.install(bytes);
    }
}
