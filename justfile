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

# Build release bundles for this platform (without the signed update bundles,
# which need the release signing key)
build:
    pnpm tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'

# Typecheck, format check, lint and test, like CI
check:
    pnpm typecheck
    pnpm format:check
    cargo fmt {{manifest}} --check
    cargo clippy {{manifest}} --all-targets -- -D warnings
    cargo test {{manifest}}

# Format all code
format:
    pnpm format
    cargo fmt {{manifest}}

# Open a PR bumping to the next YY.MM.PATCH; merging it publishes the release
release:
    pnpm release

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
