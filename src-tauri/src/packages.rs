//! Installs Hyper themes and Vanitty plugins from npm and hands their sources
//! to the webview, which runs them in sandboxed workers (see `src/sandbox`).

use std::collections::{BTreeMap, HashSet};
use std::io::Read;
use std::path::{Component, Path, PathBuf};

use nodejs_semver::{Range, Version};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::config::config_dir;

const REGISTRY: &str = "https://registry.npmjs.org";
/// Theme packages are small; anything bigger is not a theme.
const MAX_TARBALL: u64 = 20 * 1024 * 1024;
const MAX_DEPTH: usize = 8;

/// Themes and plugins each get their own `node_modules`.
fn kind_dir(kind: &str) -> Result<PathBuf, String> {
    match kind {
        "themes" | "plugins" => Ok(config_dir().join(kind)),
        _ => Err(format!("unknown package kind: {kind}")),
    }
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .tls_config(
            ureq::tls::TlsConfig::builder()
                .root_certs(ureq::tls::RootCerts::PlatformVerifier)
                .build(),
        )
        .build()
        .into()
}

/// `name`, `name@range`, `@scope/name@range`; Hyper also accepted `name#range`.
fn split_spec(spec: &str) -> (&str, &str) {
    let spec = spec.trim();
    if let Some((name, range)) = spec.split_once('#') {
        return (name, range);
    }
    let at = if let Some(rest) = spec.strip_prefix('@') {
        rest.find('@').map(|i| i + 1)
    } else {
        spec.find('@')
    };
    match at {
        Some(i) => (&spec[..i], &spec[i + 1..]),
        None => (spec, ""),
    }
}

fn valid_name(name: &str) -> bool {
    let body = name.strip_prefix('@').unwrap_or(name);
    !name.is_empty()
        && name.len() <= 214
        && body.split('/').count() <= if name.starts_with('@') { 2 } else { 1 }
        && body.split('/').all(|p| {
            !p.is_empty()
                && p != "."
                && p != ".."
                && p.chars()
                    .all(|c| c.is_ascii_alphanumeric() || "-._~".contains(c))
        })
}

#[derive(Deserialize)]
struct Packument {
    #[serde(rename = "dist-tags", default)]
    dist_tags: BTreeMap<String, String>,
    #[serde(default)]
    versions: BTreeMap<String, Value>,
}

fn installed_version(modules: &Path, name: &str) -> Option<String> {
    let pkg = std::fs::read_to_string(modules.join(name).join("package.json")).ok()?;
    let v: Value = serde_json::from_str(&pkg).ok()?;
    v.get("version")?.as_str().map(str::to_owned)
}

fn satisfies(version: &str, range: &str) -> bool {
    if range.is_empty() || range == "latest" || range == "*" {
        return true;
    }
    match (Version::parse(version), Range::parse(range)) {
        (Ok(v), Ok(r)) => r.satisfies(&v),
        _ => false,
    }
}

fn install_one(
    agent: &ureq::Agent,
    modules: &Path,
    name: &str,
    range: &str,
    force: bool,
    seen: &mut HashSet<String>,
    depth: usize,
) -> Result<(), String> {
    if !valid_name(name) {
        return Err(format!("invalid package name: {name}"));
    }
    if depth > MAX_DEPTH || !seen.insert(name.to_owned()) {
        return Ok(());
    }
    if !force && installed_version(modules, name).is_some_and(|v| satisfies(&v, range)) {
        return Ok(());
    }

    let url = format!("{REGISTRY}/{}", name.replace('/', "%2f"));
    let packument: Packument = agent
        .get(&url)
        .header("Accept", "application/vnd.npm.install-v1+json")
        .call()
        .map_err(|e| format!("{name}: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| format!("{name}: {e}"))?;

    let version = if let Some(tagged) =
        packument
            .dist_tags
            .get(if range.is_empty() { "latest" } else { range })
    {
        tagged.clone()
    } else {
        let range = Range::parse(range).map_err(|e| format!("{name}@{range}: {e}"))?;
        let versions: Vec<Version> = packument
            .versions
            .keys()
            .filter_map(|v| Version::parse(v).ok())
            .collect();
        range
            .max_satisfying(&versions)
            .ok_or_else(|| format!("{name}: no version matches {range}"))?
            .to_string()
    };
    let manifest = packument
        .versions
        .get(&version)
        .ok_or_else(|| format!("{name}@{version} not found"))?;
    let tarball = manifest
        .pointer("/dist/tarball")
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{name}@{version}: no tarball"))?;

    let mut bytes = Vec::new();
    agent
        .get(tarball)
        .call()
        .map_err(|e| format!("{name}: {e}"))?
        .body_mut()
        .as_reader()
        .take(MAX_TARBALL)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("{name}: {e}"))?;

    let dest = modules.join(name);
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    extract(&bytes, &dest).map_err(|e| format!("{name}: {e}"))?;

    if let Some(deps) = manifest.get("dependencies").and_then(Value::as_object) {
        for (dep, range) in deps {
            install_one(
                agent,
                modules,
                dep,
                range.as_str().unwrap_or(""),
                false,
                seen,
                depth + 1,
            )?;
        }
    }
    Ok(())
}

/// Unpacks an npm tarball, dropping its top-level folder and refusing any
/// entry that would land outside `dest`.
fn extract(tgz: &[u8], dest: &Path) -> std::io::Result<()> {
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(tgz));
    for entry in archive.entries()? {
        let mut entry = entry?;
        if !entry.header().entry_type().is_file() {
            continue;
        }
        let path = entry.path()?.into_owned();
        let rel: PathBuf = path.components().skip(1).collect();
        if rel.as_os_str().is_empty()
            || rel.components().any(|c| !matches!(c, Component::Normal(_)))
        {
            continue;
        }
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent)?;
        }
        entry.unpack(&out)?;
    }
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    name: String,
    error: Option<String>,
}

/// Installs any missing packages (and their dependencies) from npm.
#[tauri::command]
pub async fn packages_install(
    kind: String,
    specs: Vec<String>,
    force: bool,
) -> Result<Vec<InstallResult>, String> {
    let modules = kind_dir(&kind)?.join("node_modules");
    tauri::async_runtime::spawn_blocking(move || {
        let agent = agent();
        let mut seen = HashSet::new();
        specs
            .iter()
            .map(|spec| {
                let (name, range) = split_spec(spec);
                InstallResult {
                    name: name.to_owned(),
                    error: install_one(&agent, &modules, name, range, force, &mut seen, 0).err(),
                }
            })
            .collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Every `.js`/`.json` file under the kind's node_modules, keyed by its path
/// relative to node_modules with `/` separators, for the worker's `require`.
/// Local folders under `<kind>/local/<name>` appear as `@local/<name>`.
#[tauri::command]
pub fn packages_sources(kind: String) -> Result<BTreeMap<String, String>, String> {
    let base = kind_dir(&kind)?;
    let mut out = BTreeMap::new();
    let modules = base.join("node_modules");
    collect(&modules, &modules, "", &mut out);
    let local = base.join("local");
    collect(&local, &local, "@local/", &mut out);
    Ok(out)
}

fn collect(root: &Path, dir: &Path, prefix: &str, out: &mut BTreeMap<String, String>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else { continue };
        if ft.is_dir() {
            collect(root, &path, prefix, out);
        } else if ft.is_file()
            && matches!(
                path.extension().and_then(|e| e.to_str()),
                Some("js" | "json" | "cjs")
            )
            && entry.metadata().is_ok_and(|m| m.len() < 2 * 1024 * 1024)
            && let (Ok(rel), Ok(src)) = (path.strip_prefix(root), std::fs::read_to_string(&path))
        {
            let key = rel
                .components()
                .map(|c| c.as_os_str().to_string_lossy())
                .collect::<Vec<_>>()
                .join("/");
            out.insert(format!("{prefix}{key}"), src);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_specs() {
        assert_eq!(split_spec("hyper-snazzy"), ("hyper-snazzy", ""));
        assert_eq!(split_spec("hyper-snazzy@^1"), ("hyper-snazzy", "^1"));
        assert_eq!(split_spec("hyper-snazzy#1.0.0"), ("hyper-snazzy", "1.0.0"));
        assert_eq!(split_spec("@scope/theme"), ("@scope/theme", ""));
        assert_eq!(split_spec("@scope/theme@2.x"), ("@scope/theme", "2.x"));
    }

    #[test]
    fn rejects_bad_names() {
        assert!(valid_name("hyper-snazzy"));
        assert!(valid_name("@scope/theme"));
        assert!(!valid_name("../evil"));
        assert!(!valid_name("a/b"));
        assert!(!valid_name("@scope/../x"));
        assert!(!valid_name(""));
    }
}
