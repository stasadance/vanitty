---
title: Install
description: Download Vanitty for Windows, Linux and macOS.
---

Installers for Windows, Linux and macOS are attached to each [GitHub release](https://github.com/stasadance/vanitty/releases):

| Platform | Files |
| --- | --- |
| Windows | `.msi`, `.exe` |
| Debian, Ubuntu | `.deb` |
| Fedora, openSUSE | `.rpm` |
| Any Linux | `.AppImage` |
| macOS (Apple Silicon and Intel) | `.dmg` |

## macOS

The macOS build isn't notarized yet, so macOS blocks it on first launch. After moving Vanitty to Applications, either open it once, then click **Open Anyway** in System Settings > Privacy & Security, or run:

```sh
xattr -dr com.apple.quarantine /Applications/Vanitty.app
```

## Arch Linux

Build the package from the repo:

```sh
git clone https://github.com/stasadance/vanitty
cd vanitty/packaging/arch
makepkg -si
```

## Coming from Hyper

On first run, Vanitty imports your Hyper config (`hyper.json` or `.hyper.js`) if it finds one. **Settings > Import Hyper Config** does it again later.
