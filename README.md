<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img alt="Vanitty" src="docs/assets/logo-light.svg" width="360">
  </picture>
</p>

A fast, native terminal. A Rust + Tauri rewrite of [Hyper](https://github.com/vercel/hyper) without Electron.

## Features

- Tabs, split panes (drag dividers, double-click to even them out), pane and tab navigation
- Search in scrollback (case, whole word, regex)
- Clickable links, inline images, Unicode 11 widths, WebGL rendering
- Ships with FiraCode Nerd Font Mono, with ligatures (`disableLigatures` turns them off)
- Profiles: per-profile shell, args, env and colors, picked from the new-tab menu
- New tabs and splits open in the current directory (`preserveCWD`, macOS and Linux)
- Zoom, full screen, always on top, copy on select, quick edit, bell sound
- Drag files onto a terminal to paste their paths
- Rounded, frameless window on Linux and Windows; native rounded window on macOS
- Hyper themes from npm, run in a sandbox
- Sandboxed JS plugins ([docs/plugins.md](docs/plugins.md))

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
- Auto-update, the `hyper` CLI, `ssh://` links, the Windows Explorer context menu entry

## Install

Installers for Windows and Linux are attached to each [release](https://github.com/stasadance/vanitty/releases).

On Arch Linux, build the package from the repo:

```sh
cd packaging/arch
makepkg -si
```

## Develop

Requires Rust, Node 22+, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

## Releases

Versions are `YY.MM.PATCH`; PATCH starts at 0 each month. `pnpm release` bumps the version, commits and tags it (`--push` also pushes). Pushing a `v*` tag, or running the Release workflow from the Actions tab (which releases the version in `package.json`), runs the Release workflow, which builds Windows (`.msi`, `.exe`) and Linux (`.deb`, `.rpm`, `.AppImage`) installers and attaches them to a GitHub release.

## Stack

Tauri v2, `portable-pty`, xterm.js, React 19 with the React Compiler, Zustand.

FiraCode Nerd Font Mono is © The Fira Code Project Authors and Nerd Fonts, under the SIL Open Font License 1.1 (`public/fonts/LICENSE-FiraCode-NerdFont.txt`).
