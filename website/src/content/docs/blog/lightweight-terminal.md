---
title: A lightweight terminal without Electron
description: "Vanitty is a lightweight, open-source terminal emulator built with Rust and Tauri. It uses the system webview instead of bundling Chromium, so installers are about 10 MB."
head:
    - tag: title
      content: "Lightweight terminal emulator without Electron: Vanitty (Rust + Tauri)"
---

Web-based terminals are easy to theme and extend, but most of them are Electron apps: each one ships its own copy of Chromium. That makes the download big and every update heavy.

Vanitty keeps the web-based UI and drops the bundled browser.

## How it's built

- **Rust and [Tauri](https://tauri.app/).** The window, shells and file access are native Rust. The UI runs in the webview your OS already has: WebView2 on Windows, WebKit on macOS and WebKitGTK on Linux.
- **xterm.js with WebGL.** The same terminal engine VS Code uses, drawing on the GPU.
- **Small installers.** About 9 MB for the Windows setup `.exe`, 10 MB for the `.deb`, `.rpm` and `.msi`, and 20 MB for the universal macOS `.dmg`.

## Still easy to customize

- Settings in `settings.json`, with a schema so your editor autocompletes them
- Themes as plain JSON, or Hyper themes from npm, run in a sandbox
- Sandboxed JS [plugins](/docs/plugins/)
- Ships with FiraCode Nerd Font Mono and ligatures

## Install

```sh
# macOS and Linux
curl -fsSL https://vanitty.dev/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://vanitty.dev/install.ps1 | iex
```

Vanitty updates itself in the background. See [Install](/docs/install/) for other options.
