---
title: Install
description: Download Vanitty for Windows and Linux.
---

Installers for Windows and Linux are attached to each [GitHub release](https://github.com/stasadance/vanitty/releases):

| Platform | Files |
| --- | --- |
| Windows | `.msi`, `.exe` |
| Debian, Ubuntu | `.deb` |
| Fedora, openSUSE | `.rpm` |
| Any Linux | `.AppImage` |

## Arch Linux

Build the package from the repo:

```sh
git clone https://github.com/stasadance/vanitty
cd vanitty/packaging/arch
makepkg -si
```

## Coming from Hyper

On first run, Vanitty imports your Hyper config (`hyper.json` or `.hyper.js`) if it finds one. **Settings > Import Hyper Config** does it again later.
