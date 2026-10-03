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

Versions are `YY.MM.PATCH`; PATCH starts at 0 each month. `just release` (or `pnpm release`) bumps the version on a `release/v…` branch and opens a PR. Merging it runs the Release workflow, which tags the version and builds Windows (`.msi`, `.exe`) Linux (`.deb`, `.rpm`, `.AppImage`) and macOS (`.dmg`) installers, attached to a GitHub release with notes generated from the merged PRs. The workflow can also be run by hand from the Actions tab; it skips versions that are already released.

## This website

The site lives in `website/` and uses Astro with Starlight.

```sh
cd website
pnpm install
pnpm dev
```
