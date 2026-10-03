---
title: Keybindings
description: Change shortcuts with keybindings.json.
---

`keybindings.json` sits next to `settings.json` and works like VS Code's. Each entry binds a key to a command. Prefix the command with `-` to remove a default.

```jsonc
[
    { "key": "ctrl+shift+t", "command": "tab:new" },
    { "key": "ctrl+t", "command": "-tab:new" },
]
```

Command names are Hyper's. **Settings > Show Default Keybindings** lists them all for your platform.

## Common defaults

| Command                                 | Linux and Windows                                         | macOS                                         |
| --------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| New tab (`tab:new`)                     | <kbd>Ctrl+Shift+T</kbd>                                   | <kbd>⌘T</kbd>                                 |
| Split right (`pane:splitRight`)         | <kbd>Ctrl+Shift+D</kbd>                                   | <kbd>⌘D</kbd>                                 |
| Split down (`pane:splitDown`)           | <kbd>Ctrl+Shift+E</kbd>                                   | <kbd>⌘⇧D</kbd>                                |
| Close pane (`pane:close`)               | <kbd>Ctrl+Shift+W</kbd>                                   | <kbd>⌘W</kbd>                                 |
| Next tab (`tab:next`)                   | <kbd>Ctrl+Tab</kbd>                                       | <kbd>⌘⇧]</kbd>                                |
| Previous tab (`tab:prev`)               | <kbd>Ctrl+Shift+Tab</kbd>                                 | <kbd>⌘⇧[</kbd>                                |
| Search (`editor:search`)                | <kbd>Ctrl+Shift+F</kbd>                                   | <kbd>⌘F</kbd>                                 |
| Copy (`editor:copy`)                    | <kbd>Ctrl+Shift+C</kbd>                                   | <kbd>⌘C</kbd>                                 |
| Paste (`editor:paste`)                  | <kbd>Ctrl+Shift+V</kbd>                                   | <kbd>⌘V</kbd>                                 |
| Clear (`editor:clearBuffer`)            | <kbd>Ctrl+Shift+K</kbd>                                   | <kbd>⌘K</kbd>                                 |
| New window (`window:new`)               | <kbd>Ctrl+Shift+N</kbd>                                   | <kbd>⌘N</kbd>                                 |
| Settings (`window:preferences`)         | <kbd>Ctrl+,</kbd>                                         | <kbd>⌘,</kbd>                                 |
| Zoom in / out / reset                   | <kbd>Ctrl+=</kbd> / <kbd>Ctrl+-</kbd> / <kbd>Ctrl+0</kbd> | <kbd>⌘=</kbd> / <kbd>⌘-</kbd> / <kbd>⌘0</kbd> |
| Full screen (`window:toggleFullScreen`) | <kbd>F11</kbd>                                            | <kbd>⌘⌃F</kbd>                                |

Plugin commands bind the same way, as `<plugin>:<command>`.
