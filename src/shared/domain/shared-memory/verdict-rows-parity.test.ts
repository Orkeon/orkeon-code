// Parity with the harness's learning script, over tests/fixtures/dev/learn. The
// recorded files were produced once, from /workspace, with python3 and the script
// at temp/_sources/orkeon-workshop/.devcontainer/harness/packs/dev/claude/skills/dev-learn/scripts/learn-candidates.py:
//
//   F=/workspace/tests/fixtures/dev/learn
//   LC=<the script above>
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/absent.json HARNESS_WORK_DIR=workbench python3 -I -c \
//     'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("lc", sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.rows(), ensure_ascii=False, indent=1))' \
//     "$LC" > $F/rows.py.json
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/harness-state.json HARNESS_WORK_DIR=workbench python3 -I "$LC" --axis Test > $F/axis-Test.py.txt
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/harness-state.json HARNESS_WORK_DIR=workbench python3 -I "$LC" --axis Placement > $F/axis-Placement.py.txt
//
// ledger/LEDGER-VERIFY-F1.md carries the edge rows: padded cells, axes written
// `test` and `PLACEMENT` (folded), a gap with two spaces in a row (kept in the id),
// a row without its trailing `|` (read), and a row of four cells (skipped by both).
//
// absent.json does not exist, so the first run sees an empty state. No test runs
// python3. Run:
//   node --test src/shared/domain/shared-memory/verdict-rows-parity.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { LEARN_FILE, axisListing, canonicalAxis, collectLearnRows, untreated } from "./verdict-rows.ts";
import type { LearnRow, VerdictSource } from "./verdict-rows.ts";

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const work = join(root, "workbench");
const recorded = (name: string): string => readFileSync(join(root, name), "utf8");

function sources(): VerdictSource[] {
  const out: VerdictSource[] = [];
  for (const code of readdirSync(work)) {
    if (code.startsWith(".") || !statSync(join(work, code)).isDirectory()) continue;
    for (const name of readdirSync(join(work, code))) {
      if (LEARN_FILE.test(name)) out.push({ code, name, text: readFileSync(join(work, code, name), "utf8") });
    }
  }
  return out;
}

const project = (r: LearnRow) =>
  ({ id: r.id, batch: r.batch, severity: r.severity, axis: r.axis, gap: r.gap, evidence: r.evidence, fix: r.fix });

describe("verdict rows against the harness's script", () => {
  const rows = collectLearnRows(sources());
  const treated = new Set<string>((JSON.parse(recorded("harness-state.json")) as { treated: string[] }).treated);

  it("gives the recorded rows, ids and order", () => {
    deepStrictEqual(rows.map(project), JSON.parse(recorded("rows.py.json")));
  });

  for (const axis of ["Test", "Placement"]) {
    it(`lists axis ${axis} as the script does, treated rows left out`, () => {
      const picked = untreated(rows, treated).filter((r) => r.axis === canonicalAxis(axis));
      strictEqual(axisListing(picked).join("\n") + "\n", recorded(`axis-${axis}.py.txt`));
    });
  }
});
