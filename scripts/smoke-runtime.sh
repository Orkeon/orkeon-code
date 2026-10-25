#!/usr/bin/env bash
# Runtime smoke: boot the real Orkeon REPL on the demo fixture, let it load the
# command surface, then exit. Proves what the unit tests and the bundle check
# cannot: that the host accepts the example settings and loads every command (none
# dropped, none in conflict) from this layout. No LLM call is made, so no API key is needed.
#
#   bash scripts/smoke-runtime.sh [--mode docker|tool|source]
# Passes when the REPL logs "Scripted commands ready: N loaded, 0 skipped, 0 conflicts"
# with N equal to the number of src/commands/*/*.cmd.ts files.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
expected="$(find "$ROOT/src/commands" -name '*.cmd.ts' | wc -l | tr -d ' ')"
settings="$(mktemp)"
log="$(mktemp)"
trap 'rm -f "$settings" "$log"' EXIT
# The example settings, as a user copies them, with a keyless but well-formed Llm
# section: the host judges every other key at its start (it refuses one it does not
# know), and nothing calls the model during the smoke.
node -e '
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
settings.Llm = { Model: "smoke", BaseUrl: "http://127.0.0.1:9/v1", ApiKey: "smoke-not-a-key" };
fs.writeFileSync(process.argv[2], JSON.stringify(settings, null, 2));
' "$ROOT/config/appsettings.example.json" "$settings"

set +e
printf '/exit\n' | timeout 300 bash "$ROOT/orkeon-code" --demo --settings "$settings" "$@" >"$log" 2>&1
status=$?
set -e

line="$(grep -o 'Scripted commands ready: [0-9]* loaded, [0-9]* skipped, [0-9]* conflicts' "$log" | tail -n 1 || true)"
if [ -z "$line" ]; then
  echo "smoke: FAIL (exit $status, no 'Scripted commands ready' line). Last lines:"
  tail -n 40 "$log"
  exit 1
fi
echo "smoke: $line (expected $expected loaded)"
if [ "$line" != "Scripted commands ready: $expected loaded, 0 skipped, 0 conflicts" ]; then
  grep -iE 'warn|fail|error|skip' "$log" | head -n 40 || true
  exit 1
fi
echo "smoke: ok"
