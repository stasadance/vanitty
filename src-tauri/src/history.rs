//! Per-pane shell history. Bash starts with Vanitty's startup file, which
//! loads the user's usual ones and also keeps each pane's commands in
//! `history/<pane>`, so a restored pane brings back what ran in it.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::config::config_dir;

const BASH: &str = include_str!("history.bash");

fn dir() -> PathBuf {
    config_dir().join("history")
}

fn script_path() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| config_dir().join("cache"))
        .join("vanitty")
        .join("bash-init.sh")
}

/// Pane ids come from the webview; only plain ones name a file.
fn valid(pane: &str) -> bool {
    !pane.is_empty()
        && pane.len() <= 64
        && pane
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The args and env vars that start bash with Vanitty's startup file.
pub struct Bash {
    pub args: Vec<String>,
    pub env: Vec<(&'static str, String)>,
}

/// How to start `shell` with `args` so it keeps `pane`'s history. None when
/// it isn't bash started the usual way.
pub fn bash(shell: &str, args: &[String], pane: &str) -> Option<Bash> {
    if cfg!(windows) || !valid(pane) || Path::new(shell).file_name()? != "bash" {
        return None;
    }
    let login = match args {
        [] => false,
        [a] if a == "--login" || a == "-l" => true,
        _ => return None,
    };
    let dir = dir();
    create_private_dir(&dir).ok()?;
    let script = script_path();
    if std::fs::read_to_string(&script).ok().as_deref() != Some(BASH) {
        std::fs::create_dir_all(script.parent()?).ok()?;
        std::fs::write(&script, BASH).ok()?;
    }
    let mut env = vec![(
        "VANITTY_HISTORY",
        dir.join(pane).to_string_lossy().into_owned(),
    )];
    if login {
        env.push(("VANITTY_LOGIN", "1".into()));
    }
    Some(Bash {
        args: vec!["--init-file".into(), script.to_string_lossy().into_owned()],
        env,
    })
}

/// History can hold secrets, so only the user may read it.
fn create_private_dir(dir: &Path) -> std::io::Result<()> {
    let mut builder = std::fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(dir)
}

/// Deletes the history of panes that no saved session can reopen.
pub fn prune(keep: &HashSet<&str>) {
    let Ok(entries) = std::fs::read_dir(dir()) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        if name.to_str().is_some_and(|n| !keep.contains(n)) {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_plain_pane_ids() {
        assert!(valid("s1abc2"));
        assert!(!valid(""));
        assert!(!valid("../x"));
        assert!(!valid("a/b"));
    }

    #[test]
    fn only_bash_started_the_usual_way() {
        let login = ["--login".to_string()];
        assert!(bash("/bin/zsh", &login, "s1").is_none());
        assert!(bash("/bin/bash", &["-c".into(), "ls".into()], "s1").is_none());
        assert!(bash("/bin/bash", &login, "../s1").is_none());
    }
}
