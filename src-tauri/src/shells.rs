use serde::Serialize;

/// A shell found on this machine, offered as a profile in the new tab menu.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedShell {
    name: String,
    shell: String,
    shell_args: Vec<String>,
}

/// Shells installed on Windows besides the default one. Other platforms have
/// a login shell users already picked, so nothing is added there.
#[tauri::command]
pub async fn shells_detect() -> Vec<DetectedShell> {
    #[cfg(windows)]
    {
        windows::detect()
    }
    #[cfg(not(windows))]
    {
        Vec::new()
    }
}

#[cfg(windows)]
mod windows {
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    use super::{DetectedShell, parse_wsl_list};

    /// Keeps console programs we run from flashing a window.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    pub fn detect() -> Vec<DetectedShell> {
        let system32 = PathBuf::from(std::env::var("SystemRoot").unwrap_or("C:\\Windows".into()))
            .join("System32");
        let mut found = Vec::new();
        let mut add = |name: &str, path: PathBuf, args: &[&str]| {
            if path.is_file() {
                found.push(DetectedShell {
                    name: name.into(),
                    shell: path.to_string_lossy().into_owned(),
                    shell_args: args.iter().map(|a| a.to_string()).collect(),
                });
            }
        };

        add(
            "PowerShell",
            system32.join("WindowsPowerShell\\v1.0\\powershell.exe"),
            &["-NoLogo"],
        );
        if let Some(pwsh) = pwsh() {
            add("PowerShell 7", pwsh, &["-NoLogo"]);
        }
        add("Command Prompt", system32.join("cmd.exe"), &[]);
        if let Some(bash) = git_bash() {
            add("Git Bash", bash, &["--login", "-i"]);
        }
        for distro in wsl_distros(&system32) {
            add(&distro, system32.join("wsl.exe"), &["-d", distro.as_str()]);
        }

        // The default profile already runs COMSPEC.
        let default = crate::pty::default_shell().to_lowercase();
        found.retain(|s| s.shell.to_lowercase() != default);
        found
    }

    fn program_files() -> Vec<PathBuf> {
        [
            "ProgramFiles",
            "ProgramW6432",
            "ProgramFiles(x86)",
            "LOCALAPPDATA",
        ]
        .iter()
        .filter_map(|v| std::env::var_os(v).map(PathBuf::from))
        .collect()
    }

    fn on_path(exe: &str) -> Option<PathBuf> {
        std::env::split_paths(&std::env::var_os("PATH")?)
            .map(|dir| dir.join(exe))
            .find(|p| p.is_file())
    }

    fn pwsh() -> Option<PathBuf> {
        program_files()
            .into_iter()
            .map(|dir| dir.join("PowerShell\\7\\pwsh.exe"))
            .find(|p| p.is_file())
            .or_else(|| on_path("pwsh.exe"))
    }

    /// Git's bash, from the usual install folders or next to git on PATH.
    fn git_bash() -> Option<PathBuf> {
        let installed = program_files()
            .into_iter()
            .flat_map(|dir| [dir.join("Git"), dir.join("Programs\\Git")]);
        // git.exe lives in <root>\cmd or <root>\bin.
        let from_path =
            on_path("git.exe").and_then(|git| git.parent()?.parent().map(Path::to_path_buf));
        installed
            .chain(from_path)
            .map(|root| root.join("bin\\bash.exe"))
            .find(|p| p.is_file())
    }

    fn wsl_distros(system32: &Path) -> Vec<String> {
        let wsl = system32.join("wsl.exe");
        if !wsl.is_file() {
            return Vec::new();
        }
        let Ok(out) = Command::new(wsl)
            .args(["--list", "--quiet"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        else {
            return Vec::new();
        };
        if !out.status.success() {
            return Vec::new();
        }
        parse_wsl_list(&out.stdout)
    }
}

/// `wsl --list` prints UTF-16LE, one distro per line.
#[cfg_attr(not(windows), allow(dead_code))]
fn parse_wsl_list(bytes: &[u8]) -> Vec<String> {
    let units: Vec<u16> = bytes
        .as_chunks::<2>()
        .0
        .iter()
        .map(|&c| u16::from_le_bytes(c))
        .collect();
    String::from_utf16_lossy(&units)
        .lines()
        .map(|l| l.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0'))
        .filter(|l| !l.is_empty() && !l.starts_with("docker-desktop"))
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    #[test]
    fn parses_wsl_list() {
        let text = "\u{feff}Ubuntu\r\ndocker-desktop\r\nDebian\r\n\r\n";
        let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        assert_eq!(super::parse_wsl_list(&bytes), ["Ubuntu", "Debian"]);
    }
}
