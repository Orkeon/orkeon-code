#!/usr/bin/env bash
# Validate smoke: every crew of src/crews/ (a folder with a crew.ork.ts, a `_` probe left out) goes
# through `orkeon run --validate` at the pin. The runtime resolves the settings, builds its host and
# checks the script up to its bundle (the version directive, the types over its own typings, esbuild)
# without running it: no LLM is called, no key is needed. Of the checkout only the demo fixture is
# written: `--demo` seeds fixtures/sample-repo in a clone (ignored by git). Proves
# what the Node type check cannot: that the runtime's own `tsc` and loader accept each crew as this
# project writes it (Orkeon #315, #316; ADR 0025). Every crew is judged, then the smoke fails when one did.
#
#   bash scripts/smoke-validate.sh
#   ORKEON_CODE_MODE=source ORKEON_SOURCE=<an Orkeon checkout at the pin> bash scripts/smoke-validate.sh
#
# The runtime is the one `orkeon-code run` picks (the tool, the image, or the source mode), on the
# demo fixture, with the example settings made keyless as the other smokes do. SMOKE_VALIDATE_RUNNER
# names another runner (the tests give a fake one), given the crew and the arguments of `orkeon-code run`.
#
# The runtime type-checks with the first `tsc` it finds (Orkeon:Scripting:Toolchain:TscPath, then the
# tools/scripting-typecheck of its checkout, then PATH) and, finding none, skips the check with a
# warning and still says VALIDATION OK. A crew whose check was skipped fails here: the smoke proves
# nothing about types without a compiler. Give it this project's own, after `npm ci`:
#   ORKEON_Orkeon__Scripting__Toolchain__TscPath="$PWD/node_modules/.bin/tsc" (an absolute path)
# The TypeScript 7 of an Orkeon checkout's tools/scripting-typecheck hits Orkeon #424 on these crews.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -n "${SMOKE_VALIDATE_RUNNER:-}" ]; then RUNNER=(bash "$SMOKE_VALIDATE_RUNNER"); else RUNNER=(bash "$ROOT/orkeon-code" run); fi

work="$(mktemp -d)"
settings="$work/settings.json"
trap 'rm -rf "$work"' EXIT

# The example settings with a keyless but well-formed Llm section: the host judges every other key
# and --validate never calls the model.
node -e '
const fs = require("fs");
const settings = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
settings.Llm = { Model: "smoke", BaseUrl: "http://127.0.0.1:9/v1", ApiKey: "smoke-not-a-key" };
fs.writeFileSync(process.argv[2], JSON.stringify(settings, null, 2));
' "$ROOT/config/appsettings.example.json" "$settings"

crews=()
for dir in "$ROOT"/src/crews/*/; do
  name="$(basename "$dir")"
  case "$name" in _*) continue ;; esac
  [ -f "$dir/crew.ork.ts" ] && crews+=("${dir%/}/crew.ork.ts")
done
[ "${#crews[@]}" -gt 0 ] || { echo "smoke-validate: FAIL: no crew under src/crews/"; exit 1; }

failed=0
for crew in "${crews[@]}"; do
  name="$(basename "$(dirname "$crew")")"
  log="$work/$name.log"
  set +e
  ORKEON_CODE_SETTINGS="$settings" ORKEON_CODE_STATE="$work/state" \
    timeout 600 "${RUNNER[@]}" "$crew" --demo --validate >"$log" 2>&1
  status=$?
  set -e
  verdict="$(grep -o 'VALIDATION [A-Z]*.*' "$log" | tail -n 1 || true)"
  if grep -q 'type check skipped' "$log"; then
    echo "smoke-validate: FAIL $name: the runtime found no TypeScript compiler and skipped the type check;" \
      "give it one with ORKEON_Orkeon__Scripting__Toolchain__TscPath=<absolute path to tsc>" \
      "(this project's own: $ROOT/node_modules/.bin/tsc after npm ci). Last lines of the run:"
    tail -n 20 "$log"
    failed=$((failed + 1))
  elif [ "$status" = 0 ] && [ "${verdict#VALIDATION OK}" != "$verdict" ]; then
    echo "smoke-validate: ok $name"
  else
    echo "smoke-validate: FAIL $name (exit $status): ${verdict:-no VALIDATION line}. Last lines of the run:"
    tail -n 20 "$log"
    failed=$((failed + 1))
  fi
done

echo "smoke-validate: ${#crews[@]} crews, $failed failed"
[ "$failed" = 0 ]
