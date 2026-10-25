// The write paths heard from a role's callbacks. Run:
//   node --test src/crews/dev-implement/application/report-writes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { reportingWrites, writtenPaths } from "./report-writes.ts";
import { inner, NODE_EDITORS_AND_BATCHES, NODE_EDITORS_AND_BATCHES_HEARD, WRITE_DENY_READ_WRITE, WRITTEN_CASES } from "./report-writes.fixtures.ts";

describe("reportingWrites", () => {
  it("reports the path of a write let through, never a denied one or a read", async () => {
    // Arrange
    const heard: string[] = [];
    const act = reportingWrites(inner("src/x.ts"), (p) => heard.push(p)).forAct("acceptEdits", true);
    const verdicts: unknown[] = [];

    // Act
    for (const call of WRITE_DENY_READ_WRITE) verdicts.push(await act.onToolCall(call));

    // Assert
    deepStrictEqual(verdicts.slice(0, 2), ["allow", { deny: "no" }]);
    deepStrictEqual(heard, ["tests/a.test.ts", "src/z.ts"]);
  });

  it("reports the node editors' path and every operation's path of an edit_batch let through", async () => {
    // Arrange
    const heard: string[] = [];
    const act = reportingWrites(inner("src/x.ts"), (p) => heard.push(p)).forAct("acceptEdits", true);

    // Act
    for (const call of NODE_EDITORS_AND_BATCHES) await act.onToolCall(call);

    // Assert
    deepStrictEqual(heard, NODE_EDITORS_AND_BATCHES_HEARD);
  });
});

describe("writtenPaths", () => {
  for (const c of WRITTEN_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool, input } = c;

      // Act
      const paths = writtenPaths(tool, input);

      // Assert
      deepStrictEqual(paths, c.expected);
    });
  }
});
