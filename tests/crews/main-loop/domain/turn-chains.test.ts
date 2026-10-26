// The two chains of checks around a main-loop turn, and their built-in guards. Run:
//   node --test src/crews/main-loop/domain/turn-chains.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  STOP_GUARDS, TURN_CONTEXT_MARKER, TURN_START_GUARDS, buildStopRetryPrompt, buildTurnContextMessage,
  readClosingLine, refusedTurnText, runChain,
} from "../../../../src/crews/main-loop/domain/turn-chains.ts";
import {
  FAILING_GUARD, MISSING_CLOSING_LINE_FACTS, NO_CLOSING_LINE_VALUES, START_SCRIPT_CONTEXT, START_WITHOUT_SCRIPT,
  START_WITH_SCRIPT, STOP_CASES, guard,
} from "./turn-chains.fixtures.ts";

describe("runChain", () => {
  it("runs every guard in order and gathers their context lines when none refuses", () => {
    // Arrange
    const seen: string[] = [];
    const guards = [
      guard("a", { decision: "allow", context: ["one", " "] }, seen),
      guard("b", { decision: "block", context: ["two"] }, seen),
    ];

    // Act
    const out = runChain("turn-start", guards, "facts");

    // Assert
    deepStrictEqual(seen, ["a", "b"]);
    deepStrictEqual(out, { context: ["one", "two"] });
  });

  it("stops at the first deny of turn-start, with the context gathered so far", () => {
    // Arrange
    const seen: string[] = [];
    const guards = [
      guard("a", { decision: "allow", context: ["one"] }, seen),
      guard("b", { decision: "deny", reason: "no", context: ["two"] }, seen),
      guard("c", { decision: "deny" }, seen),
    ];

    // Act
    const out = runChain("turn-start", guards, "facts");

    // Assert
    deepStrictEqual(seen, ["a", "b"]);
    deepStrictEqual(out, { refusedBy: "b", reason: "no", context: ["one", "two"] });
  });

  it("stops at the first block of stop, and names the guard when it gave no reason", () => {
    // Arrange
    const seen: string[] = [];
    const guards = [guard("x", { decision: "block" }, seen), guard("y", { decision: "block" }, seen)];

    // Act
    const out = runChain("stop", guards, "f");

    // Assert
    deepStrictEqual(out, { refusedBy: "x", reason: "refused by x", context: [] });
    deepStrictEqual(seen, ["x"]);
  });

  it("counts a guard that throws on stop as a refusal naming it", () => {
    // Arrange
    const guards = [FAILING_GUARD];

    // Act
    const out = runChain("stop", guards, "f");

    // Assert
    deepStrictEqual(out, { refusedBy: "broken", reason: "the check failed: boom", context: [] });
  });

  it("counts a guard that throws on turn-start as a refusal naming it", () => {
    // Arrange
    const guards = [FAILING_GUARD];

    // Act
    const out = runChain("turn-start", guards, "f");

    // Assert
    strictEqual(out.refusedBy, "broken");
  });
});

describe("the built-in guards", () => {
  it("turn-start adds nothing without a start script", () => {
    // Arrange
    const facts = START_WITHOUT_SCRIPT;

    // Act
    const out = runChain("turn-start", TURN_START_GUARDS, facts);

    // Assert
    deepStrictEqual(out, { context: [] });
  });

  it("turn-start adds the start script's lines", () => {
    // Arrange
    const facts = START_WITH_SCRIPT;

    // Act
    const out = runChain("turn-start", TURN_START_GUARDS, facts);

    // Assert
    deepStrictEqual(out, { context: START_SCRIPT_CONTEXT });
  });

  for (const c of STOP_CASES) {
    it(`stop ${c.name}`, () => {
      // Arrange
      const { facts, refusedBy } = c;

      // Act
      const out = runChain("stop", STOP_GUARDS, facts);

      // Assert
      strictEqual(out.refusedBy, refusedBy);
    });
  }

  it("stop says which closing line the answer lacks", () => {
    // Arrange
    const facts = MISSING_CLOSING_LINE_FACTS;

    // Act
    const out = runChain("stop", STOP_GUARDS, facts);

    // Assert
    strictEqual(out.reason, "the answer has no line starting with 'DONE': end it with that line");
  });
});

describe("the texts of the chains", () => {
  it("marks the context message and puts its lines after the marker line", () => {
    // Arrange
    const lines = ["a", "b"];

    // Act
    const msg = buildTurnContextMessage(lines);

    // Assert
    ok(msg.startsWith(`${TURN_CONTEXT_MARKER} `), `the message does not open with the marker: ${msg}`);
    ok(msg.endsWith("\na\nb"), `the message does not end with its lines: ${msg}`);
  });

  it("builds the retry prompt from the request, the reason and the empty previous answer", () => {
    // Arrange
    const prompt = "P";

    // Act
    const retry = buildStopRetryPrompt(prompt, "", "why");

    // Assert
    ok(
      retry.startsWith("P\n\n[stop-check] Your previous answer to this request was sent back: why.\n"),
      `the retry prompt does not open with the request and the reason: ${retry}`,
    );
    ok(retry.includes("Previous answer:\n(empty)\n[/stop-check]"), `the retry prompt lacks the empty previous answer: ${retry}`);
  });

  it("builds the refusal line from the guard and its reason", () => {
    // Arrange
    const outcome = { refusedBy: "g", reason: "r", context: [] };

    // Act
    const text = refusedTurnText(outcome);

    // Assert
    strictEqual(text, "turn refused (g): r");
  });

  it("reads closingLine as its one non-blank line, trimmed", () => {
    // Arrange
    const value = " DONE ";

    // Act
    const line = readClosingLine(value);

    // Assert
    strictEqual(line, "DONE");
  });

  for (const value of NO_CLOSING_LINE_VALUES) {
    it(`reads no closingLine from ${JSON.stringify(value)}`, () => {
      // Arrange
      const raw = value;

      // Act
      const line = readClosingLine(raw);

      // Assert
      strictEqual(line, null);
    });
  }
});
