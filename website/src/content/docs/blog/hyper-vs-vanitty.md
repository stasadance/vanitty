---
title: Hyper vs Vanitty
description: "Hyper vs Vanitty compared: Electron vs Rust and Tauri, config, themes, plugins, features and maintenance."
head:
    - tag: title
      content: "Hyper vs Vanitty: terminal comparison"
---

Vanitty started as a port of Hyper, so they look and feel alike. Here's how they differ.

|                          | Hyper                                | Vanitty                                          |
| ------------------------ | ------------------------------------ | ------------------------------------------------ |
| Built with               | Electron (bundles Chromium)          | Rust and Tauri (uses the system webview)         |
| Terminal engine          | xterm.js                             | xterm.js with WebGL                              |
| Last release             | 3.4.1, January 2023                  | Regular releases, updates itself                 |
| Platforms                | Windows, macOS, Linux                | Windows, macOS, Linux                            |
| Config                   | `.hyper.js` (JavaScript)             | `settings.json` with a schema, imports Hyper's   |
| Keybindings              | `keymaps` in the config              | `keybindings.json`, VS Code style                |
| Themes                   | npm packages                         | Same Hyper themes, sandboxed, plus JSON themes   |
| Plugins                  | npm packages with full system access | Sandboxed JS plugins                             |
| Drag tabs to reorder     | No (its most-upvoted issue)          | Yes                                              |
| Theme picker             | No                                   | Yes                                              |
| Open file paths on click | No                                   | <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+Click             |
| Restore last session     | No                                   | Windows, tabs, splits, folders and terminal text |
| Saved layouts            | No                                   | Yes                                              |
| License                  | MIT                                  | MIT                                              |

## When to stay on Hyper

If you depend on a Hyper plugin that isn't a theme and has no built-in replacement, Hyper is still the only place it runs.

## When to switch

If you mostly use Hyper for its look, a theme and a few settings, Vanitty gives you the same setup, maintained. It imports your config on first run: [How to move from Hyper to Vanitty](/blog/migrate-from-hyper/).
