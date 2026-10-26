---
title: Reopen your terminal tabs and splits after a restart
description: "Close your terminal or reboot, and get your windows, tabs, split panes, folders and scrollback back. Vanitty restores sessions and saves layouts."
head:
    - tag: title
      content: "Restore terminal tabs, splits and history after a restart: Vanitty"
---

You've set up a window with a server in one pane, logs in another and a shell in a third, in the right folders. Then the terminal closes, or you reboot, and you're building it again from scratch.

Vanitty brings it back.

## Reopen your last session

**Shell > Reopen Last Session** (<kbd>⌘⇧T</kbd> on macOS, <kbd>Ctrl+Shift+Alt+T</kbd> on Linux and Windows) restores:

- every window, with its size
- every tab and split pane
- the folder each pane was in
- the text that was on screen

Press it again for the session before that. The last five are kept.

To get it all back on every launch without asking, turn on `restoreSession` in `settings.json`:

```jsonc
"restoreSession": true
```

In bash, each pane also gets back the commands that ran in it, so pressing the up arrow brings those back first. `restorePaneHistory` turns that off.

## Save layouts you use every day

For setups you open again and again, **Shell > Save Layout…** names the current window's tabs, splits and folders. **Shell > Open Layout…** (<kbd>⌘⇧L</kbd>, <kbd>Ctrl+Shift+L</kbd> on Linux and Windows) opens one again with fresh shells.

Layouts live in `layouts.json` next to your settings, so you can keep them in your dotfiles too.

## Try it

Vanitty is a free, open-source terminal for Windows, macOS and Linux. See [Install](/docs/install/).
