//! Launching things outside Vanitty: shells, the browser and the editor for
//! config files. Each one gets the user's own environment, not the one the
//! AppImage launcher sets up for Vanitty.

use std::path::Path;
use std::process::{Command, Stdio};

/// The environment changes every program Vanitty starts needs. Empty unless
/// Vanitty runs as an AppImage.
pub fn env_fixes() -> Vec<(String, Option<String>)> {
    match std::env::var("APPDIR") {
        Ok(appdir) if !appdir.is_empty() => appimage_env(&appdir, std::env::vars()),
        _ => Vec::new(),
    }
}

fn host_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    let fixes = env_fixes();
    if !fixes.is_empty() {
        // The AppImage launcher runs Vanitty from inside its mount, which
        // disappears when Vanitty quits.
        if let Some(home) = std::env::home_dir() {
            cmd.current_dir(home);
        }
    }
    for (key, value) in fixes {
        match value {
            Some(v) => cmd.env(key, v),
            None => cmd.env_remove(key),
        };
    }
    cmd
}

/// Starts `cmd` without tying it to Vanitty's terminal or lifetime. A thread
/// reaps it so it doesn't linger as a zombie.
fn spawn_detached(mut cmd: Command) -> std::io::Result<()> {
    let mut child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    std::thread::spawn(move || child.wait());
    Ok(())
}

/// Opens a URL or file with the system default app.
pub fn open(target: &str) -> Result<(), String> {
    if cfg!(target_os = "linux") && !env_fixes().is_empty() {
        let mut last_err = None;
        for cmd in open::commands(target) {
            let mut fixed = host_command(cmd.get_program());
            fixed.args(cmd.get_args());
            match spawn_detached(fixed) {
                Ok(()) => return Ok(()),
                Err(e) => last_err = Some(e),
            }
        }
        return Err(last_err.map_or_else(|| "no way to open it".into(), |e| e.to_string()));
    }
    open::that_detached(target).map_err(|e| e.to_string())
}

/// Opens a file in VS Code or a similar code editor when one is installed,
/// otherwise with the system default app for its type.
pub fn open_in_editor(path: &Path) -> Result<(), String> {
    if open_with_code_editor(path) {
        return Ok(());
    }
    open(&path.to_string_lossy())
}

/// Command-line launchers of VS Code and its relatives, in order of preference.
#[cfg(not(any(target_os = "macos", windows)))]
const EDITORS: &[&str] = &[
    "code",
    "code-insiders",
    "codium",
    "cursor",
    "zed",
    "zeditor",
];

#[cfg(not(any(target_os = "macos", windows)))]
fn open_with_code_editor(path: &Path) -> bool {
    // Search the PATH the user's shell would see, not the AppImage's.
    let path_var = env_fixes()
        .into_iter()
        .find(|(k, _)| k == "PATH")
        .map_or_else(|| std::env::var("PATH").ok(), |(_, v)| v)
        .unwrap_or_default();
    EDITORS.iter().any(|name| {
        std::env::split_paths(&path_var)
            .map(|dir| dir.join(name))
            .find(|bin| bin.is_file())
            .is_some_and(|bin| {
                let mut cmd = host_command(bin);
                cmd.arg(path);
                spawn_detached(cmd).is_ok()
            })
    })
}

/// Bundle ids of VS Code and its relatives. Apps started from Finder don't get
/// the shell's PATH, so `open -b` finds them instead of their CLI.
#[cfg(target_os = "macos")]
const EDITORS: &[&str] = &[
    "com.microsoft.VSCode",
    "com.microsoft.VSCodeInsiders",
    "com.vscodium",
    "com.todesktop.230313mzl4w4u92",
    "dev.zed.Zed",
];

#[cfg(target_os = "macos")]
fn open_with_code_editor(path: &Path) -> bool {
    EDITORS.iter().any(|id| {
        Command::new("open")
            .args(["-b", id])
            .arg(path)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|s| s.success())
    })
}

/// Default install locations of VS Code and its relatives.
#[cfg(windows)]
fn open_with_code_editor(path: &Path) -> bool {
    use std::path::PathBuf;
    let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from);
    let program_files = std::env::var_os("ProgramFiles").map(PathBuf::from);
    let candidates = [
        local
            .as_ref()
            .map(|d| d.join(r"Programs\Microsoft VS Code\Code.exe")),
        program_files
            .as_ref()
            .map(|d| d.join(r"Microsoft VS Code\Code.exe")),
        local
            .as_ref()
            .map(|d| d.join(r"Programs\Microsoft VS Code Insiders\Code - Insiders.exe")),
        local
            .as_ref()
            .map(|d| d.join(r"Programs\VSCodium\VSCodium.exe")),
        program_files
            .as_ref()
            .map(|d| d.join(r"VSCodium\VSCodium.exe")),
        local
            .as_ref()
            .map(|d| d.join(r"Programs\cursor\Cursor.exe")),
        local.as_ref().map(|d| d.join(r"Programs\Zed\Zed.exe")),
    ];
    candidates
        .into_iter()
        .flatten()
        .filter(|exe| exe.is_file())
        .any(|exe| {
            let mut cmd = Command::new(exe);
            cmd.arg(path);
            spawn_detached(cmd).is_ok()
        })
}

/// Opens a link clicked in a terminal.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    let scheme = url
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(scheme.as_str(), "http" | "https" | "mailto") {
        return Err(format!(
            "Not opening {url}: only web and mail links open from the terminal."
        ));
    }
    open(&url)
}

/// Variables the AppImage runtime and its launch scripts set for Vanitty
/// itself. Shells must not inherit them.
const APPIMAGE_VARS: &[&str] = &["APPDIR", "APPIMAGE", "ARGV0", "OWD", "GTK_THEME"];

/// When running as an AppImage, the launcher points `LD_LIBRARY_PATH`, `PATH`,
/// `XDG_DATA_DIRS`, the GTK and GIO module paths and more at the bundled
/// libraries. A shell that inherits them makes system programs load those
/// older libraries and fail with symbol lookup errors. Returns the changes
/// that restore the user's own environment: entries under `appdir` are
/// dropped from list variables, and variables left empty are removed.
fn appimage_env(
    appdir: &str,
    vars: impl Iterator<Item = (String, String)>,
) -> Vec<(String, Option<String>)> {
    let appdir = appdir.trim_end_matches('/');
    let mut changes = Vec::new();
    for (key, value) in vars {
        if APPIMAGE_VARS.contains(&key.as_str()) {
            changes.push((key, None));
            continue;
        }
        if !value.contains(appdir) {
            continue;
        }
        let kept: Vec<&str> = value
            .split(':')
            .filter(|p| !p.is_empty() && !p.starts_with(appdir))
            .collect();
        changes.push((key, (!kept.is_empty()).then(|| kept.join(":"))));
    }
    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars(list: &[(&str, &str)]) -> impl Iterator<Item = (String, String)> {
        list.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<Vec<_>>()
            .into_iter()
    }

    #[test]
    fn strips_appimage_paths() {
        let app = "/tmp/.mount_VanittXYZ";
        let changes = appimage_env(
            app,
            vars(&[
                (
                    "LD_LIBRARY_PATH",
                    "/tmp/.mount_VanittXYZ/usr/lib/:/tmp/.mount_VanittXYZ/lib/:",
                ),
                (
                    "PATH",
                    "/tmp/.mount_VanittXYZ/usr/bin/:/usr/local/bin:/usr/bin",
                ),
                (
                    "XDG_DATA_DIRS",
                    "/tmp/.mount_VanittXYZ/usr/share:/usr/share:/usr/local/share",
                ),
                (
                    "GIO_MODULE_DIR",
                    "/tmp/.mount_VanittXYZ//usr/lib/gio/modules",
                ),
                ("APPDIR", app),
                ("GTK_THEME", "Adwaita:dark"),
                ("HOME", "/home/stas"),
            ]),
        );
        let get = |k: &str| {
            changes
                .iter()
                .find(|(key, _)| key == k)
                .map(|(_, v)| v.clone())
        };
        assert_eq!(get("LD_LIBRARY_PATH"), Some(None));
        assert_eq!(get("PATH"), Some(Some("/usr/local/bin:/usr/bin".into())));
        assert_eq!(
            get("XDG_DATA_DIRS"),
            Some(Some("/usr/share:/usr/local/share".into()))
        );
        assert_eq!(get("GIO_MODULE_DIR"), Some(None));
        assert_eq!(get("APPDIR"), Some(None));
        assert_eq!(get("GTK_THEME"), Some(None));
        assert_eq!(get("HOME"), None);
    }
}
