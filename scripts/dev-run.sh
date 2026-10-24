#!/usr/bin/env bash
# Chain the steps of a dev crew headless, one fresh `orkeon run` process per step, until the
# work code's event log says the batches are closed, a human must decide, or nothing moved.
#
#   bash scripts/dev-run.sh <crew> <code> --inputs '<json>' [--log <file>] [--max-steps N] [--wait S] [--retries N]
#   ORKEON_CODE_WORKSPACE=~/src/app bash scripts/dev-run.sh dev-verify demo --inputs '{"batch":"F2","plan":"demo"}' \
#     --log workbench/demo/DEMO-BATCHES-STATE.md
#
# Each step runs `bash scripts/run-crew.sh src/crews/<crew>/crew.ork.ts --inputs <json>`;
# the inputs are the crew's own (its crew.ork.ts header names them), required. A crew run
# this way gets none of what its command does first: /dev-verify's check that the gate is
# on and its rule sets are not applied. run-crew.sh passes the settings, the model and the
# mounts (ORKEON_CODE_SETTINGS, ORKEON_CODE_MODEL; ORKEON_CODE_MODE=source with ORKEON_SOURCE
# runs the tool from an Orkeon checkout while it is not on NuGet). DEV_RUN_RUNNER names another
# command, given the crew and --inputs alone (a fake in the tests): it passes its own `-s` and
# `-m`, or the crew runs on no settings and no mount. A step's output goes to <project>/.orkeon/dev/<code>/runs/<crew>-<n>.log, never
# whole to the terminal: its last line is shown. <project> is ORKEON_CODE_WORKSPACE, else
# the working directory. After each step:
#   exit 130 (cancelled) or 1 (script error)        -> stop with that code
#   exit 2 with a rate limit in the log              -> wait --wait seconds (default 60) and
#                                                       run it again, --retries times (default 2);
#                                                       then stop with 2
#   exit 2 otherwise                                 -> stop with 2
#   exit 0 -> the last line of the event log, .orkeon/dev/<code>/batches-state.md, or the
#             file --log names (relative to the project). /dev-batches writes Code's own log; a
#             step that drives one batch alone (/dev-implement) does not: name a log it moves.
#     `closed` (the line `- <date> <time> closed`, a trailing blank or CR aside) -> exit 0; an event whose
#     detail starts with BLOCKED or GAPS -> exit 3 (a human decides);
#     the same line as before the step -> exit 4 (no progress: never loop); else the next step.
# --max-steps (default 10) reached -> exit 5. Usage errors -> exit 64; the crew dev-batches is refused (64): a run
# of a whole plan without anyone at the keyboard stays the REPL's /dev-batches (docs/headless.md).
# Without DEV_RUN_RUNNER the project's trust is checked once, before the first step, where a terminal can answer:
# declined -> exit 0, nothing run; refused (no terminal) -> exit 2. Each step then runs with no stdin, so
# nothing it asks can hang the chain.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() { echo "usage: scripts/dev-run.sh <crew> <code> --inputs '<json>' [--log <file>] [--max-steps N] [--wait S] [--retries N]" >&2; exit 64; }
[ $# -ge 2 ] || usage
crew="$1"; code="$2"; shift 2
case "$crew" in ''|*[!a-z0-9-]*) echo "dev-run: '$crew' is not a crew name" >&2; exit 64 ;; esac
case "$code" in ''|.*|*[!A-Za-z0-9._-]*) echo "dev-run: '$code' is not a work code" >&2; exit 64 ;; esac
if [ "$crew" = dev-batches ]; then
  echo "dev-run: the crew dev-batches only names the next batch and logs it launched: a run of a whole plan without" \
    "anyone at the keyboard stays the REPL's /dev-batches" >&2
  exit 64
fi
inputs=""; log_file=""; max_steps=10; wait_s=60; retries=2
number() { case "$2" in ''|*[!0-9]*) echo "dev-run: $1 takes a whole number, not '$2'" >&2; exit 64 ;; esac; }
while [ $# -gt 0 ]; do
  case "$1" in
    --inputs) [ $# -ge 2 ] || usage; inputs="$2"; shift 2 ;;
    --log) [ $# -ge 2 ] || usage; log_file="$2"; shift 2 ;;
    --max-steps) [ $# -ge 2 ] || usage; number "$1" "$2"; max_steps="$2"; shift 2 ;;
    --wait) [ $# -ge 2 ] || usage; number "$1" "$2"; wait_s="$2"; shift 2 ;;
    --retries) [ $# -ge 2 ] || usage; number "$1" "$2"; retries="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$inputs" ] || { echo "dev-run: --inputs is required: the crew's own inputs (its crew.ork.ts header names them)" >&2; exit 64; }
[ "$max_steps" -ge 1 ] || { echo "dev-run: --max-steps must be 1 or more" >&2; exit 64; }

project="$(cd "${ORKEON_CODE_WORKSPACE:-.}" && pwd)"
export ORKEON_CODE_WORKSPACE="$project"
case "$log_file" in /*|*..*) echo "dev-run: --log is a path inside the project, not '$log_file'" >&2; exit 64 ;; esac
state="$project/${log_file:-.orkeon/dev/$code/batches-state.md}"
runs="$project/.orkeon/dev/$code/runs"
mkdir -p "$runs"
crew_file="$ROOT/src/crews/$crew/crew.ork.ts"
[ -f "$crew_file" ] || { echo "dev-run: no crew '$crew' ($crew_file)" >&2; exit 64; }

# The last line not blank, without its CR or trailing blanks (a log edited on Windows).
last_line() { [ -f "$state" ] && tr -d '\r' <"$state" | sed 's/[[:space:]]*$//' | grep -v '^$' | tail -n 1 || true; }
next_log() {
  local n=1
  while [ -e "$runs/$crew-$n.log" ]; do n=$((n + 1)); done
  echo "$runs/$crew-$n.log"
}
run_once() {
  local log="$1" rc=0
  if [ -n "${DEV_RUN_RUNNER:-}" ]; then
    $DEV_RUN_RUNNER "$crew_file" --inputs "$inputs" </dev/null >"$log" 2>&1 || rc=$?
  else
    bash "$ROOT/scripts/run-crew.sh" "$crew_file" --inputs "$inputs" </dev/null >"$log" 2>&1 || rc=$?
  fi
  return "$rc"
}

# The trust question asked here, once, with the terminal: in a step it would land in the step's log.
if [ -z "${DEV_RUN_RUNNER:-}" ]; then
  rc=0; bash "$ROOT/orkeon-code" trust check "$project" || rc=$?
  case "$rc" in
    0) ;;
    4) echo "dev-run: $project is not trusted: nothing run"; exit 0 ;;
    *) echo "dev-run: trust $project first (orkeon-code trust add $project), then run this again" >&2; exit 2 ;;
  esac
fi

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
    if [ "$rc" = 2 ] && grep -qiE 'HTTP[ /0-9.]* 429|status( code)?[ :=]*429|too many requests|rate.?limit|LlmRateLimitException' "$log" && [ "$attempt" -lt "$retries" ]; then
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
  if printf '%s\n' "$after" | grep -qE '^- [0-9-]+ [0-9:]+ closed$'; then echo "dev-run: closed"; exit 0; fi
  if printf '%s\n' "$after" | grep -qE '^- [0-9-]+ [0-9:]+ F[0-9]+ [a-z]+ (BLOCKED|GAPS)([^A-Za-z]|$)'; then
    echo "dev-run: a human decides: $after"; exit 3
  fi
  if [ "$after" = "$before" ]; then
    echo "dev-run: no progress (the last line of ${state#"$project"/} did not change): stopped"
    exit 4
  fi
done
echo "dev-run: $max_steps step(s) reached: stopped"
exit 5
