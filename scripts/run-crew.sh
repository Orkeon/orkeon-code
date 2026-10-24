#!/usr/bin/env bash
# Run one crew (or probe) standalone, outside the REPL, with the `orkeon` tool:
# the way to debug a crew's body, its prompts and its tool calls in isolation.
#
#   bash scripts/run-crew.sh src/crews/git-commit/crew.ork.ts
#   bash scripts/run-crew.sh src/crews/code-review/crew.ork.ts --inputs '{"files":[]}'
#   bash scripts/run-crew.sh src/crews/main-loop/crew.ork.ts --inputs '{"prompt":"…","permissionMode":"acceptEdits"}'
#   ORKEON_CODE_WORKSPACE=~/src/app bash scripts/run-crew.sh src/crews/project-init/crew.ork.ts
#
# The project (default: the demo fixture) is mounted on /workspace and a scratch
# directory on /output, as the REPL does. Settings: ORKEON_CODE_SETTINGS, else
# config/appsettings.local.json. The tool is Orkeon.Scripting.Cli from nuget.org,
# pinned by .config/dotnet-tools.json; without a .NET SDK the orkeon-runners
# image is used instead.
#
# A project named by ORKEON_CODE_WORKSPACE must be a trusted folder, as for ./orkeon-code (which
# checks it: `orkeon-code trust check`): asked in a terminal, refused without one (exit 3) unless
# --trust is given among the arguments (this run only, taken out of what orkeon run gets) or
# ORKEON_CODE_TRUST=1 with CI=true. The demo fixture is this checkout's own.
set -euo pipefail
unset CDPATH
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/.orkeon-version")"

script="${1:?usage: scripts/run-crew.sh <crew.ork.ts> [orkeon run args]}"
shift
script="$(cd "$(dirname "$script")" && pwd)/$(basename "$script")"
[ -f "$script" ] || { echo "run-crew: not found: $script" >&2; exit 1; }
trust=""
args=()
for a in "$@"; do
  if [ "$a" = --trust ]; then trust=--trust; else args+=("$a"); fi
done
set -- ${args[@]+"${args[@]}"}

settings="${ORKEON_CODE_SETTINGS:-$ROOT/config/appsettings.local.json}"
[ -f "$settings" ] || { echo "run-crew: settings not found: $settings (start from config/appsettings.example.json)" >&2; exit 1; }
if [ -z "${ORKEON_CODE_WORKSPACE:-}" ]; then
  bash "$ROOT/scripts/setup-fixture.sh" >/dev/null
  workspace="$ROOT/fixtures/sample-repo"
else
  workspace="$(cd "$ORKEON_CODE_WORKSPACE" && pwd -P)"
  # Before anything of the project is read or mounted.
  # 0: it may start; 3: refused, no terminal; 4: declined, so nothing runs and the exit is 0.
  rc=0
  bash "$ROOT/orkeon-code" trust check "$workspace" $trust || rc=$?
  case "$rc" in 0) ;; 4) exit 0 ;; *) exit "$rc" ;; esac
fi
output="${ORKEON_CODE_STATE:-$ROOT/.crew-output}/output"
mkdir -p "$output"

echo "crew      : ${script#"$ROOT"/}"
echo "workspace : $workspace -> /workspace"
if command -v dotnet >/dev/null 2>&1; then
  cd "$ROOT"
  dotnet tool restore >/dev/null
  exec dotnet tool run orkeon run "$script" -s "$settings" \
    -m "$workspace:/workspace:rw" "$output:/output:rw" --allow-external-mounts -v 2 "$@"
fi
# No SDK: the same tool from the orkeon-runners image. The whole checkout is
# mounted so the crew's relative imports (src/shared, ...) resolve.
key_var="$(sed -n 's/.*"ApiKeyEnvVar"[[:space:]]*:[[:space:]]*"\([A-Za-z_][A-Za-z0-9_]*\)".*/\1/p' "$settings" | head -n 1)"
env_args=(-e ORKEON_RUNNER=orkeon -e HOME=/tmp)
for v in ORKEON_Llm__ApiKey "$key_var"; do
  if [ -n "$v" ] && [ -n "${!v:-}" ]; then env_args+=(-e "$v"); fi
done
exec docker run --rm -i "${env_args[@]}" -w /work \
  -v "$ROOT:/work/agent:ro" -v "$workspace:/work/project" -v "$output:/work/output" -v "$settings:/work/settings.json:ro" \
  "ghcr.io/orkeon/orkeon-runners:$VERSION" \
  run "/work/agent/${script#"$ROOT"/}" -s /work/settings.json \
  -m /work/project:/workspace:rw /work/output:/output:rw --allow-external-mounts -v 2 "$@"
