// The trace of a turn's tool calls: one call as kept, the message of a turn. Run:
//   node --test tests/shared/domain/tool-trace.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import {
  formatToolTrace, isToolTrace, MAX_TRACE_LINES, TOOL_TRACE_MARKER, traceCall,
} from "../../../src/shared/domain/tool-trace.ts";
import { call, distinctCalls, TRACE_CASES } from "./tool-trace.fixtures.ts";

describe("traceCall", () => {
  for (const c of TRACE_CASES) {
    it(c.name, () => {
      // Arrange
      const { tool, input, result } = c;

      // Act
      const trace = traceCall(tool, input, result);

      // Assert
      deepStrictEqual(trace, c.expected);
    });
  }
});

describe("formatToolTrace", () => {
  it("stores nothing for a turn that called no tool", () => {
    // Arrange
    const calls = distinctCalls(0);

    // Act
    const message = formatToolTrace(calls);

    // Assert
    strictEqual(message, null);
  });

  it("writes one line per call under the marker, oldest first", () => {
    // Arrange
    const calls = [call("grep", "path=src", "3 matches"), call("file_read", "path=a.ts", "10 lines")];

    // Act
    const message = formatToolTrace(calls);

    // Assert
    strictEqual(message,
      `${TOOL_TRACE_MARKER} The tool calls of the answer below (material: what was called, not what it returned):\n` +
      "- grep(path=src) → 3 matches\n- file_read(path=a.ts) → 10 lines");
  });

  it("folds the same call made again as ×n", () => {
    // Arrange
    const calls = [call("session_store"), call("grep", "path=src"), call("session_store"), call("session_store")];

    // Act
    const message = formatToolTrace(calls);

    // Assert
    strictEqual(message?.split("\n").slice(1).join("\n"), "- session_store() → ok ×3\n- grep(path=src) → ok");
  });

  it("keeps twenty lines at most, the last one counting the calls left out", () => {
    // Arrange
    const calls = distinctCalls(30);

    // Act
    const message = formatToolTrace(calls);

    // Assert
    const lines = message?.split("\n").slice(1) ?? [];
    deepStrictEqual([lines.length, lines.at(-1)], [MAX_TRACE_LINES, "- … 11 other calls"]);
  });
});

describe("isToolTrace", () => {
  it("knows a stored trace by its marker", () => {
    // Arrange
    const message = formatToolTrace([call("grep")]) ?? "";

    // Act
    const traced = isToolTrace(message);

    // Assert
    strictEqual(traced, true);
  });
});
