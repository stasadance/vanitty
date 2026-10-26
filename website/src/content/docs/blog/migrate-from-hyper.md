---
title: How to move from Hyper to Vanitty
description: "Move from Hyper to Vanitty in a minute: your .hyper.js or hyper.json settings, themes and keymaps are imported on first run."
head:
    - tag: title
      content: "Migrate from Hyper terminal to Vanitty: config, themes and keymaps"
---

Vanitty reads your Hyper config on first run, so most people don't have to do anything. Here's what happens and what to check.

## 1. Install Vanitty

```sh
# macOS and Linux
curl -fsSL https://vanitty.dev/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://vanitty.dev/install.ps1 | iex
```

You can keep Hyper installed. Vanitty only reads its config and never changes it.

## 2. Open Vanitty

On first run it looks for your Hyper config, `.hyper.js` or Hyper 4's `hyper.json`. If it finds one, it writes two files to `~/.config/vanitty` (`%APPDATA%\Vanitty` on Windows):

- `settings.json` with your Hyper `config`. Option names are the same, so `fontSize`, `fontFamily`, `cursorShape`, `padding`, `shell` and the rest carry over as is.
- `keybindings.json` with your Hyper `keymaps`, in a VS Code-style format.

A notice tells you what was imported and anything it skipped. To run it again later, use **Settings > Import Hyper Config**.

## 3. Check your themes

Hyper themes in your `plugins` list move to `"themes"` in `settings.json`, and keep working:

```jsonc
"themes": ["hyper-snazzy"]
```

Vanitty downloads them without running npm and runs them in a sandbox, so a theme can change colors, CSS, fonts, padding and the cursor, but never your shell. You can also pick one from **Settings > Change Theme…**. See [Themes](/docs/themes/).

## 4. Replace other plugins

Hyper plugins that aren't themes don't run in Vanitty, and the import notice lists the ones it skipped. Check the [feature list](/docs/) first, since a lot is built in, including some of Hyper's most-requested features:

- Drag tabs to reorder them
- A theme picker in **Settings > Change Theme…**
- <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+Click to open file paths
- Ligatures with the bundled FiraCode Nerd Font Mono
- Copying to your clipboard from tmux, vim and remote shells (OSC 52)
- Profiles, reopening your last session, and saved layouts

For anything else, Vanitty has its own sandboxed [plugins](/docs/plugins/).

## 5. Things that work differently

- Settings are JSON with comments, not JavaScript. Your editor autocompletes them from the bundled schema, and they reload when you save.
- Keybindings live in their own file, `keybindings.json`. Command names are Hyper's, and `"-tab:new"` removes a default. See [Keybindings](/docs/keybindings/).
- The `hyper` CLI is replaced by `vanitty`. See [Command line](/docs/command-line/).
