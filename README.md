# Vanitty

A fast, native terminal. A Rust + Tauri rewrite of [Hyper](https://github.com/vercel/hyper).

## Stack

- Tauri v2 (Rust backend, system webview)
- `portable-pty` for the shell process
- xterm.js with the WebGL renderer
- React 19 + React Compiler, Zustand for state

## Develop

Requires Rust, Node 22+, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```
