//! `ssh://` links clicked in a terminal. A link only ever becomes `ssh` run
//! directly with separate arguments, never a shell command line, and only
//! after the user confirms it in the UI. Every part of the URL is checked
//! against an allowlist first: hosts or users starting with `-` would be read
//! as ssh flags, and OpenSSH puts both into `ProxyCommand` shell lines.

use std::ffi::OsString;
use std::net::Ipv6Addr;
use std::path::PathBuf;

use serde::Serialize;

#[derive(Debug, PartialEq)]
struct Target {
    user: Option<String>,
    host: String,
    port: Option<u16>,
}

/// What the UI shows in its prompt and runs once the user confirms.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshLink {
    /// `user@host`, or the host alone.
    destination: String,
    port: Option<u16>,
    program: String,
    args: Vec<String>,
}

/// `ssh://[user@]host[:port][/]`. No passwords, `;` parameters, paths,
/// queries or `%` escapes.
fn parse(url: &str) -> Option<Target> {
    let scheme = url.get(..6)?;
    if !scheme.eq_ignore_ascii_case("ssh://") {
        return None;
    }
    let rest = &url[6..];
    let rest = rest.strip_suffix('/').unwrap_or(rest);
    let (user, hostport) = match rest.split_once('@') {
        Some((user, hostport)) => (Some(user), hostport),
        None => (None, rest),
    };
    if user.is_some_and(|u| !is_user(u)) {
        return None;
    }
    let (host, port) = if let Some(v6) = hostport.strip_prefix('[') {
        let (addr, after) = v6.split_once(']')?;
        let addr = addr.parse::<Ipv6Addr>().ok()?;
        (addr.to_string(), after)
    } else {
        let end = hostport.find(':').unwrap_or(hostport.len());
        let host = &hostport[..end];
        if !is_hostname(host) {
            return None;
        }
        (host.to_ascii_lowercase(), &hostport[end..])
    };
    let port = match port.strip_prefix(':') {
        None if port.is_empty() => None,
        None => return None,
        Some(p) => Some(parse_port(p)?),
    };
    Some(Target {
        user: user.map(str::to_owned),
        host,
        port,
    })
}

fn is_user(user: &str) -> bool {
    (1..=64).contains(&user.len())
        && !user.starts_with(['-', '.'])
        && user
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

/// ASCII letters, digits and inner hyphens, in dot-separated labels. Also
/// covers IPv4.
fn is_hostname(host: &str) -> bool {
    (1..=253).contains(&host.len())
        && host.split('.').all(|label| {
            (1..=63).contains(&label.len())
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
}

fn parse_port(port: &str) -> Option<u16> {
    if !(1..=5).contains(&port.len()) || !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    port.parse().ok().filter(|&p| p != 0)
}

fn args(target: &Target) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(port) = target.port {
        args.extend(["-p".into(), port.to_string()]);
    }
    if let Some(user) = &target.user {
        args.extend(["-l".into(), user.clone()]);
    }
    args.extend(["--".into(), target.host.clone()]);
    args
}

/// `ssh` from absolute `PATH` entries only. Spawning a bare name would let
/// the PTY library resolve relative entries against the tab's folder, and on
/// Windows fall back to the current folder, so a planted `ssh.exe` in a
/// cloned repo could run instead.
fn find_ssh(path: Option<OsString>) -> Option<PathBuf> {
    let name = if cfg!(windows) { "ssh.exe" } else { "ssh" };
    let system = cfg!(windows)
        .then(|| std::env::var_os("SystemRoot"))
        .flatten()
        .map(|root| PathBuf::from(root).join(r"System32\OpenSSH"));
    system
        .into_iter()
        .chain(path.iter().flat_map(std::env::split_paths))
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(name))
        .find(|exe| exe.is_file())
}

/// Checks a clicked `ssh://` link. Running it is up to the UI's prompt.
#[tauri::command]
pub fn ssh_link(url: String) -> Result<SshLink, String> {
    let target = parse(&url).ok_or_else(|| {
        format!("Not connecting to {url}: only ssh://user@host:port links with a plain user name and host open.")
    })?;
    let program = find_ssh(std::env::var_os("PATH"))
        .ok_or("Couldn't find ssh. Install OpenSSH to open ssh:// links.")?;
    Ok(SshLink {
        destination: match &target.user {
            Some(user) => format!("{user}@{}", target.host),
            None => target.host.clone(),
        },
        port: target.port,
        program: program.to_string_lossy().into_owned(),
        args: args(&target),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn target(user: Option<&str>, host: &str, port: Option<u16>) -> Option<Target> {
        Some(Target {
            user: user.map(Into::into),
            host: host.into(),
            port,
        })
    }

    #[test]
    fn parses_plain_links() {
        assert_eq!(
            parse("ssh://example.com"),
            target(None, "example.com", None)
        );
        assert_eq!(
            parse("SSH://Bob@Example.COM:2222/"),
            target(Some("Bob"), "example.com", Some(2222))
        );
        assert_eq!(
            parse("ssh://deploy_user.1@10.0.0.5:22"),
            target(Some("deploy_user.1"), "10.0.0.5", Some(22))
        );
        assert_eq!(
            parse("ssh://me@[2001:db8::1]:2200"),
            target(Some("me"), "2001:db8::1", Some(2200))
        );
        assert_eq!(parse("ssh://[::1]"), target(None, "::1", None));
        assert_eq!(parse("ssh://localhost"), target(None, "localhost", None));
    }

    #[test]
    fn refuses_known_attacks() {
        for url in [
            // Hyper: shell metacharacters with $IFS for spaces.
            "ssh://example.com&open$IFS-aCalculator/",
            // iTerm2 CVE-2023-46322: host read as an ssh flag.
            "ssh://-E.profile/`touch pwned`",
            // git CVE-2017-1000117.
            "ssh://-oProxyCommand=touch%20pwned/x",
            "ssh://-oProxyCommand=calc",
            "ssh://user@-oProxyCommand=calc",
            "ssh://-l@host",
            "ssh://-p@host",
            // Blink: decoded newlines and backspaces typed into a shell.
            "ssh://user@host%0A",
            "ssh://user@host%08%08%08%08curl",
            "ssh://user@-o%20%27StrictHostKeyChecking%20no%27%20host%0A",
            // OpenSSH CVE-2023-51385 / CVE-2025-61984: user expanded into ProxyCommand.
            "ssh://$(touch pwned)@host",
            "ssh://`id`@host",
            "ssh://a;id@host",
            "ssh://a|id@host",
            "ssh://a\nsource x@host",
            "ssh://$[+]@host",
            "ssh://host\n",
            "ssh://host\r\nrm",
            "ssh://host\0",
            "ssh://host\x1b[2J",
        ] {
            assert_eq!(parse(url), None, "{url:?}");
        }
    }

    #[test]
    fn refuses_anything_outside_the_allowlist() {
        for url in [
            "ssh://",
            "ssh://@host",
            "ssh://user@",
            "ssh:/host",
            "sshx://host",
            "http://host",
            "ssh://user:password@host",
            "ssh://user;fingerprint=ssh-rsa-abc@host",
            "ssh://a@b@host",
            "ssh://host/path",
            "ssh://host//",
            "ssh://host?x=1",
            "ssh://host#x",
            "ssh://host:",
            "ssh://host:0",
            "ssh://host:65536",
            "ssh://host:123456",
            "ssh://host:-22",
            "ssh://host:+22",
            "ssh://host:22:22",
            "ssh://host name",
            "ssh://ho%73t",
            "ssh://host_name",
            "ssh://-host",
            "ssh://host-",
            "ssh://host..com",
            "ssh://.host",
            "ssh://.user@host",
            "ssh://exаmple.com", // Cyrillic а
            "ssh://example.com.",
            "ssh://[fe80::1%25eth0]",
            "ssh://[not:an:ip:zz]",
            "ssh://[::1",
            "ssh://[::1]x",
            "ssh://~/.ssh",
            "ssh://%2Doevil",
        ] {
            assert_eq!(parse(url), None, "{url:?}");
        }
        assert_eq!(parse(&format!("ssh://{}", "a".repeat(64))), None);
        assert_eq!(parse(&format!("ssh://{}@h", "a".repeat(65))), None);
    }

    #[test]
    fn host_always_follows_end_of_options() {
        assert_eq!(
            args(&parse("ssh://bob@example.com:2222").unwrap()),
            ["-p", "2222", "-l", "bob", "--", "example.com"]
        );
        assert_eq!(args(&parse("ssh://[::1]").unwrap()), ["--", "::1"]);
    }

    #[test]
    fn finds_ssh_only_in_absolute_path_entries() {
        let dir = std::env::temp_dir().join(format!("vanitty-ssh-{}", std::process::id()));
        let bin = dir.join("bin");
        std::fs::create_dir_all(&bin).unwrap();
        let name = if cfg!(windows) { "ssh.exe" } else { "ssh" };
        std::fs::write(bin.join(name), "").unwrap();

        if !cfg!(windows) {
            let relative = std::env::join_paths(["bin", "."]).unwrap();
            assert_eq!(find_ssh(Some(relative)), None);
        }
        let absolute = std::env::join_paths([bin.clone()]).unwrap();
        assert_eq!(find_ssh(Some(absolute)), Some(bin.join(name)));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
