#!/usr/bin/env bash
# Regenerate the Orkeon typings the sources reference:
#   src/crews/.orkeon/orkeon.d.ts         the crew DSL (crew.ork.ts)
#   src/commands/.orkeon/orkeon-cli.d.ts  the scripted commands (*.cmd.ts)
# from the Orkeon version pinned in .orkeon-version, with `orkeon typings`.
# Run it after every change of .orkeon-version, then `npm run typecheck`.
#
# The `orkeon` tool comes from, in order:
#   1. an Orkeon checkout named by ORKEON_SOURCE, the variable the launcher's
#      source mode reads (`dotnet run` of src/scripting/Orkeon.Scripting.Cli): the
#      way to the typings of a version not published yet, such as 1.0.0-rc.6
#      before its tag; the checkout must be at that version;
#   2. the local tool manifest (.config/dotnet-tools.json, Orkeon.Scripting.Cli on
#      nuget.org, kept at the same version);
#   3. the orkeon-runners image when there is no .NET SDK.
#
#   bash scripts/sync-typings.sh
#   ORKEON_SOURCE=<path to an Orkeon checkout> bash scripts/sync-typings.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/.orkeon-version")"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

manifest_version="$(sed -n '/"orkeon.scripting.cli"/,/}/s/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/.config/dotnet-tools.json" | head -n 1)"
if [ "$manifest_version" != "$VERSION" ]; then
  echo "sync-typings: .config/dotnet-tools.json pins Orkeon.Scripting.Cli $manifest_version, .orkeon-version says $VERSION: align them first." >&2
  exit 1
fi

if [ -n "${ORKEON_SOURCE:-}" ]; then
  if [ ! -d "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" ]; then
    echo "sync-typings: ORKEON_SOURCE must name an Orkeon checkout (src/scripting/Orkeon.Scripting.Cli not found)." >&2
    exit 1
  fi
  dotnet run --project "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" -- typings --out "$OUT"
  FROM="the Orkeon checkout $ORKEON_SOURCE"
elif command -v dotnet >/dev/null 2>&1; then
  (cd "$ROOT" && dotnet tool restore >/dev/null && dotnet tool run orkeon typings --out "$OUT")
  FROM="Orkeon $VERSION"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -e ORKEON_RUNNER=orkeon -v "$OUT:/out" \
    "ghcr.io/orkeon/orkeon-runners:$VERSION" typings --out /out
  FROM="Orkeon $VERSION"
else
  echo "sync-typings: needs the .NET SDK (dotnet tool) or Docker." >&2
  exit 1
fi

cp "$OUT/orkeon.d.ts" "$ROOT/src/crews/.orkeon/orkeon.d.ts"
cp "$OUT/orkeon-cli.d.ts" "$ROOT/src/commands/.orkeon/orkeon-cli.d.ts"
echo "typings synced from $FROM"
git -C "$ROOT" diff --stat -- src/crews/.orkeon src/commands/.orkeon || true
