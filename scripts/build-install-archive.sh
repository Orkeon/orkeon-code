#!/usr/bin/env bash
# Build the runnable archive of a release from `npm pack`'s output, so the "files" list of package.json is the
# only list of what ships: the archive and the npm package carry the same files.
#
#   bash scripts/build-install-archive.sh <out-dir>
#
# Writes into <out-dir>: orkeon-code-<version>.tar.gz and .zip (when zip is installed), every file under
# orkeon-code-<version>/; install.sh and install.ps1, the installers published alone, stamped with <version>
# (RELEASE_VERSION), so that run without an archive they download this one; SHA256SUMS over all of them.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:?usage: build-install-archive.sh <out-dir>}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
VERSION="$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' "$ROOT/package.json" | head -n 1)"
[ -n "$VERSION" ] || { echo "build-install-archive: no version in package.json" >&2; exit 1; }
NAME="orkeon-code-$VERSION"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
(cd "$ROOT" && npm pack --silent --pack-destination "$work" >/dev/null)
tar -xzf "$work"/orkeon-code-*.tgz -C "$work"
mv "$work/package" "$work/$NAME"
# npm pack writes every file 0644 but the executable ones 0755; the launcher and the scripts must run.
chmod 0755 "$work/$NAME/orkeon-code" "$work/$NAME"/scripts/*.sh

rm -f "$OUT/$NAME.tar.gz" "$OUT/$NAME.zip"
tar -czf "$OUT/$NAME.tar.gz" -C "$work" "$NAME"
if command -v zip >/dev/null 2>&1; then
  (cd "$work" && zip -qr "$OUT/$NAME.zip" "$NAME")
else
  echo "build-install-archive: zip not found, $NAME.zip not written" >&2
fi
for installer in install.sh install.ps1; do
  sed "s/^RELEASE_VERSION=\"\"\$/RELEASE_VERSION=\"$VERSION\"/; s/^\$ReleaseVersion = ''\$/\$ReleaseVersion = '$VERSION'/" \
    "$ROOT/scripts/$installer" > "$OUT/$installer"
done
chmod 0755 "$OUT/install.sh"

cd "$OUT"
if command -v sha256sum >/dev/null 2>&1; then sum=(sha256sum); else sum=(shasum -a 256); fi
files=("$NAME.tar.gz" install.sh install.ps1)
[ -f "$NAME.zip" ] && files+=("$NAME.zip")
"${sum[@]}" "${files[@]}" > SHA256SUMS
echo "$OUT/$NAME.tar.gz"
