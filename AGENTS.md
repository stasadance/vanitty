# AGENTS.md

Commands are in the `justfile`, contribution rules in `CONTRIBUTING.md`. Run `just check` before a PR; it matches CI.

Things the code won't tell you:

- Cargo embeds the built UI at compile time, so run `just build-ui` once on a fresh clone before any `cargo` command.
- The React Compiler handles memoization. Don't add `useMemo`, `useCallback` or `memo`.
- Linux renders with WebKitGTK, not Chromium. Check CSS and web APIs work there.
- The Linux 1.2 zoom and the NVIDIA `__NV_DISABLE_EXPLICIT_SYNC` workaround are deliberate. Don't remove or replace them.
- `src-tauri/gen/schemas` is generated but committed on purpose; crates.io publishing needs it.
- Never bump versions by hand. `just release` does it.
- Screenshots for the README or site use the default theme.
