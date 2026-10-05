---
title: Develop
description: "Build the Vanitty terminal from source with Rust, Tauri and pnpm."
---

Requires Rust, Node 22+, pnpm, [just](https://github.com/casey/just), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
just install
just dev
```

Common tasks are recipes in the `justfile`; run `just` to list them. Cargo embeds the built UI, so run `just build-ui` once before running `cargo` directly.

The frontend (React 19, Zustand, xterm.js) is in `src/`. The Rust side (PTY, config files, window) is in `src-tauri/src/`.

## Before opening a pull request

Run `just check` and make sure it passes. It runs the same typecheck, lint, format, clippy and test steps as CI. `just format` fixes formatting, and `pnpm lint --fix` fixes most lint errors. See [CONTRIBUTING.md](https://github.com/stasadance/vanitty/blob/main/CONTRIBUTING.md) for the rest.

## Stack

Tauri v2, `portable-pty`, xterm.js, React 19 with the React Compiler, Zustand.

## Releases

Versions are `YY.MM.PATCH`; PATCH starts at 0 each month. `just release` bumps the version on a `release/v…` branch and opens a PR. Merging it runs the Release workflow, which tags the version and builds Windows (`.msi`, `.exe`) Linux (`.deb`, `.rpm`, `.AppImage`) and macOS (`.dmg`) installers, attached to a GitHub release with notes generated from the merged PRs. The workflow can also be run by hand from the Actions tab; it skips versions that are already released.

## This website

The site lives in `website/` and uses Astro with Starlight. Run it locally with:

```sh
just site
```
