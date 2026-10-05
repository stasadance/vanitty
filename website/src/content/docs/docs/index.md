---
title: Introduction
description: "Vanitty is a free, open-source terminal emulator for Windows, macOS and Linux, built with Rust and Tauri."
head:
    - tag: title
      content: "Vanitty docs: open-source terminal emulator, a Hyper alternative"
---

Vanitty is a fast, native terminal. It's built with Rust and Tauri.

## Features

- Tabs, split panes (drag dividers, double-click to even them out), pane and tab navigation
- Search in scrollback (case, whole word, regex)
- Clickable links, inline images, Unicode 11 widths, WebGL rendering
- Ships with FiraCode Nerd Font Mono, with ligatures (`disableLigatures` turns them off)
- Profiles: per-profile shell, args, env and colors, picked from the new-tab menu
- New tabs and splits open in the current directory (`preserveCWD`, macOS and Linux)
- Reopens your windows, tabs, splits, folders and terminal text on launch (`restoreSession`), and remembers window size
- Zoom, full screen, always on top, copy on select, quick edit, bell sound
- Drag files onto a terminal to paste their paths
- Rounded, frameless window on Linux and Windows; native rounded window on macOS
- [Theme picker](/docs/themes/) with built-in themes, your own JSON themes and reviewed Hyper themes; Hyper themes from npm run in a sandbox
- [Sandboxed JS plugins](/docs/plugins/)

## Not supported (yet)

- Hyper plugins other than themes (use Vanitty plugins instead)
- The `hyper` CLI, `ssh://` links, the Windows Explorer context menu entry
