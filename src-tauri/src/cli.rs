//! The `vanitty` command. `vanitty [folder] [-w] [-- command]` opens a tab (or
//! a window) in a folder. A running Vanitty takes the request over a local
//! socket; otherwise this process becomes the app.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::sync::Mutex;

use interprocess::local_socket::prelude::*;
use interprocess::local_socket::{
    GenericFilePath, GenericNamespaced, ListenerOptions, Name, Stream,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

use crate::window;

const USAGE: &str = "\
Usage: vanitty [options] [folder] [-- command [args...]]

Opens a new tab in Vanitty, in the current folder or the one given.

  -w, --new-window   Open a new window instead of a tab
  -h, --help         Show this help
  -V, --version      Show the version

Examples:
  vanitty               New tab here
  vanitty ~/code        New tab in ~/code
  vanitty -w .          New window here
  vanitty -- htop       Run htop in a new tab
";

/// What to open: a tab, or a window with `new_window`.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Launch {
    pub cwd: Option<String>,
    /// Runs instead of the shell when set.
    pub command: Vec<String>,
    pub new_window: bool,
}

#[derive(Debug, PartialEq)]
enum Args {
    Help,
    Version,
    Open {
        folder: Option<String>,
        new_window: bool,
        command: Vec<String>,
    },
}

fn parse(args: impl IntoIterator<Item = String>) -> Result<Args, String> {
    let mut folder = None;
    let mut new_window = false;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--" => {
                let command: Vec<_> = args.collect();
                if command.is_empty() {
                    return Err("expected a command after --".into());
                }
                return Ok(Args::Open {
                    folder,
                    new_window,
                    command,
                });
            }
            "-h" | "--help" => return Ok(Args::Help),
            "-V" | "--version" => return Ok(Args::Version),
            "-w" | "--new-window" => new_window = true,
            // Old macOS versions pass a process serial number to apps.
            a if a.starts_with("-psn_") => {}
            a if a.starts_with('-') && a.len() > 1 => return Err(format!("unknown option {a}")),
            _ if folder.is_some() => return Err("expected one folder".into()),
            _ => folder = Some(arg),
        }
    }
    Ok(Args::Open {
        folder,
        new_window,
        command: Vec::new(),
    })
}

fn resolve(folder: &str, cwd: &Path) -> Result<String, String> {
    let path = cwd.join(folder);
    if !path.is_dir() {
        return Err(format!("{folder} is not a folder"));
    }
    let path = std::path::absolute(&path).unwrap_or(path);
    Ok(path.to_string_lossy().into_owned())
}

/// Was this started from a shell, rather than a desktop launcher? On Windows
/// this also attaches to the shell's console so `--help` can print.
fn from_terminal() -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::Console::{ATTACH_PARENT_PROCESS, AttachConsole};
        // SAFETY: plain Win32 call with no pointers.
        unsafe { AttachConsole(ATTACH_PARENT_PROCESS) != 0 }
    }
    #[cfg(not(windows))]
    {
        use std::io::IsTerminal;
        std::io::stdin().is_terminal() || std::io::stdout().is_terminal()
    }
}

fn detach_console() {
    #[cfg(windows)]
    // SAFETY: plain Win32 call with no pointers.
    unsafe {
        windows_sys::Win32::System::Console::FreeConsole();
    }
}

fn exit(code: i32, message: &str) -> ! {
    if code == 0 {
        print!("{message}");
        let _ = std::io::stdout().flush();
    } else {
        eprintln!("vanitty: {message}\nRun 'vanitty --help' for usage.");
    }
    std::process::exit(code)
}

/// Debug builds use their own socket so `pnpm tauri dev` doesn't hand its
/// requests to an installed Vanitty.
fn socket_name() -> std::io::Result<Name<'static>> {
    let suffix = if cfg!(debug_assertions) { "-dev" } else { "" };
    if cfg!(windows) {
        let user = std::env::var("USERNAME").unwrap_or_default();
        format!("vanitty-{user}{suffix}").to_ns_name::<GenericNamespaced>()
    } else {
        // A folder only this user can write to, so other users can't connect.
        let dir = dirs::runtime_dir().unwrap_or_else(crate::config::config_dir);
        let _ = std::fs::create_dir_all(&dir);
        dir.join(format!("vanitty{suffix}.sock"))
            .to_fs_name::<GenericFilePath>()
    }
}

/// Hands the launch to a running Vanitty. False when none is running.
fn send(launch: &Launch) -> bool {
    let Ok(stream) = socket_name().and_then(Stream::connect) else {
        return false;
    };
    let mut stream = BufReader::new(stream);
    let mut line = serde_json::to_string(launch).unwrap_or_default();
    line.push('\n');
    let mut ack = String::new();
    stream.get_mut().write_all(line.as_bytes()).is_ok() && stream.read_line(&mut ack).is_ok()
}

/// Starts the app in the background so the shell gets its prompt back.
#[cfg(unix)]
fn spawn_detached(launch: &Launch) -> bool {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    // An AppImage's files go away once its runtime exits, so start the
    // AppImage itself rather than the binary inside it.
    let Some(exe) = std::env::var_os("APPIMAGE")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::current_exe().ok())
    else {
        return false;
    };
    let mut cmd = Command::new(exe);
    cmd.args(&launch.cwd);
    if !launch.command.is_empty() {
        cmd.arg("--").args(&launch.command);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .is_ok()
}

/// Handles the command line. Exits when a running Vanitty took the request,
/// otherwise returns what the first window should open.
pub fn start() -> Option<Launch> {
    let terminal = from_terminal();
    let (folder, new_window, command) = match parse(std::env::args().skip(1)) {
        Ok(Args::Help) => exit(0, USAGE),
        Ok(Args::Version) => exit(0, &format!("vanitty {}\n", env!("CARGO_PKG_VERSION"))),
        Ok(Args::Open {
            folder,
            new_window,
            command,
        }) => (folder, new_window, command),
        Err(e) => exit(2, &e),
    };
    detach_console();

    let here = std::env::current_dir().unwrap_or_default();
    let cwd = match folder {
        Some(f) => Some(resolve(&f, &here).unwrap_or_else(|e| exit(2, &e))),
        // From a shell, "here" is the shell's folder. A launcher's folder is
        // arbitrary (/ or the install folder), so let the settings decide.
        None if terminal => Some(here.to_string_lossy().into_owned()),
        None => None,
    };
    let launch = Launch {
        // Launching the app again from a menu or dock opens another window,
        // as it did before Vanitty was single-instance.
        new_window: new_window || (cwd.is_none() && command.is_empty()),
        cwd,
        command,
    };

    if send(&launch) {
        std::process::exit(0);
    }
    #[cfg(unix)]
    if terminal && !cfg!(debug_assertions) && spawn_detached(&launch) {
        std::process::exit(0);
    }
    (launch.cwd.is_some() || !launch.command.is_empty()).then_some(launch)
}

/// Launches waiting for their window to pick them up, and the window that
/// was focused last.
#[derive(Default)]
pub struct Launches {
    pending: Mutex<HashMap<String, Vec<Launch>>>,
    focused: Mutex<Option<String>>,
}

impl Launches {
    pub fn queue(app: &AppHandle, label: &str, launch: Launch) {
        let state = app.state::<Launches>();
        let mut pending = state.pending.lock().unwrap();
        pending.entry(label.to_owned()).or_default().push(launch);
    }

    pub fn focused(app: &AppHandle, label: &str) {
        *app.state::<Launches>().focused.lock().unwrap() = Some(label.to_owned());
    }

    pub fn window_closed(app: &AppHandle, label: &str) {
        app.state::<Launches>()
            .pending
            .lock()
            .unwrap()
            .remove(label);
    }

    fn target(app: &AppHandle) -> Option<WebviewWindow> {
        let focused = app.state::<Launches>().focused.lock().unwrap().clone();
        focused
            .and_then(|l| app.get_webview_window(&l))
            .or_else(|| app.webview_windows().into_values().next())
    }
}

/// Opens a launch from another `vanitty` process.
fn open(app: &AppHandle, launch: Launch) {
    let target = (!launch.new_window)
        .then(|| Launches::target(app))
        .flatten();
    let Some(win) = target else {
        let _ = window::create_with(app, Some(launch));
        return;
    };
    Launches::queue(app, win.label(), launch);
    let _ = win.emit_to(win.label(), "cli-open", ());
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
}

/// Takes launch requests from later `vanitty` runs.
pub fn listen(app: &AppHandle) {
    let Ok(name) = socket_name() else { return };
    let options = ListenerOptions::new().name(name).try_overwrite(true);
    #[cfg(unix)]
    let options = {
        use interprocess::os::unix::local_socket::ListenerOptionsExt;
        options.mode(0o600)
    };
    let Ok(listener) = options.create_sync() else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let mut stream = BufReader::new(stream);
            let mut line = String::new();
            if stream.read_line(&mut line).is_err() {
                continue;
            }
            let _ = stream.get_mut().write_all(b"ok\n");
            if let Ok(launch) = serde_json::from_str::<Launch>(&line) {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || open(&handle, launch));
            }
        }
    });
}

/// Where the macOS menu item installs the command. On PATH by default.
#[cfg(target_os = "macos")]
const MAC_COMMAND: &str = "/usr/local/bin/vanitty";

/// Installs a `vanitty` script that runs this app's binary, asking for an
/// admin password when /usr/local/bin isn't writable. Linux packages and the
/// Windows installer put the command on PATH themselves.
#[tauri::command]
pub fn cli_install() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::fs::PermissionsExt;

        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let quoted = exe.to_string_lossy().replace('\'', r"'\''");
        let script = format!("#!/bin/sh\nexec '{quoted}' \"$@\"\n");
        let tmp = std::env::temp_dir().join("vanitty-command");
        std::fs::write(&tmp, script).map_err(|e| e.to_string())?;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
        let copied = std::fs::copy(&tmp, MAC_COMMAND).is_ok();
        if !copied {
            let shell = format!(
                "mkdir -p /usr/local/bin && cp '{}' {MAC_COMMAND} && chmod 755 {MAC_COMMAND}",
                tmp.to_string_lossy().replace('\'', r"'\''")
            );
            let apple = format!(
                "do shell script \"{}\" with administrator privileges",
                shell.replace('\\', r"\\").replace('"', r#"\""#)
            );
            let ok = std::process::Command::new("osascript")
                .args(["-e", &apple])
                .status()
                .is_ok_and(|s| s.success());
            if !ok {
                let _ = std::fs::remove_file(&tmp);
                return Err(format!("Couldn't install {MAC_COMMAND}"));
            }
        }
        let _ = std::fs::remove_file(&tmp);
        Ok(MAC_COMMAND.into())
    }
    #[cfg(not(target_os = "macos"))]
    Err("Vanitty's installer already puts the vanitty command on PATH.".into())
}

/// Launches waiting for the calling window.
#[tauri::command]
pub fn cli_take(window: WebviewWindow, state: tauri::State<'_, Launches>) -> Vec<Launch> {
    state
        .pending
        .lock()
        .unwrap()
        .remove(window.label())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn args(list: &[&str]) -> Result<Args, String> {
        parse(list.iter().map(|s| s.to_string()))
    }

    fn open(folder: Option<&str>, new_window: bool, command: &[&str]) -> Args {
        Args::Open {
            folder: folder.map(String::from),
            new_window,
            command: command.iter().map(|s| s.to_string()).collect(),
        }
    }

    #[test]
    fn parses_folders_windows_and_commands() {
        assert_eq!(args(&[]), Ok(open(None, false, &[])));
        assert_eq!(args(&["src"]), Ok(open(Some("src"), false, &[])));
        assert_eq!(args(&["-w", "."]), Ok(open(Some("."), true, &[])));
        assert_eq!(
            args(&["--new-window", "--", "ls", "-la", "--", "x"]),
            Ok(open(None, true, &["ls", "-la", "--", "x"]))
        );
        assert_eq!(args(&["-psn_0_1234"]), Ok(open(None, false, &[])));
        assert_eq!(args(&["a", "-h"]), Ok(Args::Help));
        assert_eq!(args(&["-V"]), Ok(Args::Version));
    }

    #[test]
    fn rejects_bad_arguments() {
        assert!(args(&["-x"]).is_err());
        assert!(args(&["a", "b"]).is_err());
        assert!(args(&["--"]).is_err());
    }

    #[test]
    fn resolves_folders() {
        let here = std::env::temp_dir();
        assert_eq!(
            resolve(".", &here).map(PathBuf::from),
            Ok(std::path::absolute(here.join(".")).unwrap())
        );
        assert!(resolve("does-not-exist-here", &here).is_err());
    }
}
