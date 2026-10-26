---
title: A Hyper terminal alternative that's still maintained
description: "Vanitty is a free, open-source Hyper alternative for Windows, macOS and Linux. It keeps Hyper's look, config and themes, rebuilt with Rust and Tauri instead of Electron."
head:
    - tag: title
      content: "Hyper terminal alternative: Vanitty, a maintained open-source rewrite"
---

If you liked Hyper's clean look and its JSON-style config, but you're tired of waiting for updates, Vanitty is built for you. It started as a port of [Hyper](https://github.com/vercel/hyper) and keeps what made it nice, on a smaller and faster base.

## Why look for a Hyper alternative

Hyper's last stable release, 3.4.1, came out in January 2023, and its last canary build in July 2023. Its most-upvoted issues are still open, like dragging tabs to reorder them and slow tab switching on macOS 26, and two of the top ones just ask whether Hyper is still developed. See [Is Hyper terminal still maintained?](/blog/is-hyper-terminal-still-maintained/) for the details.

## What Vanitty keeps from Hyper

- **Your config.** On first run Vanitty imports your `.hyper.js` or `hyper.json`: settings, themes and keymaps. Option names are the same as Hyper's.
- **Your theme.** Hyper themes from npm still work, like `hyper-snazzy` or `hyper-dracula`. Popular ones are reviewed and pinned in the theme picker.
- **The look.** Same minimal window, tabs and splits. Theme CSS works because Vanitty uses Hyper's class names.
- **xterm.js.** The same terminal engine, so programs render the way you're used to.

## What's different

- **No Electron.** Vanitty is built with Rust and [Tauri](https://tauri.app/) and uses the system webview instead of bundling Chromium. The Windows installer is about 9 MB, and the macOS `.dmg` about 20 MB.
- **Safer themes and plugins.** Hyper ran plugins with full access to your machine. Vanitty runs Hyper themes in a sandboxed worker with no network, file or shell access, and its own [plugins](/docs/plugins/) are sandboxed too.
- **Hyper's top requests, built in:** drag tabs to reorder them, a theme picker, Cmd/Ctrl+Click to open file paths, working ligatures, copying from tmux and vim (OSC 52), and reopening your last session or a saved layout with all its tabs and splits.
- **Profiles:** each one with its own shell, arguments, environment and colors, picked from the new-tab menu.
- **VS Code-style settings.** `settings.json` comes with a schema, so your editor autocompletes and validates it, and `keybindings.json` works like VS Code's.
- **Maintained.** Regular releases, and Vanitty updates itself in the background.

## Try it

```sh
# macOS and Linux
curl -fsSL https://vanitty.dev/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://vanitty.dev/install.ps1 | iex
```

Other options are on the [install page](/docs/install/). Moving over takes a minute: [How to move from Hyper to Vanitty](/blog/migrate-from-hyper/).
