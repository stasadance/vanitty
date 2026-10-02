use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub const SETTINGS: &str = "settings.json";
pub const KEYBINDINGS: &str = "keybindings.json";

/// `$XDG_CONFIG_HOME/vanitty`, else `~/.config/vanitty` on macOS and Linux,
/// and `%APPDATA%\Vanitty` on Windows. Same layout rules as Hyper.
pub fn config_dir() -> PathBuf {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME").filter(|v| !v.is_empty()) {
        return PathBuf::from(xdg).join("vanitty");
    }
    if cfg!(windows) {
        dirs::config_dir().unwrap_or_default().join("Vanitty")
    } else {
        std::env::home_dir()
            .unwrap_or_default()
            .join(".config")
            .join("vanitty")
    }
}

fn hyper_config_dir() -> PathBuf {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME").filter(|v| !v.is_empty()) {
        return PathBuf::from(xdg).join("Hyper");
    }
    if cfg!(windows) {
        dirs::config_dir().unwrap_or_default().join("Hyper")
    } else {
        std::env::home_dir()
            .unwrap_or_default()
            .join(".config")
            .join("Hyper")
    }
}

fn legacy_hyper_js() -> PathBuf {
    if let Some(xdg) = std::env::var_os("XDG_CONFIG_HOME").filter(|v| !v.is_empty()) {
        return PathBuf::from(xdg).join("hyper").join(".hyper.js");
    }
    if cfg!(windows) {
        dirs::config_dir()
            .unwrap_or_default()
            .join("Hyper")
            .join(".hyper.js")
    } else {
        std::env::home_dir().unwrap_or_default().join(".hyper.js")
    }
}

/// Only plain file names inside the config dir are reachable from the webview.
fn config_file(name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains(['/', '\\']) || name.starts_with('.') {
        return Err(format!("invalid config file name: {name}"));
    }
    Ok(config_dir().join(name))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigInfo {
    dir: String,
    settings_path: String,
    keybindings_path: String,
    platform: &'static str,
}

#[tauri::command]
pub fn config_info() -> ConfigInfo {
    let dir = config_dir();
    ConfigInfo {
        settings_path: dir.join(SETTINGS).to_string_lossy().into_owned(),
        keybindings_path: dir.join(KEYBINDINGS).to_string_lossy().into_owned(),
        dir: dir.to_string_lossy().into_owned(),
        platform: std::env::consts::OS,
    }
}

#[tauri::command]
pub fn config_read(name: &str) -> Result<Option<String>, String> {
    let path = config_file(name)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("{}: {e}", path.display())),
    }
}

#[tauri::command]
pub fn config_write(name: &str, contents: &str) -> Result<(), String> {
    let path = config_file(name)?;
    std::fs::create_dir_all(config_dir()).map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("{}: {e}", path.display()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HyperConfig {
    path: String,
    /// `json` for Hyper 4's hyper.json, `js` for the legacy .hyper.js.
    kind: &'static str,
    contents: String,
}

/// Finds an existing Hyper config to import from.
#[tauri::command]
pub fn hyper_config_find() -> Option<HyperConfig> {
    let candidates = [
        (hyper_config_dir().join("hyper.json"), "json"),
        (legacy_hyper_js(), "js"),
    ];
    candidates.into_iter().find_map(|(path, kind)| {
        let contents = std::fs::read_to_string(&path).ok()?;
        Some(HyperConfig {
            path: path.to_string_lossy().into_owned(),
            kind,
            contents,
        })
    })
}

pub struct ConfigWatcher(#[allow(dead_code)] Mutex<Option<notify::RecommendedWatcher>>);

/// Emits `config-changed` with the file name whenever settings or
/// keybindings change on disk, so every window reloads live.
pub fn watch(app: &AppHandle) {
    let dir = config_dir();
    let _ = std::fs::create_dir_all(&dir);
    let handle = app.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !(event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove()) {
            return;
        }
        for path in &event.paths {
            if let Some(name) = file_name(path).filter(|n| *n == SETTINGS || *n == KEYBINDINGS) {
                let _ = handle.emit("config-changed", name);
            }
        }
    });
    let watcher = watcher.and_then(|mut w| w.watch(&dir, RecursiveMode::NonRecursive).map(|_| w));
    if let Err(e) = &watcher {
        eprintln!("config watcher failed: {e}");
    }
    app.manage(ConfigWatcher(Mutex::new(watcher.ok())));
}

fn file_name(path: &Path) -> Option<&str> {
    path.file_name()?.to_str()
}

/// Opens a config file in the user's default editor, creating it if needed.
#[tauri::command]
pub fn config_open(app: AppHandle, name: &str, fallback: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = config_file(name)?;
    if !path.exists() {
        config_write(name, fallback)?;
    }
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}
