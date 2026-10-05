# Contributing to Vanitty

Thanks for helping out. Bug reports, fixes and features are all welcome.

## Reporting bugs and asking for features

Open an [issue](https://github.com/stasadance/vanitty/issues). For bugs, include your OS, the Vanitty version, what you did, what you expected and what happened. A screenshot or your `settings.json` helps if the bug is visual or config related.

For a large change, open an issue first so we can agree on the approach before you spend time on it.

## Setting up

Requires Rust, Node 22+, pnpm, [just](https://github.com/casey/just), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```sh
just install
just dev
```

Common tasks are recipes in the `justfile`; run `just` to list them.

The frontend (React 19, Zustand, xterm.js) is in `src/`. The Rust side (PTY, config files, window) is in `src-tauri/src/`. Plugin docs are in [`docs/plugins.md`](docs/plugins.md).

## Before opening a pull request

Run `just check` and make sure it passes. It runs the same typecheck, lint, format, clippy and test steps as CI. `just format` fixes formatting, and `pnpm lint --fix` fixes most lint errors.

Then try your change in `just dev`. Say in the pull request which OS you tested on.

## Pull requests

- Branch from `main` and keep each pull request to one change.
- Write the title as a short imperative sentence, like `Fix cursor blink after resize`. It becomes the commit message on `main`.
- Describe what changed and why. Link the issue it fixes, if any.
- Pull requests are squash merged, so `main` gets one commit per pull request. Commits inside your branch can be as messy as you like.
- Don't bump the version or edit release files; releases are cut separately (see the README).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
