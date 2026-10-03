use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use tauri::State;
use tauri::ipc::{Channel, InvokeResponseBody};

/// Output is coalesced for this long before it is sent to the webview, so a
/// burst of small reads becomes one IPC message.
const BATCH_WINDOW: Duration = Duration::from_millis(4);
const BATCH_MAX: usize = 256 * 1024;

struct Pty {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
    /// Label of the window that owns this shell.
    window: String,
}

#[derive(Default)]
pub struct PtyManager {
    next_id: AtomicU32,
    ptys: Arc<Mutex<HashMap<u32, Pty>>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    cols: u16,
    rows: u16,
    shell: Option<String>,
    shell_args: Option<Vec<String>>,
    cwd: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Spawned {
    id: u32,
    pid: Option<u32>,
    shell: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Exited {
    code: u32,
    /// How long the process ran, so the UI can detect a broken shell config.
    elapsed_ms: u64,
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}

pub fn default_shell() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into())
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into())
    }
}

fn default_args() -> Vec<String> {
    if cfg!(windows) {
        vec![]
    } else {
        vec!["--login".into()]
    }
}

fn resolve_cwd(cwd: Option<String>) -> Option<PathBuf> {
    cwd.filter(|c| !c.is_empty())
        .map(|c| {
            if let Some(rest) = c.strip_prefix("~") {
                std::env::home_dir()
                    .map(|h| h.join(rest.trim_start_matches(['/', '\\'])))
                    .unwrap_or_else(|| PathBuf::from(&c))
            } else {
                PathBuf::from(c)
            }
        })
        .filter(|p| p.is_dir())
        .or_else(std::env::home_dir)
}

#[tauri::command]
pub fn pty_default_shell() -> String {
    default_shell()
}

#[tauri::command]
pub fn pty_spawn(
    window: tauri::Window,
    state: State<'_, PtyManager>,
    options: SpawnOptions,
    output: Channel<InvokeResponseBody>,
    exit: Channel<Exited>,
) -> Result<Spawned, String> {
    let shell = options
        .shell
        .filter(|s| !s.is_empty())
        .unwrap_or_else(default_shell);
    let args = options.shell_args.unwrap_or_else(default_args);

    let mut cmd = CommandBuilder::new(&shell);
    cmd.args(&args);
    for (key, value) in crate::host::env_fixes() {
        match value {
            Some(v) => cmd.env(key, v),
            None => cmd.env_remove(key),
        }
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("TERM_PROGRAM", "Vanitty");
    cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
    if std::env::var_os("LANG").is_none() {
        cmd.env("LANG", "en_US.UTF-8");
    }
    for (k, v) in &options.env {
        cmd.env(k, v);
    }
    if let Some(cwd) = resolve_cwd(options.cwd) {
        cmd.cwd(cwd);
    }

    let pair = native_pty_system()
        .openpty(size(options.cols, options.rows))
        .map_err(|e| e.to_string())?;
    let mut child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);
    let started = Instant::now();

    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let pid = child.process_id();
    let killer = child.clone_killer();

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.ptys.lock().unwrap().insert(
        id,
        Pty {
            master: pair.master,
            writer,
            killer,
            pid,
            window: window.label().to_owned(),
        },
    );

    let reader_thread = std::thread::spawn(move || pump(reader, output));

    let ptys = state.ptys.clone();
    std::thread::spawn(move || {
        let code = child.wait().map(|s| s.exit_code()).unwrap_or(1);
        // Dropping the master closes the pty, which ends the reader on every
        // platform (ConPTY never sends EOF on its own).
        ptys.lock().unwrap().remove(&id);
        let _ = reader_thread.join();
        let _ = exit.send(Exited {
            code,
            elapsed_ms: started.elapsed().as_millis() as u64,
        });
    });

    Ok(Spawned { id, pid, shell })
}

fn pump(mut reader: Box<dyn Read + Send>, output: Channel<InvokeResponseBody>) {
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    let sender = std::thread::spawn(move || {
        while let Ok(mut batch) = rx.recv() {
            let deadline = Instant::now() + BATCH_WINDOW;
            while batch.len() < BATCH_MAX {
                let now = Instant::now();
                if now >= deadline {
                    break;
                }
                match rx.recv_timeout(deadline - now) {
                    Ok(more) => batch.extend_from_slice(&more),
                    Err(_) => break,
                }
            }
            if output.send(InvokeResponseBody::Raw(batch)).is_err() {
                break;
            }
        }
    });
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        match reader.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if tx.send(buf[..n].to_vec()).is_err() {
                    break;
                }
            }
        }
    }
    drop(tx);
    let _ = sender.join();
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyManager>, id: u32, data: String) -> Result<(), String> {
    let mut ptys = state.ptys.lock().unwrap();
    let Some(pty) = ptys.get_mut(&id) else {
        return Ok(());
    };
    pty.writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyManager>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let ptys = state.ptys.lock().unwrap();
    let Some(pty) = ptys.get(&id) else {
        return Ok(());
    };
    pty.master
        .resize(size(cols, rows))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyManager>, id: u32) {
    if let Some(pty) = state.ptys.lock().unwrap().get_mut(&id) {
        let _ = pty.killer.kill();
    }
}

/// Current working directory of the shell, used to open new tabs and splits
/// in the same directory (`preserveCWD`).
#[tauri::command]
pub fn pty_cwd(state: State<'_, PtyManager>, id: u32) -> Option<String> {
    let pid = state.ptys.lock().unwrap().get(&id)?.pid?;
    process_cwd(pid).map(|p| p.to_string_lossy().into_owned())
}

#[cfg(target_os = "linux")]
fn process_cwd(pid: u32) -> Option<PathBuf> {
    std::fs::read_link(format!("/proc/{pid}/cwd")).ok()
}

#[cfg(target_os = "macos")]
fn process_cwd(pid: u32) -> Option<PathBuf> {
    libproc::proc_pid::pidcwd(pid as i32).ok()
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn process_cwd(_pid: u32) -> Option<PathBuf> {
    None
}

impl PtyManager {
    pub fn kill_all(&self) {
        for pty in self.ptys.lock().unwrap().values_mut() {
            let _ = pty.killer.kill();
        }
    }

    /// Ends a window's shells when it closes or reloads, so none are orphaned.
    pub fn kill_window(&self, label: &str) {
        for pty in self.ptys.lock().unwrap().values_mut() {
            if pty.window == label {
                let _ = pty.killer.kill();
            }
        }
    }
}
