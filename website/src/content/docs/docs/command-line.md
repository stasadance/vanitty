---
title: Command line
description: "Open Vanitty terminal tabs and windows from your shell with the vanitty command."
---

The `vanitty` command opens a new tab in the Vanitty window you used last, or starts Vanitty if it isn't running.

```sh
vanitty               # new tab in the current folder
vanitty ~/code        # new tab in ~/code
vanitty -w .          # new window instead of a tab
vanitty -- htop       # run htop in a new tab
vanitty --help        # all options
```

A command after `--` runs instead of your shell. Its tab closes when it exits, unless it fails: then the output stays until you press a key.

## Getting the command

- **Linux**: the install script, `.deb`, `.rpm` and Arch package all put `vanitty` on your PATH.
- **macOS**: choose **Vanitty > Install vanitty Command…**. It adds `/usr/local/bin/vanitty` and asks for your password if that folder needs it.
- **Windows**: the setup `.exe` adds Vanitty to your PATH. Open a new terminal after installing so it picks that up. The `.msi` doesn't.
