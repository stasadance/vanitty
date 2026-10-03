---
title: Develop
description: Build Vanitty from source.
---

Requires Rust, Node 22+, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

## Stack

Tauri v2, `portable-pty`, xterm.js, React 19 with the React Compiler, Zustand.

## Releases

Versions are `YY.MM.PATCH`; PATCH starts at 0 each month. `pnpm release` bumps the version, commits and tags it (`--push` also pushes). Pushing a `v*` tag, or running the Release workflow from the Actions tab, builds Windows (`.msi`, `.exe`) and Linux (`.deb`, `.rpm`, `.AppImage`) installers and attaches them to a GitHub release.

## This website

The site lives in `website/` and uses Astro with Starlight.

```sh
cd website
pnpm install
pnpm dev
```
