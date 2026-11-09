#!/usr/bin/env bash
# Crew smoke: one crew turn through the real runtime, without a key and without a network.
# `git-commit` runs under `orkeon run --llm-mock` on a fresh copy of the demo fixture that
# carries one change; the mock answers the one LLM call with a commit message
# (tests/fixtures/llm-mock/git-commit.jsonl: a `match` searched in the last user message, the
# `content` returned); the fixture's HEAD must then carry that subject and its tree be clean.
# Proves what the unit tests and the REPL smoke cannot: that a crew's body, its tools and its
# LLM call go through the runtime at the pin (Orkeon #299 made `--llm-mock` apply to a
# declarative crew, which every crew of this project is).
#
#   bash scripts/smoke-crew.sh
#   ORKEON_CODE_MODE=source ORKEON_SOURCE=<an Orkeon checkout at the pin> bash scripts/smoke-crew.sh
#
# The runtime is the one scripts/run-crew.sh picks (the tool, the source mode, or the image),
# with the example settings made keyless as scripts/smoke-runtime.sh does. Nothing of the
# checkout is written: the fixture, the settings and the crew's output live in a temporary
# folder. SMOKE_CREW_RUNNER names another runner (the tests give a fake one).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CREW="$ROOT/src/crews/git-commit/crew.ork.ts"
MOCK="$ROOT/tests/fixtures/llm-mock/git-commit.jsonl"
RUNNER="${SMOKE_CREW_RUNNER:-$ROOT/scripts/run-crew.sh}"

work="$(mktemp -d)"
log="$work/run.log"
settings="$work/settings.json"
fixture="$work/sample-repo"
trap 'rm -rf "$work"' EXIT

# The subject the mock answers: the first line of its one `content`, read from the fixture so
# that the file stays the single source of what the model "says".
subject="$(node -e '
const fs = require("fs");
const line = fs.readFileSync(process.argv[1], "utf8").split("\n").find((l) => l.trim() !== "");
process.stdout.write(JSON.parse(line).content.split("\n")[0]);
' "$MOCK")"

# The example settings with a keyless but well-formed Llm section (the host refuses a key it does
# not know and --llm-mock replaces every provider by the mock).
node -e '
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
settings.Llm = { Model: "smoke", BaseUrl: "http://127.0.0.1:9/v1", ApiKey: "smoke-not-a-key" };
fs.writeFileSync(process.argv[2], JSON.stringify(settings, null, 2));
' "$ROOT/config/appsettings.example.json" "$settings"

# A fresh fixture (the seed commit alone) with one unstaged change for the crew to commit.
bash "$ROOT/scripts/setup-fixture.sh" "$fixture" >/dev/null
printf '\nThe crew smoke commits this line through the mock model.\n' >> "$fixture/README.md"

echo "smoke-crew: git-commit under --llm-mock on $fixture"
set +e
ORKEON_CODE_SETTINGS="$settings" ORKEON_CODE_WORKSPACE="$fixture" ORKEON_CODE_STATE="$work/state" \
  timeout 900 bash "$RUNNER" "$CREW" --trust \
  --inputs '{"permissionMode":"bypassPermissions"}' --llm-mock "$MOCK" >"$log" 2>&1
status=$?
set -e

fail() {
  echo "smoke-crew: FAIL: $1. Last lines of the run:"
  tail -n 40 "$log"
  exit 1
}
[ "$status" = 0 ] || fail "the crew exited $status"
head="$(git -C "$fixture" log -1 --format=%s)"
[ "$head" = "$subject" ] || fail "HEAD is '$head', the mock answered '$subject'"
dirty="$(git -C "$fixture" status --porcelain)"
[ -z "$dirty" ] || fail "the fixture is not clean after the commit:
$dirty"
echo "smoke-crew: ok (committed '$subject')"
