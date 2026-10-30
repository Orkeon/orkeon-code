// The recorder of a turn's tool calls, over the shared memory's guard it rides beside. Run:
//   node --test tests/shared/application/dev/tool-trace-recorder.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { memoryGuardCallbacks } from "../../../../src/shared/application/dev/tool-callbacks.ts";
import { createToolTrace, tracedCallbacks } from "../../../../src/shared/application/dev/tool-trace-recorder.ts";
import { TOOL_TRACE_MARKER } from "../../../../src/shared/domain/tool-trace.ts";

describe("tracedCallbacks", () => {
  it("records each result the act hands back", async () => {
    // Arrange
    const trace = createToolTrace();
    const act = tracedCallbacks(memoryGuardCallbacks(async () => "mem"), trace).forAct("default", true);

    // Act
    await act.onToolResult({ name: "grep", input: { path: "src" } }, { total_matches: 3, files_matched: 2 });

    // Assert
    strictEqual(trace.take(), `${TOOL_TRACE_MARKER} The tool calls of the answer below (material: what was called, ` +
      "not what it returned):\n- grep(path=src) → 3 matches in 2 files");
  });

  it("keeps the verdict of the callbacks it wraps", async () => {
    // Arrange
    const trace = createToolTrace();
    const act = tracedCallbacks(memoryGuardCallbacks(async () => "mem"), trace).forAct("default", true);

    // Act
    const verdict = await act.onToolCall({ name: "file_read", input: { path: "a.ts" } });

    // Assert
    deepStrictEqual(verdict, "allow");
  });
});

describe("createToolTrace", () => {
  it("forgets the calls it gave", () => {
    // Arrange
    const trace = createToolTrace();
    trace.record("grep", { path: "src" }, null);
    trace.take();

    // Act
    const message = trace.take();

    // Assert
    strictEqual(message, null);
  });
});
