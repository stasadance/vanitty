# Contributing to Vanitty

Thanks for helping out. Bug reports, fixes and features are all welcome.

## Reporting bugs and asking for features

Open an [issue](https://github.com/stasadance/vanitty/issues). For bugs, include your OS, the Vanitty version, what you did, what you expected and what happened. A screenshot or your `settings.json` helps if the bug is visual or config related.

For a large change, open an issue first so we can agree on the approach before you spend time on it.

## Setting up

Requires Rust, Node 22+, pnpm, and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
pnpm install
pnpm tauri dev
```

The frontend (React 19, Zustand, xterm.js) is in `src/`. The Rust side (PTY, config files, window) is in `src-tauri/src/`. Plugin docs are in [`docs/plugins.md`](docs/plugins.md).

## Before opening a pull request

Run these and make sure they pass (`just check` runs them all, `just format` fixes formatting):

```sh
pnpm typecheck
pnpm format:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Then try your change in `pnpm tauri dev`. Say in the pull request which OS you tested on.

## Pull requests

- Branch from `main` and keep each pull request to one change.
- Write the title as a short imperative sentence, like `Fix cursor blink after resize`. It becomes the commit message on `main`.
- Describe what changed and why. Link the issue it fixes, if any.
- Pull requests are squash merged, so `main` gets one commit per pull request. Commits inside your branch can be as messy as you like.
- Don't bump the version or edit release files; releases are cut separately (see the README).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
