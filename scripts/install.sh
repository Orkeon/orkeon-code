#!/usr/bin/env bash
# Install Orkeon Code (Linux, macOS, WSL) from its runnable archive, no sudo.
#
#   install.sh [--prefix DIR] [--archive FILE]    # default prefix: ~/.local
#   install.sh [--prefix DIR] --uninstall
#
# Puts the program in <prefix>/lib/orkeon-code/<version>/, points <prefix>/lib/orkeon-code/current at it and
# links <prefix>/bin/orkeon-code to current/orkeon-code. The files come from, the first that applies:
# --archive FILE (a .tar.gz, checked against the SHA256SUMS beside it when there is one); the extracted archive
# this script sits in; else the archive of the release this script was published with, downloaded with its
# SHA256SUMS and checked. Run twice, it changes nothing. --uninstall removes <prefix>/lib/orkeon-code and the
# link, never ~/.orkeon-code (your settings, trust decisions and state).
set -euo pipefail

# Stamped by the release (scripts/build-install-archive.sh) in the copy it publishes alone.
RELEASE_VERSION=""
REPOSITORY="https://github.com/Orkeon/orkeon-code"
WORK=""  # the scratch folder of a run, removed on exit

die() { echo "install.sh: $*" >&2; exit 1; }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1; }

# Checks <file> against the SHA256SUMS in <sums>. Stops when its line is missing or the sum differs.
check_sum() { # <file> <sums>
  local expected
  expected="$(awk -v n="$(basename "$1")" '$2 == n || $2 == "*" n { print $1; exit }' "$2")"
  [ -n "$expected" ] || die "$(basename "$1") is not listed in $2: checksum not verified."
  [ "$(sha256 "$1")" = "$expected" ] || die "checksum mismatch for $1 (SHA256SUMS says $expected)."
}

download() { # <url> <file>
  if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
  else die "neither curl nor wget found: download the archive and pass --archive FILE."
  fi
}

# Replaces <link> by a link to <target> unless it already is one.
link() { # <target> <link>
  if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then return 0; fi
  ln -sfn "$1" "$2"
}

main() {
  local prefix="$HOME/.local" prefix_given="" archive="" uninstall=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --prefix) prefix="${2:?--prefix needs a folder}"; prefix_given=1; shift 2 ;;
      --prefix=*) prefix="${1#*=}"; prefix_given=1; shift ;;
      --archive) archive="${2:?--archive needs a file}"; shift 2 ;;
      --archive=*) archive="${1#*=}"; shift ;;
      --uninstall) uninstall=1; shift ;;
      -h|--help) sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
      *) die "unknown option: $1 (see --help)" ;;
    esac
  done
  # The installed copy (<prefix>/lib/orkeon-code/<version>/scripts/install.sh) knows its own prefix.
  local self
  self="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  if [ -z "$prefix_given" ]; then
    case "$self" in */lib/orkeon-code/*/scripts) prefix="${self%/lib/orkeon-code/*}" ;; esac
  fi
  mkdir -p "$prefix"
  local logical_bin
  logical_bin="$(cd "$prefix" && pwd)/bin"
  prefix="$(cd "$prefix" && pwd -P)"
  local lib="$prefix/lib/orkeon-code" bin="$prefix/bin"
  local cmd="$bin/orkeon-code"

  if [ "$uninstall" = 1 ]; then
    # Only our own link: one pointing into the lib folder.
    if [ -L "$cmd" ] && [ "$(readlink "$cmd")" = ../lib/orkeon-code/current/orkeon-code ]; then rm -f "$cmd"; fi
    rm -rf "$lib"
    echo "Orkeon Code removed from $prefix. Your settings and state in ${ORKEON_CODE_HOME:-$HOME/.orkeon-code} are kept."
    return 0
  fi

  [ ! -e "$cmd" ] || [ -L "$cmd" ] || die "$cmd exists and is not a link: move it away, or choose another --prefix."
  # Another program's link (npm's own command, under an npm prefix of ~/.local) is never taken over.
  if [ -L "$cmd" ] && [ "$(readlink "$cmd")" != ../lib/orkeon-code/current/orkeon-code ]; then
    die "$cmd is a link to $(readlink "$cmd"), not to this install: remove it (npm uninstall -g orkeon-code, if npm installed it), or choose another --prefix."
  fi

  # ── The files to install ──────────────────────────────────────────────────
  local src="" here
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
  if [ -n "$archive" ]; then
    [ -f "$archive" ] || die "archive not found: $archive"
    if [ -f "$(dirname "$archive")/SHA256SUMS" ]; then check_sum "$archive" "$(dirname "$archive")/SHA256SUMS"
    else echo "install.sh: warning: no SHA256SUMS beside $archive, checksum not verified." >&2
    fi
    tar -xzf "$archive" -C "$WORK"
  elif [ -f "$here/orkeon-code" ] && [ -f "$here/package.json" ] && [ -f "$here/.orkeon-version" ]; then
    case "$here/" in "$lib"/*) die "this is the installed copy in $lib: run install.sh from an extracted archive, or pass --archive or --uninstall." ;; esac
    [ ! -e "$here/.git" ] && [ ! -d "$here/tests" ] \
      || die "$here is a checkout: run ./orkeon-code from it, or install a release archive (--archive)."
    src="$here"
  else
    [ -n "$RELEASE_VERSION" ] || die "no archive: pass --archive FILE, or run the install.sh published with a release."
    local name="orkeon-code-$RELEASE_VERSION.tar.gz" base="$REPOSITORY/releases/download/v$RELEASE_VERSION"
    echo "Downloading $base/$name"
    download "$base/$name" "$WORK/$name"
    download "$base/SHA256SUMS" "$WORK/SHA256SUMS"
    check_sum "$WORK/$name" "$WORK/SHA256SUMS"
    tar -xzf "$WORK/$name" -C "$WORK"
  fi
  if [ -z "$src" ]; then
    # The archive holds one folder, orkeon-code-<version>/.
    src="$(find "$WORK" -mindepth 2 -maxdepth 2 -name orkeon-code -type f | head -n 1)"
    [ -n "$src" ] || die "the archive holds no orkeon-code-<version>/orkeon-code launcher."
    src="$(dirname "$src")"
  fi
  local version
  version="$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' "$src/package.json" | head -n 1)"
  [ -n "$version" ] || die "no version in $src/package.json."

  # ── The version folder, current, the command ─────────────────────────────
  mkdir -p "$lib" "$bin"
  [ -w "$lib" ] && [ -w "$bin" ] || die "cannot write to $prefix: choose a writable --prefix."
  if [ -d "$lib/$version" ] && diff -r "$src" "$lib/$version" >/dev/null 2>&1; then
    echo "Orkeon Code $version already installed in $lib/$version."
  else
    rm -rf "$lib/.$version.new"
    cp -R "$src" "$lib/.$version.new"
    chmod 0755 "$lib/.$version.new/orkeon-code"
    rm -rf "$lib/$version"
    mv "$lib/.$version.new" "$lib/$version"
    echo "Orkeon Code $version installed in $lib/$version."
  fi
  link "$version" "$lib/current"
  link ../lib/orkeon-code/current/orkeon-code "$cmd"

  case ":$PATH:" in
    *":$bin:"*|*":$logical_bin:"*) ;;
    *) echo "$bin is not on your PATH. Add it, in ~/.bashrc or ~/.zshrc:"
       echo "  export PATH=\"$bin:\$PATH\"" ;;
  esac
  local first
  first="$(command -v orkeon-code 2>/dev/null || true)"
  if [ -n "$first" ] && ! [ "$first" -ef "$cmd" ]; then
    echo "install.sh: warning: $first comes first on your PATH, before $cmd ('orkeon-code --version' says which runs)." >&2
  fi
  echo "Run: orkeon-code --version"
}

main "$@"
