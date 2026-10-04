//! Launching things outside Vanitty: shells, the browser and the editor for
//! config files. Each one gets the user's own environment, not the one the
//! AppImage launcher sets up for Vanitty.

use std::path::{Path, PathBuf};
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

/// Starts a new Vanitty from its AppImage after an update. Tauri's own restart
/// would pass on this instance's AppImage environment, whose paths point into
/// this instance's mount, so the new one starts the way the desktop starts it.
pub fn relaunch_appimage(
    appimage: &std::ffi::OsStr,
    args: &[std::ffi::OsString],
) -> std::io::Result<()> {
    let mut cmd = host_command(appimage);
    cmd.args(args).stdin(Stdio::null()).spawn().map(drop)
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
    use PathBuf;
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

/// Resolves paths printed in a terminal against the shell's directory (else
/// the home directory). Each comes back absolute if it exists, else `None`.
#[tauri::command]
pub fn path_links(cwd: Option<String>, paths: Vec<String>) -> Vec<Option<String>> {
    let home = std::env::home_dir().unwrap_or_default();
    let base = cwd.map_or_else(|| home.clone(), PathBuf::from);
    paths
        .iter()
        .map(|p| {
            let path = resolve(&base, &home, p);
            path.exists().then(|| path.to_string_lossy().into_owned())
        })
        .collect()
}

fn resolve(base: &Path, home: &Path, path: &str) -> PathBuf {
    if path == "~" {
        return home.to_path_buf();
    }
    match path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        Some(rest) => home.join(rest),
        None => base.join(path),
    }
}

/// What a click on a path in the terminal opens.
#[derive(Debug, PartialEq)]
enum PathTarget {
    /// A file, opened in a code editor.
    Editor(PathBuf),
    /// A folder, opened in the file manager.
    Folder(PathBuf),
}

/// Files only ever go to a code editor and folders to the file manager, so a
/// click can't run anything. The system default app for a file can be an
/// interpreter (a `.sh` with Git Bash or a `.py` on Windows), and opening a
/// bundle folder like `Foo.app` on macOS launches it. Symlinks are resolved
/// first, so a harmless-looking name can't point at a bundle.
fn path_target(path: &Path, bundles_launch: bool) -> std::io::Result<PathTarget> {
    let path = real_path(path)?;
    if std::fs::metadata(&path)?.is_dir() {
        Ok(PathTarget::Folder(safe_folder(&path, bundles_launch)))
    } else {
        Ok(PathTarget::Editor(path))
    }
}

/// The absolute path with symlinks resolved. On Windows without the `\\?\`
/// prefix, which editors and Explorer don't all accept.
fn real_path(path: &Path) -> std::io::Result<PathBuf> {
    let path = std::fs::canonicalize(path)?;
    if cfg!(windows) {
        let s = path.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\").filter(|r| r.get(1..2) == Some(":")) {
            return Ok(PathBuf::from(rest));
        }
    }
    Ok(path)
}

/// `dir`, or on macOS the nearest folder above it that isn't a bundle.
fn safe_folder(dir: &Path, bundles_launch: bool) -> PathBuf {
    let mut dir = dir;
    if bundles_launch {
        while dir.extension().is_some() {
            match dir.parent() {
                Some(parent) => dir = parent,
                None => break,
            }
        }
    }
    dir.to_path_buf()
}

/// Opens a file or folder clicked in a terminal. Files open in a code editor;
/// without one, their folder opens instead. Nothing is ever run.
#[tauri::command]
pub fn open_path(path: String) -> Result<(), String> {
    let bundles_launch = cfg!(target_os = "macos");
    let target = path_target(Path::new(&path), bundles_launch)
        .map_err(|e| format!("Can't open {path}: {e}"))?;
    let folder = match target {
        PathTarget::Folder(dir) => dir,
        PathTarget::Editor(file) => {
            if open_with_code_editor(&file) {
                return Ok(());
            }
            safe_folder(file.parent().unwrap_or(&file), bundles_launch)
        }
    };
    open(&folder.to_string_lossy())
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
///
/// Entries under other mounts of the same AppImage go too: earlier versions
/// restarted after an update with their own environment, so the new instance
/// can carry the old one's paths.
fn appimage_env(
    appdir: &str,
    vars: impl Iterator<Item = (String, String)>,
) -> Vec<(String, Option<String>)> {
    let appdir = appdir.trim_end_matches('/');
    // The runtime mounts at `<tmp>/.mount_`, then up to six characters of the
    // file name, then six random ones.
    let mount = appdir
        .rsplit_once("/.mount_")
        .filter(|(_, name)| name.len() > 6 && !name.contains('/'))
        .and_then(|_| appdir.get(..appdir.len() - 6));
    let bundled = |p: &str| p.starts_with(appdir) || mount.is_some_and(|m| p.starts_with(m));
    let mut changes = Vec::new();
    for (key, value) in vars {
        if APPIMAGE_VARS.contains(&key.as_str()) {
            changes.push((key, None));
            continue;
        }
        if !value.split(':').any(bundled) {
            continue;
        }
        let kept: Vec<&str> = value
            .split(':')
            .filter(|p| !p.is_empty() && !bundled(p))
            .collect();
        changes.push((key, (!kept.is_empty()).then(|| kept.join(":"))));
    }
    changes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_terminal_paths() {
        let base = Path::new("/work/project");
        let home = Path::new("/home/me");
        assert_eq!(
            resolve(base, home, "src/main.rs"),
            Path::new("/work/project/src/main.rs")
        );
        assert_eq!(
            resolve(base, home, "../other"),
            Path::new("/work/project/../other")
        );
        assert_eq!(resolve(base, home, "/etc/hosts"), Path::new("/etc/hosts"));
        assert_eq!(
            resolve(base, home, "~/notes.md"),
            Path::new("/home/me/notes.md")
        );
        assert_eq!(resolve(base, home, "~"), Path::new("/home/me"));
    }

    fn vars(list: &[(&str, &str)]) -> impl Iterator<Item = (String, String)> {
        list.iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect::<Vec<_>>()
            .into_iter()
    }

    /// A scratch folder for one test, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let dir = std::env::temp_dir().join(format!("vanitty-{name}-{}", std::process::id()));
            let _ = std::fs::remove_dir_all(&dir);
            std::fs::create_dir_all(&dir).unwrap();
            Scratch(real_path(&dir).unwrap())
        }

        fn file(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(&path, "#!/bin/sh\necho hi\n").unwrap();
            path
        }

        fn dir(&self, name: &str) -> PathBuf {
            let path = self.0.join(name);
            std::fs::create_dir_all(&path).unwrap();
            path
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn files_only_go_to_the_editor() {
        let s = Scratch::new("files");
        // Scripts, programs and installers would run with their default app.
        for name in [
            "notes.txt",
            "deploy.sh",
            "build",
            "script.py",
            "Setup.exe",
            "run.bat",
            "x.ps1",
            "tool.command",
            "app.desktop",
            "App.AppImage",
            "shortcut.lnk",
        ] {
            let file = s.file(name);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).unwrap();
            }
            for bundles_launch in [false, true] {
                assert_eq!(
                    path_target(&file, bundles_launch).unwrap(),
                    PathTarget::Editor(file.clone()),
                    "{name}"
                );
            }
        }
    }

    #[test]
    fn folders_go_to_the_file_manager() {
        let s = Scratch::new("folders");
        let plain = s.dir("project");
        assert_eq!(
            path_target(&plain, true).unwrap(),
            PathTarget::Folder(plain)
        );
        let dotted = s.dir("my.project");
        assert_eq!(
            path_target(&dotted, false).unwrap(),
            PathTarget::Folder(dotted.clone())
        );
    }

    #[test]
    fn bundles_are_never_opened() {
        let s = Scratch::new("bundles");
        let app = s.dir("Apps/Foo.app");
        let apps = s.0.join("Apps");
        // Opening Foo.app on macOS would launch it; its folder opens instead.
        assert_eq!(
            path_target(&app, true).unwrap(),
            PathTarget::Folder(apps.clone())
        );
        let nested = s.dir("Apps/Foo.app/Contents/Plugins/Bar.plugin");
        assert_eq!(
            path_target(&nested, true).unwrap(),
            PathTarget::Folder(s.0.join("Apps/Foo.app/Contents/Plugins"))
        );
        // A file's fallback folder skips the bundle it sits in.
        let plist = s.file("Apps/Foo.app/Info.plist");
        assert_eq!(safe_folder(plist.parent().unwrap(), true), apps);
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_are_resolved_first() {
        let s = Scratch::new("links");
        let app = s.dir("Apps/Foo.app");
        let script = s.file("deploy.sh");
        let to_app = s.0.join("notes");
        let to_script = s.0.join("readme");
        std::os::unix::fs::symlink(&app, &to_app).unwrap();
        std::os::unix::fs::symlink(&script, &to_script).unwrap();
        assert_eq!(
            path_target(&to_app, true).unwrap(),
            PathTarget::Folder(s.0.join("Apps"))
        );
        assert_eq!(
            path_target(&to_script, true).unwrap(),
            PathTarget::Editor(script)
        );
    }

    #[test]
    fn missing_paths_fail() {
        let s = Scratch::new("missing");
        assert!(path_target(&s.0.join("nope.txt"), false).is_err());
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

    #[test]
    fn strips_paths_of_earlier_mounts() {
        let changes = appimage_env(
            "/tmp/.mount_VanittNEW123",
            vars(&[
                (
                    "LD_LIBRARY_PATH",
                    "/tmp/.mount_VanittNEW123/usr/lib/:/tmp/.mount_VanittOLD456/usr/lib/:",
                ),
                (
                    "XDG_DATA_DIRS",
                    "/tmp/.mount_VanittOLD456/usr/share:/tmp/.mount_OtherA1b2c3/share:/usr/share",
                ),
            ]),
        );
        assert_eq!(
            changes,
            vec![
                ("LD_LIBRARY_PATH".into(), None),
                (
                    "XDG_DATA_DIRS".into(),
                    Some("/tmp/.mount_OtherA1b2c3/share:/usr/share".into())
                ),
            ]
        );
    }
}
