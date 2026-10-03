#!/bin/sh
# Installs the latest Vanitty release on macOS or Linux.
#
#   curl -fsSL https://vanitty.dev/install.sh | sh
#   curl -fsSL https://vanitty.dev/install.sh | sh -s -- --uninstall
#
# macOS: copies Vanitty.app to /Applications (~/Applications if that isn't
# writable). Linux: puts the AppImage in ~/.local/share/vanitty, links it to
# ~/.local/bin/vanitty and adds a menu entry. No root needed on Linux.
# VANITTY_VERSION=26.10.0 installs a specific version. NO_COLOR=1 turns off
# colors.
set -eu

REPO="stasadance/vanitty"

# Colors only on a terminal, and never with NO_COLOR (https://no-color.org).
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ "${TERM:-}" != dumb ]; then
  BOLD=$(printf '\033[1m') DIM=$(printf '\033[2m') RED=$(printf '\033[31m')
  GREEN=$(printf '\033[32m') YELLOW=$(printf '\033[33m') MAGENTA=$(printf '\033[35m')
  RESET=$(printf '\033[0m')
else
  BOLD="" DIM="" RED="" GREEN="" YELLOW="" MAGENTA="" RESET=""
fi

say() { printf '%s\n' "$*"; }
step() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
note() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
die() { printf '\n  %s✗ %s%s\n\n' "$RED" "$*" "$RESET" >&2; exit 1; }
has() { command -v "$1" > /dev/null 2>&1; }

# Shows paths under $HOME as ~/...
# shellcheck disable=SC2088
tildify() {
  case "$1" in
    "$HOME"/*) printf '~/%s' "${1#"$HOME"/}" ;;
    *) printf '%s' "$1" ;;
  esac
}

fetch() { curl -fsSL --proto '=https' --tlsv1.2 --retry 3 "$@"; }

sha256() {
  if has sha256sum; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# Fetches the release once; sets $version.
load_release() {
  if [ -n "${VANITTY_VERSION:-}" ]; then
    api="https://api.github.com/repos/$REPO/releases/tags/v${VANITTY_VERSION#v}"
  else
    api="https://api.github.com/repos/$REPO/releases/latest"
  fi
  release=$(fetch -H 'Accept: application/vnd.github+json' "$api" 2> /dev/null) \
    || die "Couldn't find the release at $api"
  version=$(printf '%s\n' "$release" | grep -oE '"tag_name": *"[^"]*"' | head -n 1 | sed -E 's/.*"v?([^"]*)"$/\1/')
}

# Prints "<url> <size> <sha256>" for the release asset whose name ends with $1.
find_asset() {
  printf '%s\n' "$release" \
    | grep -oE '"(url|name|digest|browser_download_url)": *"[^"]*"|"size": *[0-9]+' \
    | sed -E 's/^"([a-z_]+)": *"?([^"]*)"?$/\1 \2/' \
    | awk -v suffix="$1" '
        function flush() {
          if (name != "" && substr(name, length(name) - length(suffix) + 1) == suffix) {
            sub(/^sha256:/, "", digest); print url, size, digest; found = 1; exit
          }
          name = ""; url = ""; digest = ""; size = 0
        }
        $1 == "url" && $2 ~ /\/releases\/assets\// { flush() }
        $1 == "name" { name = $2 }
        $1 == "size" { size = $2 }
        $1 == "digest" { digest = $2 }
        $1 == "browser_download_url" { url = $2 }
        END { if (!found) flush() }
      '
}

download() {
  asset=$(find_asset "$1")
  [ -n "$asset" ] || die "This release has no $1 file. See https://github.com/$REPO/releases"
  url=${asset%% *}
  rest=${asset#* }
  size=${rest%% *}
  digest=${rest#* }
  printf '  %s↓%s Downloading %s %s(%s MB)%s\n' "$MAGENTA" "$RESET" "${url##*/}" "$DIM" "$((size / 1048576))" "$RESET"
  # A progress bar on a terminal, nothing when piped to a log.
  if [ -t 2 ]; then
    curl -fL --proto '=https' --tlsv1.2 --retry 3 --progress-bar -o "$2" "$url" \
      || die "Download failed: $url"
  else
    fetch -o "$2" "$url" || die "Download failed: $url"
  fi
  if [ -n "$digest" ]; then
    [ "$(sha256 "$2")" = "$digest" ] || die "Checksum mismatch for ${url##*/}. The download may be corrupted; try again."
    step "Verified the SHA-256 checksum"
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
  load_release
  step "Found Vanitty $version for macOS (Apple Silicon and Intel)"
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
  step "Installed to $(tildify "$dest/Vanitty.app")"
  done_message "Open it from Launchpad or Spotlight, or run: ${BOLD}open -a Vanitty${RESET}"
}

uninstall_mac() {
  for dir in /Applications "$HOME/Applications"; do
    if [ -d "$dir/Vanitty.app" ]; then
      rm -rf "$dir/Vanitty.app"
      step "Removed $(tildify "$dir/Vanitty.app")"
    fi
  done
  removed_message
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
  [ "$(uname -m)" = x86_64 ] || die "Only x86_64 Linux builds are published. See https://vanitty.dev/docs/develop/ to build from source."
  appimage="$APP_DIR/Vanitty.AppImage"
  load_release
  step "Found Vanitty $version for Linux x86_64"
  download .AppImage "$tmp/Vanitty.AppImage"
  chmod +x "$tmp/Vanitty.AppImage"
  mkdir -p "$APP_DIR" "$(dirname "$BIN")" "$(dirname "$DESKTOP")"
  mv -f "$tmp/Vanitty.AppImage" "$appimage"
  ln -sf "$appimage" "$BIN"
  step "Installed to $(tildify "$appimage")"

  # The menu entry names the icon by its full path, so it shows up even when
  # the desktop's icon theme cache doesn't know about it.
  icon="usr/share/icons/hicolor/256x256@2/apps/vanitty.png"
  if (cd "$tmp" && "$appimage" --appimage-extract "$icon" > /dev/null 2>&1) && [ -s "$tmp/squashfs-root/$icon" ]; then
    cp -f "$tmp/squashfs-root/$icon" "$ICON"
  else
    note "Couldn't extract the icon from the AppImage; the menu entry will use a generic one."
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
  step "Added Vanitty to your app menu"

  if ! has fusermount3 && ! has fusermount; then
    note "AppImages need FUSE. Install your distro's fuse3 package if Vanitty doesn't start."
  fi
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) run="or run: ${BOLD}vanitty${RESET}" ;;
    *)
      # shellcheck disable=SC2088
      note "~/.local/bin isn't on your PATH, so the 'vanitty' command won't be found until you add it."
      run="or run: ${BOLD}$(tildify "$BIN")${RESET}"
      ;;
  esac
  done_message "Open it from your app menu, $run"
}

uninstall_linux() {
  rm -rf "$APP_DIR"
  rm -f "$DESKTOP" "$OLD_ICON"
  [ -L "$BIN" ] && rm -f "$BIN"
  step "Removed the app, its menu entry and the vanitty command"
  removed_message
}

# -----------------------------------------------------------------------------

done_message() {
  say ""
  say "  ${GREEN}${BOLD}Vanitty $version is installed.${RESET} $1"
  say "  ${DIM}It updates itself in the background. Docs: https://vanitty.dev/docs/${RESET}"
  say ""
}

removed_message() {
  say ""
  say "  ${BOLD}Vanitty is uninstalled.${RESET} ${DIM}Your settings in ~/.config/vanitty are kept.${RESET}"
  say ""
}

action=install
for arg in "$@"; do
  case "$arg" in
    --uninstall) action=uninstall ;;
    *) die "Unknown option: $arg" ;;
  esac
done

has curl || die "curl is required"

say ""
say "  ${MAGENTA}${BOLD}V_${RESET} ${BOLD}Vanitty${RESET} ${DIM}${action}er${RESET}"
say ""

case "$(uname -s)" in
  Darwin) "${action}_mac" ;;
  Linux) "${action}_linux" ;;
  *) die "Unsupported OS. On Windows, run in PowerShell: irm https://vanitty.dev/install.ps1 | iex" ;;
esac
