#!/usr/bin/env bash
# Validate smoke: every crew of src/crews/ (a folder with a crew.ork.ts, a `_` probe left out) goes
# through `orkeon run --validate` at the pin. The runtime resolves the settings, builds its host and
# checks the script up to its bundle (the version directive, the types over its own typings, esbuild)
# without running it: no LLM is called, no key is needed, nothing of the checkout is written. Proves
# what the Node type check cannot: that the runtime's own `tsc` and loader accept each crew as this
# project writes it (Orkeon #315, #316; ADR 0025). Every crew is judged, then the smoke fails when one did.
#
#   bash scripts/smoke-validate.sh
#   ORKEON_CODE_MODE=source ORKEON_SOURCE=<an Orkeon checkout at the pin> bash scripts/smoke-validate.sh
#
# The runtime is the one scripts/run-crew.sh picks (the tool, the source mode, or the image), with
# the example settings made keyless as the other smokes do. SMOKE_VALIDATE_RUNNER names another
# runner (the tests give a fake one).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="${SMOKE_VALIDATE_RUNNER:-$ROOT/scripts/run-crew.sh}"

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
    timeout 600 bash "$RUNNER" "$crew" --validate >"$log" 2>&1
  status=$?
  set -e
  verdict="$(grep -o 'VALIDATION [A-Z]*.*' "$log" | tail -n 1 || true)"
  if [ "$status" = 0 ] && [ "${verdict#VALIDATION OK}" != "$verdict" ]; then
    echo "smoke-validate: ok $name"
  else
    echo "smoke-validate: FAIL $name (exit $status): ${verdict:-no VALIDATION line}. Last lines of the run:"
    tail -n 20 "$log"
    failed=$((failed + 1))
  fi
done

echo "smoke-validate: ${#crews[@]} crews, $failed failed"
[ "$failed" = 0 ]
