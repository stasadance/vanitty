//! The open tabs of every window, kept on disk so the next launch can reopen
//! them. Each window's webview builds its own snapshot; this module holds the
//! latest one per window and writes them all to `session.json`.
//!
//! Like Chrome, it keeps the last few runs' sessions. Each reopen brings back
//! the newest one not yet reopened. Windows not worth keeping (one untouched
//! tab) send no snapshot, so a run with only those doesn't push out a real
//! session.

use std::collections::{BTreeMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::config::config_dir;
use crate::window;

const FILE: &str = "session.json";
/// How many past sessions to keep.
const HISTORY: usize = 5;

#[derive(Default, Serialize, Deserialize)]
struct SessionFile {
    windows: Vec<Value>,
    /// Earlier runs' windows, newest first.
    #[serde(default)]
    history: Vec<Vec<Value>>,
}

#[derive(Default)]
struct Inner {
    /// Latest snapshot of each open window, keyed by creation order.
    windows: BTreeMap<u32, Value>,
    /// Past sessions not reopened yet, newest first.
    history: VecDeque<Vec<Value>>,
    /// Saved windows waiting for the new windows a reopen opened.
    opening: VecDeque<Value>,
    /// Whether the first window has asked for its snapshot yet.
    started: bool,
    /// Set while quitting, so closing every window doesn't forget them.
    quitting: bool,
}

#[derive(Default)]
pub struct SessionStore(Mutex<Inner>);

fn path() -> PathBuf {
    config_dir().join(FILE)
}

/// Window labels are `main-N`; N is the creation order.
fn order(label: &str) -> u32 {
    label
        .rsplit('-')
        .next()
        .and_then(|n| n.parse().ok())
        .unwrap_or(u32::MAX)
}

impl SessionStore {
    pub fn load() -> Self {
        let saved: SessionFile = std::fs::read(path())
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default();
        let mut history: VecDeque<_> = saved.history.into();
        if !saved.windows.is_empty() {
            history.push_front(saved.windows);
        }
        history.truncate(HISTORY);
        Self(Mutex::new(Inner {
            history,
            ..Default::default()
        }))
    }

    fn write(inner: &Inner) {
        let file = SessionFile {
            windows: inner.windows.values().cloned().collect(),
            history: inner.history.iter().cloned().collect(),
        };
        let path = path();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Write then rename so a crash mid-write can't leave a broken file.
        let tmp = path.with_extension("json.tmp");
        if let Ok(bytes) = serde_json::to_vec(&file)
            && std::fs::write(&tmp, bytes).is_ok()
        {
            let _ = std::fs::rename(&tmp, &path);
        }
    }

    /// A window closed on its own while others stay open: forget it. The last
    /// window, or any window while quitting, is kept for the next launch.
    pub fn window_closed(app: &AppHandle, label: &str) {
        let store = app.state::<SessionStore>();
        let mut inner = store.0.lock().unwrap();
        if inner.quitting || app.webview_windows().is_empty() {
            return;
        }
        if inner.windows.remove(&order(label)).is_some() {
            Self::write(&inner);
        }
    }
}

/// Takes the newest past session and opens a new window for each of its
/// windows, except the first when it goes `here`. None when there's none left.
fn reopen(app: &AppHandle, store: &SessionStore, here: bool) -> Option<Option<Value>> {
    let (mine, others) = {
        let mut inner = store.0.lock().unwrap();
        let mut windows = VecDeque::from(inner.history.pop_front()?);
        let mine = if here { windows.pop_front() } else { None };
        let others = windows.len();
        inner.opening.extend(windows);
        (mine, others)
    };
    for _ in 0..others {
        let _ = window::create(app);
    }
    Some(mine)
}

/// This window's snapshot from the last run, if any. Windows opened by a
/// reopen always get theirs; otherwise only the first window does, when
/// `restore` is on, and it reopens the rest too.
#[tauri::command]
pub fn session_take(
    app: AppHandle,
    store: State<'_, SessionStore>,
    restore: bool,
) -> Option<Value> {
    {
        let mut inner = store.0.lock().unwrap();
        if let Some(snapshot) = inner.opening.pop_front() {
            return Some(snapshot);
        }
        let first = !std::mem::replace(&mut inner.started, true);
        if !(restore && first) {
            return None;
        }
    }
    reopen(&app, &store, true).flatten()
}

#[derive(Serialize)]
pub struct Reopened {
    /// The first window's snapshot, when it opens in the calling window.
    here: Option<Value>,
}

/// Reopens the newest past session not reopened yet. With `here`, its first
/// window opens in the calling window.
#[tauri::command]
pub fn session_reopen(
    app: AppHandle,
    store: State<'_, SessionStore>,
    here: bool,
) -> Option<Reopened> {
    reopen(&app, &store, here).map(|here| Reopened { here })
}

/// Stores this window's snapshot, or forgets the window when it's `null`.
#[tauri::command]
pub fn session_save(window: WebviewWindow, store: State<'_, SessionStore>, snapshot: Value) {
    let mut inner = store.0.lock().unwrap();
    let key = order(window.label());
    if snapshot.is_null() {
        inner.windows.remove(&key);
    } else {
        inner.windows.insert(key, snapshot);
    }
    SessionStore::write(&inner);
}

/// Opens a new window that starts with `snapshot`, such as a saved layout.
#[tauri::command]
pub fn session_open_window(
    app: AppHandle,
    store: State<'_, SessionStore>,
    snapshot: Value,
) -> Result<(), String> {
    store.0.lock().unwrap().opening.push_back(snapshot);
    window::create(&app).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn session_quitting(store: State<'_, SessionStore>) {
    store.0.lock().unwrap().quitting = true;
}
