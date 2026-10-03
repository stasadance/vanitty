//! The open tabs of every window, kept on disk so the next launch reopens
//! them. Each window's webview builds its own snapshot; this module holds the
//! latest one per window and writes them all to `session.json`.

use std::collections::{BTreeMap, VecDeque};
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::config::config_dir;
use crate::window;

const FILE: &str = "session.json";

#[derive(Default, Serialize, Deserialize)]
struct SessionFile {
    windows: Vec<Value>,
}

#[derive(Default)]
struct Inner {
    /// Latest snapshot of each open window, keyed by creation order.
    windows: BTreeMap<u32, Value>,
    /// Saved windows from the last run that haven't been handed out yet.
    pending: VecDeque<Value>,
    /// Whether the first window has asked for its snapshot yet.
    restoring_started: bool,
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
        Self(Mutex::new(Inner {
            pending: saved.windows.into(),
            ..Default::default()
        }))
    }

    fn write(inner: &Inner) {
        let file = SessionFile {
            windows: inner.windows.values().cloned().collect(),
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

/// This window's snapshot from the last run, if any. The first window to ask
/// also reopens the rest of the saved windows.
#[tauri::command]
pub fn session_take(app: AppHandle, store: State<'_, SessionStore>) -> Option<Value> {
    let (mine, others) = {
        let mut inner = store.0.lock().unwrap();
        let mine = inner.pending.pop_front();
        let others = if inner.restoring_started {
            0
        } else {
            inner.restoring_started = true;
            inner.pending.len()
        };
        (mine, others)
    };
    for _ in 0..others {
        let _ = window::create(&app);
    }
    mine
}

/// Restoring is turned off: drop what was saved.
#[tauri::command]
pub fn session_clear(store: State<'_, SessionStore>) {
    let mut inner = store.0.lock().unwrap();
    inner.pending.clear();
    inner.windows.clear();
    let _ = std::fs::remove_file(path());
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

#[tauri::command]
pub fn session_quitting(store: State<'_, SessionStore>) {
    store.0.lock().unwrap().quitting = true;
}
