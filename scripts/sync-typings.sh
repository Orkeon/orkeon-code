#!/usr/bin/env bash
# Regenerate the Orkeon typings the sources reference:
#   src/crews/.orkeon/orkeon.d.ts         the crew DSL (crew.ork.ts)
#   src/commands/.orkeon/orkeon-cli.d.ts  the scripted commands (*.cmd.ts)
# from the commit of Orkeon's main pinned in .orkeon-version, with `orkeon typings`.
# Run it after every change of .orkeon-version, then `npm run typecheck`.
#
# The `orkeon` tool comes from, in order:
#   1. an Orkeon checkout named by ORKEON_SOURCE, the variable the launcher's
#      source mode reads (`dotnet run` of src/scripting/Orkeon.Scripting.Cli): the
#      only way to the typings of the pin, which is never a release; the checkout
#      must sit at that commit (refused otherwise: check it out, or pass --any);
#   2. the local tool manifest (.config/dotnet-tools.json, Orkeon.Scripting.Cli on
#      nuget.org, the last release): typings of that release, not of the pin, with
#      a warning;
#   3. the orkeon-runners image of the last release when there is no .NET SDK, the
#      same warning.
#
#   ORKEON_SOURCE=<path to an Orkeon checkout> bash scripts/sync-typings.sh
#   bash scripts/sync-typings.sh            # from the release of the manifest
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="$(tr -d '[:space:]' < "$ROOT/.orkeon-version")"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
ANY=0
for a in "$@"; do case "$a" in --any) ANY=1 ;; *) echo "sync-typings: unknown argument $a" >&2; exit 2 ;; esac; done

manifest_version="$(sed -n '/"orkeon.scripting.cli"/,/}/s/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/.config/dotnet-tools.json" | head -n 1)"

if [ -n "${ORKEON_SOURCE:-}" ]; then
  if [ ! -d "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" ]; then
    echo "sync-typings: ORKEON_SOURCE must name an Orkeon checkout (src/scripting/Orkeon.Scripting.Cli not found)." >&2
    exit 1
  fi
  if head="$(git -C "$ORKEON_SOURCE" rev-parse HEAD 2>/dev/null)" && [ "$head" != "$REF" ] && [ "$ANY" = 0 ]; then
    echo "sync-typings: $ORKEON_SOURCE is at ${head:0:7}, the pin of .orkeon-version is ${REF:0:7}: check that commit out (git -C \"$ORKEON_SOURCE\" checkout $REF), or pass --any." >&2
    exit 1
  fi
  dotnet run --project "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" -- typings --out "$OUT"
  FROM="the Orkeon checkout $ORKEON_SOURCE"
elif command -v dotnet >/dev/null 2>&1; then
  echo "sync-typings: warning: typings of the release $manifest_version (the tool manifest), not of the pin ${REF:0:7}: set ORKEON_SOURCE to a checkout at the pin." >&2
  (cd "$ROOT" && dotnet tool restore >/dev/null && dotnet tool run orkeon typings --out "$OUT")
  FROM="Orkeon $manifest_version (the tool manifest)"
elif command -v docker >/dev/null 2>&1; then
  echo "sync-typings: warning: typings of the last release image, not of the pin ${REF:0:7}: set ORKEON_SOURCE to a checkout at the pin." >&2
  docker run --rm -e ORKEON_RUNNER=orkeon -v "$OUT:/out" \
    "${ORKEON_CODE_IMAGE:-ghcr.io/orkeon/orkeon-runners:latest}" typings --out /out
  FROM="the last Orkeon release image"
else
  echo "sync-typings: needs the .NET SDK (dotnet tool) or Docker." >&2
  exit 1
fi

cp "$OUT/orkeon.d.ts" "$ROOT/src/crews/.orkeon/orkeon.d.ts"
cp "$OUT/orkeon-cli.d.ts" "$ROOT/src/commands/.orkeon/orkeon-cli.d.ts"
echo "typings synced from $FROM"
git -C "$ROOT" diff --stat -- src/crews/.orkeon src/commands/.orkeon || true
