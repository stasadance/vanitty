---
title: One terminal for Windows, macOS and Linux
description: "Vanitty is a free cross-platform terminal emulator. Use the same settings, themes and keybindings on Windows, macOS and Linux."
head:
    - tag: title
      content: "Cross-platform terminal emulator for Windows, macOS and Linux: Vanitty"
---

If you work on more than one operating system, you probably use a different terminal on each: Windows Terminal at work, iTerm2 or Terminal.app on a Mac, whatever your Linux desktop ships with. Each has its own settings, themes and shortcuts.

Vanitty runs on all three, so you set it up once.

## The same setup everywhere

- **One config format.** Settings are a `settings.json` and keybindings a `keybindings.json`, the same on every OS. They live in `~/.config/vanitty` on macOS and Linux and `%APPDATA%\Vanitty` on Windows.
- **Put it in your dotfiles.** Since it's two JSON files, you can keep them in git and link them on each machine. Changes apply as soon as you save.
- **Same font everywhere.** Vanitty ships with FiraCode Nerd Font Mono, so prompts, icons and ligatures look the same without installing fonts on each machine.
- **Same themes.** Built-in themes, your own JSON themes, or Hyper themes from npm, picked from **Settings > Change Theme…**.

## Different shells, one place

Profiles let each tab run a different shell with its own arguments, environment and colors. On Windows, Vanitty finds PowerShell, PowerShell 7, Command Prompt, Git Bash and each WSL distro on its own and lists them in the new-tab menu.

```jsonc
"profiles": [
  { "name": "zsh", "config": { "shell": "/bin/zsh" } },
  { "name": "PowerShell", "config": { "shell": "pwsh.exe", "backgroundColor": "#012456" } }
]
```

## Install

```sh
# macOS and Linux
curl -fsSL https://vanitty.dev/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://vanitty.dev/install.ps1 | iex
```

There are also `.deb`, `.rpm`, AppImage, `.dmg`, `.msi` and `.exe` downloads. See [Install](/docs/install/).
