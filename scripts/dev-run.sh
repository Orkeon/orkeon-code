#!/usr/bin/env bash
# Chain the steps of a dev crew headless, one fresh `orkeon run` process per step, until the
# work code's event log says the batches are closed, a human must decide, or nothing moved.
#
#   bash scripts/dev-run.sh <crew> <code> [--inputs '<json>'] [--max-steps N] [--wait S] [--retries N]
#   ORKEON_CODE_WORKSPACE=~/src/app bash scripts/dev-run.sh dev-verify demo --inputs '{"batch":"F2","plan":"demo"}'
#
# Each step runs `bash scripts/run-crew.sh src/crews/<crew>/crew.ork.ts --inputs <json>`
# (default inputs: {"code":"<code>"}); DEV_RUN_RUNNER names another command taking the
# same arguments (`dotnet run --project …` while the tool is not on NuGet, a fake in the
# tests). A step's output goes to <project>/.orkeon/dev/<code>/runs/<crew>-<n>.log, never
# whole to the terminal: its last line is shown. <project> is ORKEON_CODE_WORKSPACE, else
# the working directory. After each step:
#   exit 130 (cancelled) or 1 (script error)        -> stop with that code
#   exit 2 with a rate limit in the log              -> wait --wait seconds (default 60) and
#                                                       run it again, --retries times (default 2);
#                                                       then stop with 2
#   exit 2 otherwise                                 -> stop with 2
#   exit 0 -> the last line of .orkeon/dev/<code>/batches-state.md:
#     `closed` -> exit 0; a line with BLOCKED or GAPS -> exit 3 (a human decides);
#     the same line as before the step -> exit 4 (no progress: never loop); else the next step.
# --max-steps (default 10) reached -> exit 5. Usage errors -> exit 64.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() { echo "usage: scripts/dev-run.sh <crew> <code> [--inputs '<json>'] [--max-steps N] [--wait S] [--retries N]" >&2; exit 64; }
[ $# -ge 2 ] || usage
crew="$1"; code="$2"; shift 2
case "$crew" in ''|*[!a-z0-9-]*) echo "dev-run: '$crew' is not a crew name" >&2; exit 64 ;; esac
case "$code" in ''|.*|*[!A-Za-z0-9._-]*) echo "dev-run: '$code' is not a work code" >&2; exit 64 ;; esac
inputs="{\"code\":\"$code\"}"; max_steps=10; wait_s=60; retries=2
number() { case "$2" in ''|*[!0-9]*) echo "dev-run: $1 takes a whole number, not '$2'" >&2; exit 64 ;; esac; }
while [ $# -gt 0 ]; do
  case "$1" in
    --inputs) [ $# -ge 2 ] || usage; inputs="$2"; shift 2 ;;
    --max-steps) [ $# -ge 2 ] || usage; number "$1" "$2"; max_steps="$2"; shift 2 ;;
    --wait) [ $# -ge 2 ] || usage; number "$1" "$2"; wait_s="$2"; shift 2 ;;
    --retries) [ $# -ge 2 ] || usage; number "$1" "$2"; retries="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ "$max_steps" -ge 1 ] || { echo "dev-run: --max-steps must be 1 or more" >&2; exit 64; }

project="$(cd "${ORKEON_CODE_WORKSPACE:-.}" && pwd)"
export ORKEON_CODE_WORKSPACE="$project"
state="$project/.orkeon/dev/$code/batches-state.md"
runs="$project/.orkeon/dev/$code/runs"
mkdir -p "$runs"
crew_file="$ROOT/src/crews/$crew/crew.ork.ts"
if [ -z "${DEV_RUN_RUNNER:-}" ]; then
  [ -f "$crew_file" ] || { echo "dev-run: no crew '$crew' ($crew_file)" >&2; exit 64; }
fi

last_line() { [ -f "$state" ] && grep -v '^[[:space:]]*$' "$state" | tail -n 1 || true; }
next_log() {
  local n=1
  while [ -e "$runs/$crew-$n.log" ]; do n=$((n + 1)); done
  echo "$runs/$crew-$n.log"
}
run_once() {
  local log="$1" rc=0
  if [ -n "${DEV_RUN_RUNNER:-}" ]; then
    $DEV_RUN_RUNNER "src/crews/$crew/crew.ork.ts" --inputs "$inputs" >"$log" 2>&1 || rc=$?
  else
    bash "$ROOT/scripts/run-crew.sh" "$crew_file" --inputs "$inputs" >"$log" 2>&1 || rc=$?
  fi
  return "$rc"
}

step=0
while [ "$step" -lt "$max_steps" ]; do
  step=$((step + 1))
  before="$(last_line)"
  attempt=0
  while :; do
    log="$(next_log)"
    rc=0; run_once "$log" || rc=$?
    echo "dev-run: step $step of $crew ($code): exit $rc, log ${log#"$project"/}"
    tail -n 1 "$log" 2>/dev/null | sed 's/^/  last line: /' || true
    if [ "$rc" = 2 ] && grep -qiE '429|rate limit|LlmRateLimitException' "$log" && [ "$attempt" -lt "$retries" ]; then
      attempt=$((attempt + 1))
      echo "dev-run: rate limited; waiting ${wait_s}s before attempt $((attempt + 1))"
      sleep "$wait_s"
      continue
    fi
    break
  done
  case "$rc" in
    0) ;;
    130) echo "dev-run: cancelled"; exit 130 ;;
    1) echo "dev-run: the crew failed (script error): see the log"; exit 1 ;;
    *) echo "dev-run: the run failed (exit $rc): see the log"; exit 2 ;;
  esac
  after="$(last_line)"
  case "$after" in
    *" closed") echo "dev-run: closed"; exit 0 ;;
    *BLOCKED*|*GAPS*) echo "dev-run: a human decides: $after"; exit 3 ;;
  esac
  if [ "$after" = "$before" ]; then
    echo "dev-run: no progress (the last line of ${state#"$project"/} did not change): stopped"
    exit 4
  fi
done
echo "dev-run: $max_steps step(s) reached: stopped"
exit 5
