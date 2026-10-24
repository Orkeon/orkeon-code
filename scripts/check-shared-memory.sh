#!/usr/bin/env bash
# Live check of the shared memory's recall, before a release: runs the probe
# src/crews/_probe-shared-memory/probe.ork.ts on the reference set tests/fixtures/shared-memory/
# (12 entries, golden.yaml q01-q14) and exits non-zero when a threshold fails:
# recall@5 >= 0.85 and MRR >= 0.70 over q01-q12 and q14, q08 never keeps the superseded id,
# q13 renders no precedents block. npm test checks the fixture only; this needs the runtime.
#
#   bash scripts/check-shared-memory.sh
#   ORKEON_SOURCE=<path to an Orkeon checkout> bash scripts/check-shared-memory.sh
#
# The fixture is staged as .orkeon/memory/ of a scratch workspace under the crew state
# (ORKEON_CODE_STATE, default .crew-output/), mounted on /workspace. The probe ingests it into its
# own collection, memory-eval-golden. Settings: ORKEON_CODE_SETTINGS, else config/appsettings.local.json.
#
# rag_eval declares no access, so the runtime asks for it in default and even in acceptEdits mode
# and denies it headless: run this in a terminal and answer the question, or under an allow rule
# for rag_eval. q13 holds only when the settings set a retrieval score floor
# (Orkeon:Rag:Retrieval:MinScore); without one every query returns passages.
#
# Runner: scripts/run-crew.sh (the pinned tool, else the orkeon-runners image). When that runtime
# version cannot run, ORKEON_SOURCE names an Orkeon checkout and the probe runs from its sources:
#   dotnet run --project "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" -- run <probe> ...
set -euo pipefail
unset CDPATH
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
probe="$ROOT/src/crews/_probe-shared-memory/probe.ork.ts"
fixture="$ROOT/tests/fixtures/shared-memory"
state="${ORKEON_CODE_STATE:-$ROOT/.crew-output}"
workspace="$state/shared-memory-probe/workspace"
log="$state/shared-memory-probe/probe.log"

rm -rf "$workspace"
mkdir -p "$workspace/.orkeon/memory"
cp -R "$fixture/entries" "$fixture/eval" "$workspace/.orkeon/memory/"

set +e
if [ -n "${ORKEON_SOURCE:-}" ]; then
  if [ ! -d "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" ]; then
    echo "check-shared-memory: ORKEON_SOURCE must name an Orkeon checkout (src/scripting/Orkeon.Scripting.Cli not found)." >&2
    exit 2
  fi
  settings="${ORKEON_CODE_SETTINGS:-$ROOT/config/appsettings.local.json}"
  [ -f "$settings" ] || { echo "check-shared-memory: settings not found: $settings" >&2; exit 2; }
  output="$state/output"
  mkdir -p "$output"
  dotnet run --project "$ORKEON_SOURCE/src/scripting/Orkeon.Scripting.Cli" -- run "$probe" -s "$settings" \
    -m "$workspace:/workspace:rw" "$output:/output:rw" --allow-external-mounts -v 2 2>&1 | tee "$log"
else
  # The scratch workspace is this script's own copy of the fixture: trusted for this run only.
  ORKEON_CODE_WORKSPACE="$workspace" bash "$ROOT/scripts/run-crew.sh" "$probe" --trust 2>&1 | tee "$log"
fi
status=${PIPESTATUS[0]}
set -e

verdict="$(grep -oE 'shared-memory probe: (PASS|FAIL)' "$log" | tail -n 1 || true)"
if [ "$verdict" = "shared-memory probe: PASS" ]; then
  echo "check-shared-memory: thresholds met (log: $log)"
  exit 0
fi
echo "check-shared-memory: ${verdict:-no verdict from the probe (exit $status)} (log: $log)" >&2
exit 1
