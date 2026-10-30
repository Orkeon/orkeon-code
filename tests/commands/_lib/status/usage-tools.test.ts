// /usage tools [text]: the session's [tools] messages under their requests. Run:
//   node --test tests/commands/_lib/status/usage-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { NO_TOOL_TRACE, runUsageTools, toolTraceLines } from "../../../../src/commands/_lib/status/usage-tools.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";
import { ALL_TRACE_LINES, TRACED_SESSION } from "./usage-tools.fixtures.ts";

describe("toolTraceLines", () => {
  it("lists every traced turn's calls under its request, marked messages aside", () => {
    // Arrange
    const messages = TRACED_SESSION;

    // Act
    const lines = toolTraceLines(messages, "");

    // Assert
    deepStrictEqual(lines, ALL_TRACE_LINES);
  });

  it("keeps the calls holding the text, whatever its case", () => {
    // Arrange
    const messages = TRACED_SESSION;

    // Act
    const lines = toolTraceLines(messages, "GREP");

    // Assert
    deepStrictEqual(lines, ALL_TRACE_LINES.slice(0, 2));
  });
});

describe("runUsageTools", () => {
  it("says no call was recorded in a session without a trace", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.messages = [{ role: "user", content: "hello" }, { role: "assistant", content: "hi" }];

    // Act
    const view = await runUsageTools("", { session });

    // Assert
    deepStrictEqual(view, { text: NO_TOOL_TRACE });
  });

  it("names the text no call holds", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.messages = TRACED_SESSION;

    // Act
    const view = await runUsageTools(" rag_search ", { session });

    // Assert
    deepStrictEqual(view, { text: "no tool call holds 'rag_search' in this session" });
  });

  it("reads an unavailable session as one without a trace", async () => {
    // Arrange
    const session = new FakeSessionStore();
    session.failure = new Error("no session tools");

    // Act
    const view = await runUsageTools("", { session });

    // Assert
    deepStrictEqual(view, { text: NO_TOOL_TRACE });
  });
});
