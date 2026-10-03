#!/bin/sh
# Installs the latest Vanitty release on macOS or Linux.
#
#   curl -fsSL https://vanitty.dev/install.sh | sh
#   curl -fsSL https://vanitty.dev/install.sh | sh -s -- --uninstall
#
# macOS: copies Vanitty.app to /Applications (~/Applications if that isn't
# writable). Linux: puts the AppImage in ~/.local/share/vanitty, links it to
# ~/.local/bin/vanitty and adds a menu entry. No root needed on Linux.
# VANITTY_VERSION=26.10.0 installs a specific version.
set -eu

REPO="stasadance/vanitty"

say() { printf '%s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" > /dev/null 2>&1; }

fetch() { curl -fsSL --proto '=https' --tlsv1.2 --retry 3 "$@"; }

sha256() {
  if has sha256sum; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Prints "<url> <sha256>" for the release asset whose name ends with $1.
find_asset() {
  if [ -n "${VANITTY_VERSION:-}" ]; then
    api="https://api.github.com/repos/$REPO/releases/tags/v${VANITTY_VERSION#v}"
  else
    api="https://api.github.com/repos/$REPO/releases/latest"
  fi
  json=$(fetch -H 'Accept: application/vnd.github+json' "$api") \
    || die "couldn't find the release at $api"
  printf '%s\n' "$json" \
    | grep -oE '"(url|name|digest|browser_download_url)": *"[^"]*"' \
    | sed -E 's/^"([a-z_]+)": *"(.*)"$/\1 \2/' \
    | awk -v suffix="$1" '
        function flush() {
          if (name != "" && substr(name, length(name) - length(suffix) + 1) == suffix) {
            sub(/^sha256:/, "", digest); print url, digest; found = 1; exit
          }
          name = ""; url = ""; digest = ""
        }
        $1 == "url" && $2 ~ /\/releases\/assets\// { flush() }
        $1 == "name" { name = $2 }
        $1 == "digest" { digest = $2 }
        $1 == "browser_download_url" { url = $2 }
        END { if (!found) flush() }
      '
}

download() {
  asset=$(find_asset "$1")
  [ -n "$asset" ] || die "no $1 in the release. See https://github.com/$REPO/releases"
  url=${asset%% *}
  digest=${asset#* }
  say "Downloading $url"
  fetch -o "$2" "$url"
  if [ -n "$digest" ]; then
    [ "$(sha256 "$2")" = "$digest" ] || die "checksum mismatch for $url"
  fi
}

tmp=$(mktemp -d)
cleanup() {
  [ -n "${mnt:-}" ] && hdiutil detach -quiet "$mnt" 2> /dev/null || true
  rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

# --- macOS -------------------------------------------------------------------

mac_target() {
  if [ -d /Applications/Vanitty.app ] || [ -w /Applications ]; then
    echo /Applications
  else
    echo "$HOME/Applications"
  fi
}

install_mac() {
  dest=$(mac_target)
  download .dmg "$tmp/vanitty.dmg"
  mnt="$tmp/mnt"
  mkdir -p "$mnt" "$dest"
  hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$tmp/vanitty.dmg"
  rm -rf "$dest/Vanitty.app"
  ditto "$mnt/Vanitty.app" "$dest/Vanitty.app"
  hdiutil detach -quiet "$mnt"
  mnt=""
  # The build isn't notarized yet. curl doesn't quarantine downloads, but a
  # leftover flag from an earlier browser install would block the app.
  xattr -dr com.apple.quarantine "$dest/Vanitty.app" 2> /dev/null || true
  say "Installed Vanitty to $dest/Vanitty.app"
}

uninstall_mac() {
  for dir in /Applications "$HOME/Applications"; do
    if [ -d "$dir/Vanitty.app" ]; then
      rm -rf "$dir/Vanitty.app"
      say "Removed $dir/Vanitty.app"
    fi
  done
}

# --- Linux -------------------------------------------------------------------

DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA/vanitty"
BIN="$HOME/.local/bin/vanitty"
DESKTOP="$DATA/applications/vanitty.desktop"
ICON="$APP_DIR/vanitty.png"
# Where earlier versions of this script put the icon.
OLD_ICON="$DATA/icons/hicolor/128x128/apps/vanitty.png"

install_linux() {
  [ "$(uname -m)" = x86_64 ] || die "only x86_64 Linux builds are published. See https://vanitty.dev/docs/develop/ to build from source."
  appimage="$APP_DIR/Vanitty.AppImage"
  download .AppImage "$tmp/Vanitty.AppImage"
  chmod +x "$tmp/Vanitty.AppImage"
  mkdir -p "$APP_DIR" "$(dirname "$BIN")" "$(dirname "$DESKTOP")"
  mv -f "$tmp/Vanitty.AppImage" "$appimage"
  ln -sf "$appimage" "$BIN"

  # The menu entry names the icon by its full path, so it shows up even when
  # the desktop's icon theme cache doesn't know about it.
  icon="usr/share/icons/hicolor/256x256@2/apps/vanitty.png"
  if (cd "$tmp" && "$appimage" --appimage-extract "$icon" > /dev/null 2>&1) && [ -s "$tmp/squashfs-root/$icon" ]; then
    cp -f "$tmp/squashfs-root/$icon" "$ICON"
  else
    say "Couldn't extract the icon from the AppImage; the menu entry will use a generic one."
  fi
  rm -f "$OLD_ICON"

  cat > "$DESKTOP" << EOF
[Desktop Entry]
Type=Application
Name=Vanitty
GenericName=Terminal
Comment=A fast, native terminal
Exec=$appimage
Icon=$ICON
Terminal=false
Categories=System;TerminalEmulator;
Keywords=terminal;shell;prompt;command;commandline;
StartupWMClass=vanitty
EOF
  has update-desktop-database && update-desktop-database "$(dirname "$DESKTOP")" > /dev/null 2>&1 || true

  say "Installed Vanitty to $appimage"
  if ! has fusermount3 && ! has fusermount; then
    say "Note: AppImages need FUSE. Install your distro's fuse3 package if Vanitty doesn't start."
  fi
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) say "Add ~/.local/bin to your PATH to run 'vanitty' from a shell." ;;
  esac
}

uninstall_linux() {
  rm -rf "$APP_DIR"
  rm -f "$DESKTOP" "$OLD_ICON"
  [ -L "$BIN" ] && rm -f "$BIN"
  say "Removed Vanitty. Your settings in ~/.config/vanitty are kept."
}

# -----------------------------------------------------------------------------

action=install
for arg in "$@"; do
  case "$arg" in
    --uninstall) action=uninstall ;;
    *) die "unknown option: $arg" ;;
  esac
done

has curl || die "curl is required"

case "$(uname -s)" in
  Darwin) "${action}_mac" ;;
  Linux) "${action}_linux" ;;
  *) die "unsupported OS. On Windows run: irm https://vanitty.dev/install.ps1 | iex" ;;
esac
