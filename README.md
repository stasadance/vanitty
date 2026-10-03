<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img alt="Vanitty" src="docs/assets/logo-light.svg" width="360">
  </picture>
</p>

A fast, native terminal. A Rust + Tauri rewrite of [Hyper](https://github.com/vercel/hyper) without Electron.

**[Website and docs](https://vanitty.dev)**

<p align="center"><img alt="Vanitty with neofetch and git log" src="docs/assets/screenshots/hero.png"></p>

## Features

- Tabs, split panes (drag dividers, double-click to even them out), pane and tab navigation
- Search in scrollback (case, whole word, regex)
- Clickable links, inline images, Unicode 11 widths, WebGL rendering
- Ships with FiraCode Nerd Font Mono, with ligatures (`disableLigatures` turns them off)
- Profiles: per-profile shell, args, env and colors, picked from the new-tab menu
- New tabs and splits open in the current directory (`preserveCWD`, macOS and Linux)
- Zoom, full screen, always on top, copy on select, quick edit, bell sound
- Drag files onto a terminal to paste their paths
- Reopens your windows, tabs, splits, folders and terminal text on launch (`restoreSession`), and remembers window size
- Rounded, frameless window on Linux and Windows; native rounded window on macOS
- Hyper themes from npm, run in a sandbox
- Sandboxed JS plugins ([docs/plugins.md](docs/plugins.md))

## Install

**macOS and Linux**

```sh
curl -fsSL https://vanitty.dev/install.sh | sh
```

**Windows** (PowerShell)

```powershell
irm https://vanitty.dev/install.ps1 | iex
```

The script downloads the latest release, checks its SHA-256 and installs it: `Vanitty.app` in `/Applications` on macOS, the AppImage in `~/.local/share/vanitty` with a menu entry and a `vanitty` command on Linux (no root needed), and the per-user installer on Windows. Run the macOS/Linux script with `sh -s -- --uninstall` to remove Vanitty; on Windows use Settings > Apps.

Vanitty then updates itself in the background and shows a "Restart to update" notice when a new version is ready. Set `"disableAutoUpdates": true` in your settings to turn that off.

### Manual download

Every [release](https://github.com/stasadance/vanitty/releases/latest) has:

| Platform                        | Files                           |
| ------------------------------- | ------------------------------- |
| Windows                         | `.exe` (per-user setup), `.msi` |
| macOS (Apple Silicon and Intel) | `.dmg`                          |
| Debian, Ubuntu                  | `.deb`                          |
| Fedora, openSUSE                | `.rpm`                          |
| Any Linux                       | `.AppImage`                     |

The macOS build isn't notarized yet, so macOS blocks a downloaded `.dmg` on first launch (the install script avoids this). After moving Vanitty to Applications, either open it once, then click **Open Anyway** in System Settings > Privacy & Security, or run:

```sh
xattr -dr com.apple.quarantine /Applications/Vanitty.app
```

### Arch Linux

Build the package from the repo:

```sh
cd packaging/arch
makepkg -si
```

### From source

```sh
cargo install vanitty
```

Needs Rust and the [Tauri prerequisites](https://tauri.app/start/prerequisites/). Builds from source don't update themselves.

## Settings

Settings live in `~/.config/vanitty` (`%APPDATA%\Vanitty` on Windows, or `$XDG_CONFIG_HOME/vanitty`):

- `settings.json` takes the same options as Hyper's `config`, as JSON with comments. A JSON schema sits next to it, so VS Code autocompletes and validates it.
- `keybindings.json` works like VS Code's: `{ "key": "ctrl+shift+t", "command": "tab:new" }`, and `"-tab:new"` removes a default. Command names are Hyper's. "Settings > Show Default Keybindings" lists them all.

Both reload as soon as you save. On first run, Vanitty imports your Hyper config (`hyper.json` or `.hyper.js`) if it finds one; "Settings > Import Hyper Config" does it again later.

### Themes

Add Hyper theme packages from npm:

```jsonc
"themes": ["hyper-snazzy"]
```

They're downloaded into `themes/` and their `decorateConfig` runs in a Web Worker with no DOM, network or IPC access. Theme CSS works because Vanitty uses Hyper's class names.

### Not supported (yet)

- Hyper plugins other than themes (use Vanitty plugins instead)
- The `hyper` CLI, `ssh://` links, the Windows Explorer context menu entry

## Develop

Requires Rust, Node 22+, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

## Releases

Versions are `YY.MM.PATCH`; PATCH starts at 0 each month. `just release` (or `pnpm release`) bumps the version on a `release/v…` branch and opens a PR. Merging it runs the Release workflow, which tags the version and builds Windows (`.msi`, `.exe`) Linux (`.deb`, `.rpm`, `.AppImage`) and macOS (`.dmg`) installers, attached to a GitHub release with notes generated from the merged PRs. The workflow can also be run by hand from the Actions tab; it skips versions that are already released.

## Stack

Tauri v2, `portable-pty`, xterm.js, React 19 with the React Compiler, Zustand.

FiraCode Nerd Font Mono is © The Fira Code Project Authors and Nerd Fonts, under the SIL Open Font License 1.1 (`public/fonts/LICENSE-FiraCode-NerdFont.txt`).

## Support

Vanitty is free and open source. If it's part of your day, [sponsoring on GitHub](https://github.com/sponsors/stasadance) helps fund fixes, new features and releases.
