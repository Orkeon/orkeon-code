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
# own collection, memory-eval-golden. Settings: the file `orkeon-code run` reads (docs/headless.md).
#
# The probe calls rag_eval from its own code, not through a model's act: the permission gate
# judges only an act's tool calls, so the call runs headless in every mode and nothing is asked.
# q13 holds only when the settings set a retrieval score floor
# (Orkeon:Rag:Retrieval:MinScore); without one every query returns passages.
#
# Runner: the one `orkeon-code run` finds, in the order docs/headless.md gives. When that runtime
# version cannot run, ORKEON_SOURCE names an Orkeon checkout and the probe runs from its sources (--mode source).
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
mode=()
if [ -n "${ORKEON_SOURCE:-}" ]; then mode=(--mode source); fi
# The scratch workspace is this script's own copy of the fixture: trusted for this run only.
bash "$ROOT/orkeon-code" run "$probe" --workspace "$workspace" --trust ${mode[@]+"${mode[@]}"} -- -v 2 2>&1 | tee "$log"

status=${PIPESTATUS[0]}
set -e

verdict="$(grep -oE 'shared-memory probe: (PASS|FAIL)' "$log" | tail -n 1 || true)"
if [ "$verdict" = "shared-memory probe: PASS" ]; then
  echo "check-shared-memory: thresholds met (log: $log)"
  exit 0
fi
echo "check-shared-memory: ${verdict:-no verdict from the probe (exit $status)} (log: $log)" >&2
exit 1
