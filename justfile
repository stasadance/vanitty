# Run `just` to list recipes.

manifest := "--manifest-path src-tauri/Cargo.toml"

[private]
default:
    @just --list

# Install frontend dependencies
install:
    pnpm install

# Run the app with hot reload
dev:
    pnpm tauri dev

# Build the UI into src-tauri/dist
build-ui:
    pnpm build

# Build release bundles for this platform
build:
    pnpm tauri build

# Typecheck, format check, lint and test, like CI
check:
    pnpm typecheck
    cargo fmt {{manifest}} --check
    cargo clippy {{manifest}} --all-targets -- -D warnings
    cargo test {{manifest}}

# Format Rust code
fmt:
    cargo fmt {{manifest}}

# Bump to the next YY.MM.PATCH, commit and tag; `just release --push` also pushes
release *args:
    pnpm release {{args}}

# Publish the vanitty crate to crates.io
publish:
    pnpm build
    cd src-tauri && cargo publish --allow-dirty

# Build and install the Arch package
arch:
    cd packaging/arch && makepkg -si

# Run the website locally
site:
    cd website && pnpm install && pnpm dev
