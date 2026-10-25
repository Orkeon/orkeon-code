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

import { axisListing, canonicalAxis, collectLearnRows, untreated } from "./verdict-rows.ts";
import { AXES, project, recorded, sources, treatedIds } from "./verdict-rows-parity.fixtures.ts";

describe("verdict rows against the harness's script", () => {
  it("gives the recorded rows, ids and order", () => {
    // Arrange
    const files = sources();

    // Act
    const rows = collectLearnRows(files);

    // Assert
    deepStrictEqual(rows.map(project), JSON.parse(recorded("rows.py.json")));
  });

  for (const axis of AXES) {
    it(`lists axis ${axis} as the script does, treated rows left out`, () => {
      // Arrange
      const picked = untreated(collectLearnRows(sources()), treatedIds()).filter((r) => r.axis === canonicalAxis(axis));

      // Act
      const listing = axisListing(picked);

      // Assert
      strictEqual(listing.join("\n") + "\n", recorded(`axis-${axis}.py.txt`));
    });
  }
});
