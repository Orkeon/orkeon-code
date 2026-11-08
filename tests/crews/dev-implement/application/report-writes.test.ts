// The write paths heard from a role's callbacks. Run:
//   node --test tests/crews/dev-implement/application/report-writes.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { refusedResult, reportingWrites, writtenPaths } from "../../../../src/crews/dev-implement/application/report-writes.ts";
import {
  GATE_REFUSAL, inner, NODE_EDITORS_AND_BATCHES, NODE_EDITORS_AND_BATCHES_HEARD, REFUSED_CASES, WRITE_REFUSED_READ_WRITE, WRITTEN_CASES,
} from "./report-writes.fixtures.ts";

describe("reportingWrites", () => {
  it("reports the path of a write that ran, never one the host refused nor a read", async () => {
    // Arrange
    const heard: string[] = [];
    const act = reportingWrites(inner(), (p) => heard.push(p)).forAct("acceptEdits", true);

    // Act
    for (const c of WRITE_REFUSED_READ_WRITE) await act.onToolResult(c.call, c.result);

    // Assert
    deepStrictEqual(heard, ["tests/a.test.ts", "src/z.ts"]);
  });

  it("reports the node editors' path and every operation's path of an edit_batch that ran", async () => {
    // Arrange
    const heard: string[] = [];
    const act = reportingWrites(inner(), (p) => heard.push(p)).forAct("acceptEdits", true);

    // Act
    for (const call of NODE_EDITORS_AND_BATCHES) await act.onToolResult(call, { ok: true });

    // Assert
    deepStrictEqual(heard, NODE_EDITORS_AND_BATCHES_HEARD);
  });

  it("hands the result to the callbacks it wraps and answers what they answer", async () => {
    // Arrange
    const received: unknown[] = [];
    const act = reportingWrites(inner(received), () => undefined).forAct("acceptEdits", true);

    // Act
    const answer = await act.onToolResult({ name: "file_write", input: { path: "src/a.ts" } }, GATE_REFUSAL);

    // Assert
    deepStrictEqual(received, [GATE_REFUSAL]);
    deepStrictEqual(answer, { context: "seen" });
  });

  it("leaves onToolCall to the callbacks it wraps", async () => {
    // Arrange
    const act = reportingWrites(inner(), () => undefined).forAct("acceptEdits", true);

    // Act
    const verdict = await act.onToolCall({ name: "file_write", input: { path: "src/a.ts" } });

    // Assert
    strictEqual(verdict, "allow");
  });
});

describe("refusedResult", () => {
  for (const c of REFUSED_CASES) {
    it(c.name, () => {
      // Arrange
      const { result } = c;

      // Act
      const refused = refusedResult(result);

      // Assert
      strictEqual(refused, c.expected);
    });
  }
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
